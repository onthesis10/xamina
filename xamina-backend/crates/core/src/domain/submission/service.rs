use std::collections::{HashMap, HashSet};

use chrono::{Duration, Utc};
use rand::seq::SliceRandom;
use redis::AsyncCommands;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    domain::{
        certificate::service::CertificateService, notification::service::NotificationService,
    },
    error::CoreError,
};

use super::{
    dto::{
        AnomalyPayload, LogAnomalyResponse, SessionQuestionDto, StartSubmissionDto,
        StudentExamListItem, SubmissionAnswerDto, SubmissionResultDto, SubmissionResultItem,
        SubmissionSessionDto, UpsertAnswersPayload, UpsertAnswersResponse,
    },
    models::{
        ExamStartRow, ExamSubmissionRow, InternalResult, QuestionRow, SnapshotQuestion,
        StudentExamRow, SubmissionAnswerRow, SubmissionRow,
    },
    repository::SubmissionRepository,
};

const TIMER_PREFIX: &str = "submission:timer:";

#[derive(Debug, Clone)]
pub struct SubmissionService {
    repo: SubmissionRepository,
    redis: redis::Client,
    notification: NotificationService,
    certificate: CertificateService,
}

impl SubmissionService {
    pub fn new(
        repo: SubmissionRepository,
        redis: redis::Client,
        notification: NotificationService,
        certificate: CertificateService,
    ) -> Self {
        Self {
            repo,
            redis,
            notification,
            certificate,
        }
    }

    pub async fn start_exam_session(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        exam_id: Uuid,
    ) -> Result<StartSubmissionDto, CoreError> {
        let exam = sqlx::query_as::<_, ExamStartRow>(
            "SELECT id, tenant_id, title, duration_minutes, pass_score, status, shuffle_questions,
                    shuffle_options, start_at, end_at
             FROM exams
             WHERE id = $1 AND tenant_id = $2",
        )
        .bind(exam_id)
        .bind(tenant_id)
        .fetch_optional(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam"))?
        .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Exam not found"))?;

        if exam.status != "published" {
            return Err(CoreError::bad_request(
                "EXAM_NOT_AVAILABLE",
                "Exam is not published",
            ));
        }

        let now = Utc::now();
        let (start_at, end_at) = match (exam.start_at, exam.end_at) {
            (Some(start), Some(end)) => (start, end),
            _ => {
                return Err(CoreError::bad_request(
                    "EXAM_NOT_AVAILABLE",
                    "Exam schedule is incomplete",
                ));
            }
        };

        if now < start_at || now >= end_at {
            return Err(CoreError::bad_request(
                "EXAM_NOT_AVAILABLE",
                "Exam is outside active schedule window",
            ));
        }

        let existing = sqlx::query_as::<_, SubmissionRow>(
            "SELECT id, tenant_id, exam_id, student_id, status, started_at, finished_at, deadline_at,
                    question_order_jsonb, score::float8 AS score, correct_count, total_questions
             FROM submissions
             WHERE exam_id = $1 AND student_id = $2 AND tenant_id = $3",
        )
        .bind(exam.id)
        .bind(student_id)
        .bind(tenant_id)
        .fetch_optional(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load submission"))?;

        if let Some(submission) = existing {
            if submission.status == "in_progress" {
                let remaining = self.get_remaining_seconds(&submission).await?;
                if remaining <= 0 {
                    let _ = self
                        .evaluate_and_finalize_submission(&submission, "auto_finished")
                        .await?;
                    return Err(CoreError::bad_request(
                        "ATTEMPT_FINALIZED",
                        "Submission already finalized",
                    ));
                }
                return Ok(StartSubmissionDto {
                    submission_id: submission.id,
                    status: submission.status,
                    remaining_seconds: remaining,
                    resumed: true,
                });
            }

            return Err(CoreError::bad_request(
                "ATTEMPT_FINALIZED",
                "Submission already finalized",
            ));
        }

        let mut questions = sqlx::query_as::<_, QuestionRow>(
            "SELECT q.id, q.type, q.content, q.options_jsonb, q.answer_key, q.topic, q.difficulty, q.image_url
             FROM exam_questions eq
             JOIN questions q ON q.id = eq.question_id
             WHERE eq.exam_id = $1 AND q.tenant_id = $2
             ORDER BY eq.order_no ASC",
        )
        .bind(exam.id)
        .bind(tenant_id)
        .fetch_all(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam questions"))?;

        if questions.is_empty() {
            return Err(CoreError::bad_request(
                "EXAM_NOT_AVAILABLE",
                "Exam has no questions",
            ));
        }

        let snapshot_questions: Vec<SnapshotQuestion> = {
            let mut rng = rand::thread_rng();
            if exam.shuffle_questions {
                questions.shuffle(&mut rng);
            }

            questions
                .into_iter()
                .map(|mut row| {
                    if exam.shuffle_options {
                        if let Some(arr) = row.options_jsonb.as_array_mut() {
                            arr.shuffle(&mut rng);
                        }
                    }
                    SnapshotQuestion {
                        question_id: row.id,
                        r#type: row.r#type,
                        content: row.content,
                        options_jsonb: row.options_jsonb,
                        answer_key: row.answer_key,
                        topic: row.topic,
                        difficulty: row.difficulty,
                        image_url: row.image_url,
                    }
                })
                .collect()
        };

        let base_deadline = now + Duration::minutes(exam.duration_minutes as i64);
        let deadline_at = if base_deadline < end_at {
            base_deadline
        } else {
            end_at
        };
        let remaining_seconds = (deadline_at - now).num_seconds().max(0);

        if remaining_seconds <= 0 {
            return Err(CoreError::bad_request(
                "EXAM_NOT_AVAILABLE",
                "Exam duration already elapsed",
            ));
        }

        let snapshot_json = serde_json::to_value(&snapshot_questions).map_err(|_| {
            CoreError::internal("SERIALIZE_FAILED", "Failed to store question snapshot")
        })?;

        let submission = sqlx::query_as::<_, SubmissionRow>(
            "INSERT INTO submissions
             (tenant_id, exam_id, student_id, status, started_at, deadline_at, question_order_jsonb)
             VALUES ($1, $2, $3, 'in_progress', NOW(), $4, $5)
             RETURNING id, tenant_id, exam_id, student_id, status, started_at, finished_at, deadline_at,
                       question_order_jsonb, score::float8 AS score, correct_count, total_questions",
        )
        .bind(tenant_id)
        .bind(exam.id)
        .bind(student_id)
        .bind(deadline_at)
        .bind(snapshot_json)
        .fetch_one(&self.repo.pool)
        .await
        .map_err(|_| CoreError::bad_request("CREATE_SUBMISSION_FAILED", "Failed to start exam"))?;

        self.set_timer_seconds(submission.tenant_id, submission.id, remaining_seconds)
            .await?;

        Ok(StartSubmissionDto {
            submission_id: submission.id,
            status: submission.status,
            remaining_seconds,
            resumed: false,
        })
    }

    pub async fn list_my_exams(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<Vec<StudentExamListItem>, CoreError> {
        let rows = sqlx::query_as::<_, StudentExamRow>(
            "SELECT e.id AS exam_id,
                    e.title,
                    e.start_at,
                    e.end_at,
                    e.duration_minutes,
                    e.pass_score,
                    s.id AS submission_id,
                    s.status AS submission_status
             FROM exams e
             LEFT JOIN submissions s
               ON s.exam_id = e.id
              AND s.student_id = $2
              AND s.tenant_id = e.tenant_id
             WHERE e.tenant_id = $1
               AND e.status = 'published'
             ORDER BY e.start_at ASC NULLS LAST, e.created_at DESC",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_all(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to list exams"))?;

        let now = Utc::now();
        Ok(rows
            .into_iter()
            .map(|row| {
                let mut submission_status = row
                    .submission_status
                    .clone()
                    .unwrap_or_else(|| "not_started".to_string());
                if submission_status == "auto_finished" {
                    submission_status = "finished".to_string();
                }

                let in_window = matches!((row.start_at, row.end_at), (Some(start), Some(end)) if now >= start && now < end);
                let can_start = in_window && (submission_status == "not_started" || submission_status == "in_progress");

                StudentExamListItem {
                    exam_id: row.exam_id,
                    title: row.title,
                    start_at: row.start_at,
                    end_at: row.end_at,
                    duration_minutes: row.duration_minutes,
                    pass_score: row.pass_score,
                    submission_id: row.submission_id,
                    submission_status,
                    can_start,
                }
            })
            .collect())
    }

    pub async fn get_submission_session(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        submission_id: Uuid,
    ) -> Result<SubmissionSessionDto, CoreError> {
        let mut submission = self
            .fetch_submission(submission_id, tenant_id, student_id)
            .await?;
        let mut remaining_seconds = self.get_remaining_seconds(&submission).await?;

        if submission.status == "in_progress" && remaining_seconds <= 0 {
            let _ = self
                .evaluate_and_finalize_submission(&submission, "auto_finished")
                .await?;
            submission = self
                .fetch_submission(submission_id, tenant_id, student_id)
                .await?;
            remaining_seconds = 0;
        }

        let exam_title = sqlx::query_scalar::<_, String>(
            "SELECT title FROM exams WHERE id = $1 AND tenant_id = $2",
        )
        .bind(submission.exam_id)
        .bind(tenant_id)
        .fetch_one(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam"))?;

        let snapshot_questions = self.parse_snapshot_questions(&submission.question_order_jsonb)?;
        let answers = self.fetch_submission_answers(submission.id).await?;

        Ok(SubmissionSessionDto {
            submission_id: submission.id,
            exam_id: submission.exam_id,
            exam_title,
            status: submission.status,
            started_at: submission.started_at,
            deadline_at: submission.deadline_at,
            finished_at: submission.finished_at,
            remaining_seconds,
            questions: self.to_public_questions(&snapshot_questions),
            answers: answers
                .into_iter()
                .map(|it| SubmissionAnswerDto {
                    question_id: it.question_id,
                    answer_jsonb: it.answer_jsonb,
                    is_bookmarked: it.is_bookmarked,
                    updated_at: it.updated_at,
                })
                .collect(),
        })
    }

    pub async fn upsert_submission_answers(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        submission_id: Uuid,
        payload: UpsertAnswersPayload,
    ) -> Result<UpsertAnswersResponse, CoreError> {
        let submission = self
            .fetch_submission(submission_id, tenant_id, student_id)
            .await?;
        if submission.status != "in_progress" {
            return Err(CoreError::bad_request(
                "SUBMISSION_FINISHED",
                "Submission already finished",
            ));
        }

        let remaining_seconds = self.get_remaining_seconds(&submission).await?;
        if remaining_seconds <= 0 {
            let _ = self
                .evaluate_and_finalize_submission(&submission, "auto_finished")
                .await?;
            return Err(CoreError::bad_request(
                "SUBMISSION_FINISHED",
                "Submission already finished",
            ));
        }

        let mut inputs = payload.answers.unwrap_or_default();
        if let Some(question_id) = payload.question_id {
            inputs.push(super::dto::AnswerInput {
                question_id,
                answer: payload.answer,
                is_bookmarked: payload.is_bookmarked,
            });
        }

        if inputs.is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "answers payload cannot be empty",
            ));
        }

        let snapshot_questions = self.parse_snapshot_questions(&submission.question_order_jsonb)?;
        let valid_question_ids: HashSet<Uuid> =
            snapshot_questions.iter().map(|q| q.question_id).collect();
        if inputs
            .iter()
            .any(|item| !valid_question_ids.contains(&item.question_id))
        {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "question_id is not part of this submission",
            ));
        }

        for item in &inputs {
            sqlx::query(
                "INSERT INTO submission_answers (submission_id, question_id, answer_jsonb, is_bookmarked, updated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (submission_id, question_id)
                 DO UPDATE SET answer_jsonb = EXCLUDED.answer_jsonb,
                               is_bookmarked = EXCLUDED.is_bookmarked,
                               updated_at = NOW()",
            )
            .bind(submission.id)
            .bind(item.question_id)
            .bind(item.answer.clone().unwrap_or(Value::Null))
            .bind(item.is_bookmarked.unwrap_or(false))
            .execute(&self.repo.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to save answer"))?;
        }

        Ok(UpsertAnswersResponse {
            submission_id: submission.id,
            saved_count: inputs.len(),
        })
    }

    pub async fn log_submission_anomaly(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        submission_id: Uuid,
        payload: AnomalyPayload,
    ) -> Result<LogAnomalyResponse, CoreError> {
        if payload.event_type.trim().is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "event_type is required",
            ));
        }

        let submission = self
            .fetch_submission(submission_id, tenant_id, student_id)
            .await?;
        if submission.status != "in_progress" {
            return Err(CoreError::bad_request(
                "SUBMISSION_FINISHED",
                "Submission already finished",
            ));
        }

        let remaining_seconds = self.get_remaining_seconds(&submission).await?;
        if remaining_seconds <= 0 {
            let _ = self
                .evaluate_and_finalize_submission(&submission, "auto_finished")
                .await?;
            return Err(CoreError::bad_request(
                "SUBMISSION_FINISHED",
                "Submission already finished",
            ));
        }

        let anomaly_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO submission_anomalies (id, submission_id, event_type, payload_jsonb)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(anomaly_id)
        .bind(submission.id)
        .bind(payload.event_type)
        .bind(payload.payload_jsonb.unwrap_or_else(|| json!({})))
        .execute(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to log anomaly"))?;

        Ok(LogAnomalyResponse {
            id: anomaly_id,
            submission_id: submission.id,
        })
    }

    pub async fn finish_submission(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        submission_id: Uuid,
    ) -> Result<SubmissionResultDto, CoreError> {
        let submission = self
            .fetch_submission(submission_id, tenant_id, student_id)
            .await?;
        if submission.status == "finished" || submission.status == "auto_finished" {
            return self.build_result_from_existing(&submission).await;
        }

        let remaining_seconds = self.get_remaining_seconds(&submission).await?;
        let forced_auto = remaining_seconds <= 0 || Utc::now() >= submission.deadline_at;
        let status = if forced_auto {
            "auto_finished"
        } else {
            "finished"
        };
        self.evaluate_and_finalize_submission(&submission, status)
            .await
    }

    pub async fn force_finish_submission(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        student_id: Uuid,
    ) -> Result<SubmissionResultDto, CoreError> {
        let submission = self
            .fetch_latest_submission_by_exam_student(tenant_id, exam_id, student_id)
            .await?;

        if submission.status == "finished" || submission.status == "auto_finished" {
            return self.build_result_from_existing(&submission).await;
        }

        let remaining_seconds = self.get_remaining_seconds(&submission).await?;
        let forced_auto = remaining_seconds <= 0 || Utc::now() >= submission.deadline_at;
        let status = if forced_auto {
            "auto_finished"
        } else {
            "finished"
        };
        self.evaluate_and_finalize_submission(&submission, status)
            .await
    }

    pub async fn get_submission_result(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        submission_id: Uuid,
    ) -> Result<SubmissionResultDto, CoreError> {
        let mut submission = self
            .fetch_submission(submission_id, tenant_id, student_id)
            .await?;
        if submission.status == "in_progress" {
            let remaining_seconds = self.get_remaining_seconds(&submission).await?;
            if remaining_seconds <= 0 {
                let _ = self
                    .evaluate_and_finalize_submission(&submission, "auto_finished")
                    .await?;
                submission = self
                    .fetch_submission(submission_id, tenant_id, student_id)
                    .await?;
            }
        }

        if submission.status == "in_progress" {
            return Err(CoreError::bad_request(
                "SUBMISSION_NOT_FINISHED",
                "Submission is still in progress",
            ));
        }

        self.build_result_from_existing(&submission).await
    }

    fn timer_key(&self, tenant_id: Uuid, submission_id: Uuid) -> String {
        format!("{TIMER_PREFIX}{tenant_id}:{submission_id}")
    }

    fn to_public_questions(&self, snapshot: &[SnapshotQuestion]) -> Vec<SessionQuestionDto> {
        snapshot
            .iter()
            .map(|item| SessionQuestionDto {
                question_id: item.question_id,
                r#type: item.r#type.clone(),
                content: item.content.clone(),
                options_jsonb: item.options_jsonb.clone(),
                topic: item.topic.clone(),
                difficulty: item.difficulty.clone(),
                image_url: item.image_url.clone(),
            })
            .collect()
    }

    fn parse_snapshot_questions(&self, raw: &Value) -> Result<Vec<SnapshotQuestion>, CoreError> {
        serde_json::from_value::<Vec<SnapshotQuestion>>(raw.clone())
            .map_err(|_| CoreError::internal("DB_ERROR", "Invalid submission question snapshot"))
    }

    fn normalize_text(&self, value: &str) -> String {
        value
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    }

    fn answer_to_normalized_text(&self, answer: &Value) -> Option<String> {
        if let Some(s) = answer.as_str() {
            return Some(self.normalize_text(s));
        }
        if let Some(n) = answer.as_i64() {
            return Some(self.normalize_text(&n.to_string()));
        }
        if let Some(n) = answer.as_u64() {
            return Some(self.normalize_text(&n.to_string()));
        }
        if let Some(n) = answer.as_f64() {
            return Some(self.normalize_text(&n.to_string()));
        }
        if let Some(b) = answer.as_bool() {
            return Some(self.normalize_text(&b.to_string()));
        }
        None
    }

    fn is_answer_correct(&self, question: &SnapshotQuestion, submitted: &Value) -> bool {
        match question.r#type.as_str() {
            "multiple_choice" => {
                let expected = question.answer_key.as_str().map(|s| self.normalize_text(s));
                let got = self.answer_to_normalized_text(submitted);
                matches!((expected, got), (Some(a), Some(b)) if a == b)
            }
            "true_false" => {
                let expected = question.answer_key.as_bool();
                let got = submitted.as_bool();
                matches!((expected, got), (Some(a), Some(b)) if a == b)
            }
            "short_answer" => {
                let got = self.answer_to_normalized_text(submitted);
                if got.is_none() {
                    return false;
                }
                let got = got.unwrap_or_default();
                if let Some(expected_single) = question.answer_key.as_str() {
                    return self.normalize_text(expected_single) == got;
                }
                if let Some(expected_arr) = question.answer_key.as_array() {
                    return expected_arr
                        .iter()
                        .filter_map(|item| item.as_str())
                        .map(|s| self.normalize_text(s))
                        .any(|candidate| candidate == got);
                }
                false
            }
            _ => false,
        }
    }

    fn evaluate_submission(
        &self,
        snapshot: &[SnapshotQuestion],
        answers: &HashMap<Uuid, Value>,
    ) -> InternalResult {
        let mut correct_count: i32 = 0;
        let mut breakdown: Vec<SubmissionResultItem> = Vec::with_capacity(snapshot.len());

        for question in snapshot {
            let submitted = answers
                .get(&question.question_id)
                .cloned()
                .unwrap_or(Value::Null);
            let is_correct = self.is_answer_correct(question, &submitted);
            if is_correct {
                correct_count += 1;
            }
            breakdown.push(SubmissionResultItem {
                question_id: question.question_id,
                question_type: question.r#type.clone(),
                is_correct,
                submitted_answer: submitted,
            });
        }

        let total_questions = snapshot.len() as i32;
        let score = if total_questions > 0 {
            ((correct_count as f64 / total_questions as f64) * 10000.0).round() / 100.0
        } else {
            0.0
        };

        InternalResult {
            score,
            correct_count,
            total_questions,
            breakdown,
        }
    }

    async fn fetch_submission_answers(
        &self,
        submission_id: Uuid,
    ) -> Result<Vec<SubmissionAnswerRow>, CoreError> {
        sqlx::query_as::<_, SubmissionAnswerRow>(
            "SELECT question_id, answer_jsonb, is_bookmarked, updated_at
             FROM submission_answers
             WHERE submission_id = $1
             ORDER BY updated_at DESC",
        )
        .bind(submission_id)
        .fetch_all(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load answers"))
    }

    async fn fetch_submission(
        &self,
        submission_id: Uuid,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<SubmissionRow, CoreError> {
        sqlx::query_as::<_, SubmissionRow>(
            "SELECT id, tenant_id, exam_id, student_id, status, started_at, finished_at, deadline_at,
                    question_order_jsonb, score::float8 AS score, correct_count, total_questions
             FROM submissions
             WHERE id = $1 AND tenant_id = $2 AND student_id = $3",
        )
        .bind(submission_id)
        .bind(tenant_id)
        .bind(student_id)
        .fetch_optional(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load submission"))?
        .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Submission not found"))
    }

    async fn fetch_latest_submission_by_exam_student(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        student_id: Uuid,
    ) -> Result<SubmissionRow, CoreError> {
        sqlx::query_as::<_, SubmissionRow>(
            "SELECT id, tenant_id, exam_id, student_id, status, started_at, finished_at, deadline_at,
                    question_order_jsonb, score::float8 AS score, correct_count, total_questions
             FROM submissions
             WHERE tenant_id = $1 AND exam_id = $2 AND student_id = $3
             ORDER BY started_at DESC
             LIMIT 1",
        )
        .bind(tenant_id)
        .bind(exam_id)
        .bind(student_id)
        .fetch_optional(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load submission"))?
        .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Submission not found"))
    }

    async fn set_timer_seconds(
        &self,
        tenant_id: Uuid,
        submission_id: Uuid,
        seconds: i64,
    ) -> Result<(), CoreError> {
        if seconds <= 0 {
            return Ok(());
        }
        let mut redis_conn = self
            .redis
            .get_multiplexed_async_connection()
            .await
            .map_err(|_| CoreError::internal("REDIS_ERROR", "Failed to connect redis"))?;
        let key = self.timer_key(tenant_id, submission_id);
        let _: () = redis_conn
            .set_ex(key, seconds, seconds as u64)
            .await
            .map_err(|_| CoreError::internal("REDIS_ERROR", "Failed to set timer"))?;
        Ok(())
    }

    async fn clear_timer(&self, tenant_id: Uuid, submission_id: Uuid) {
        if let Ok(mut redis_conn) = self.redis.get_multiplexed_async_connection().await {
            let key = self.timer_key(tenant_id, submission_id);
            let _ = redis_conn.del::<_, i32>(key).await;
        }
    }

    async fn get_remaining_seconds(&self, submission: &SubmissionRow) -> Result<i64, CoreError> {
        if submission.status != "in_progress" {
            return Ok(0);
        }

        let now = Utc::now();
        let deadline_remaining = (submission.deadline_at - now).num_seconds().max(0);

        let mut redis_conn = self
            .redis
            .get_multiplexed_async_connection()
            .await
            .map_err(|_| CoreError::internal("REDIS_ERROR", "Failed to connect redis"))?;
        let key = self.timer_key(submission.tenant_id, submission.id);
        let ttl: i64 = redis_conn
            .ttl(&key)
            .await
            .map_err(|_| CoreError::internal("REDIS_ERROR", "Failed to read timer"))?;

        if ttl >= 0 {
            return Ok(ttl);
        }

        if deadline_remaining > 0 {
            let _: () = redis_conn
                .set_ex(key, deadline_remaining, deadline_remaining as u64)
                .await
                .map_err(|_| CoreError::internal("REDIS_ERROR", "Failed to rehydrate timer"))?;
        }

        Ok(deadline_remaining)
    }

    async fn evaluate_and_finalize_submission(
        &self,
        submission: &SubmissionRow,
        status: &str,
    ) -> Result<SubmissionResultDto, CoreError> {
        let snapshot_questions = self.parse_snapshot_questions(&submission.question_order_jsonb)?;
        let answers = self.fetch_submission_answers(submission.id).await?;
        let answer_map: HashMap<Uuid, Value> = answers
            .iter()
            .map(|item| (item.question_id, item.answer_jsonb.clone()))
            .collect();

        let evaluation = self.evaluate_submission(&snapshot_questions, &answer_map);
        let finished_at = Utc::now();

        let _ = sqlx::query(
            "UPDATE submissions
             SET status = $1,
                 finished_at = COALESCE(finished_at, $2),
                 score = $3,
                 correct_count = $4,
                 total_questions = $5,
                 updated_at = NOW()
             WHERE id = $6 AND status = 'in_progress'",
        )
        .bind(status)
        .bind(finished_at)
        .bind(evaluation.score)
        .bind(evaluation.correct_count)
        .bind(evaluation.total_questions)
        .bind(submission.id)
        .execute(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to finalize submission"))?;

        self.clear_timer(submission.tenant_id, submission.id).await;

        let pass_score = sqlx::query_scalar::<_, i32>("SELECT pass_score FROM exams WHERE id = $1")
            .bind(submission.exam_id)
            .fetch_one(&self.repo.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load pass score"))?;

        let result = SubmissionResultDto {
            submission_id: submission.id,
            exam_id: submission.exam_id,
            status: status.to_string(),
            score: evaluation.score,
            correct_count: evaluation.correct_count,
            total_questions: evaluation.total_questions,
            pass_score,
            passed: evaluation.score >= pass_score as f64,
            finished_at: Some(finished_at),
            breakdown: evaluation.breakdown,
        };

        let _ = self
            .notification
            .notify_submission_finished(
                submission.tenant_id,
                submission.student_id,
                submission.exam_id,
                result.score,
                result.passed,
            )
            .await;

        if result.passed {
            if let Ok(Some(issue)) = self
                .certificate
                .issue_for_submission(submission.tenant_id, submission.id)
                .await
            {
                if issue.created {
                    if let Ok(delivery) = self
                        .notification
                        .notify_certificate_issued(
                            submission.tenant_id,
                            submission.student_id,
                            &issue.certificate,
                            &issue.exam_title,
                            &issue.student_email,
                        )
                        .await
                    {
                        if let Ok(mut redis_conn) =
                            self.redis.get_multiplexed_async_connection().await
                        {
                            if let Some(email_job_id) = delivery.email_job_id {
                                let _ = redis_conn
                                    .lpush::<_, _, i32>("jobs:email", email_job_id.to_string())
                                    .await;
                            }
                            if let Some(push_job_id) = delivery.push_job_id {
                                let _ = redis_conn
                                    .lpush::<_, _, i32>("jobs:push", push_job_id.to_string())
                                    .await;
                            }
                        }
                    }
                }
            }
        }

        Ok(result)
    }

    async fn build_result_from_existing(
        &self,
        submission: &SubmissionRow,
    ) -> Result<SubmissionResultDto, CoreError> {
        let snapshot_questions = self.parse_snapshot_questions(&submission.question_order_jsonb)?;
        let answers = self.fetch_submission_answers(submission.id).await?;
        let answer_map: HashMap<Uuid, Value> = answers
            .iter()
            .map(|item| (item.question_id, item.answer_jsonb.clone()))
            .collect();
        let evaluation = self.evaluate_submission(&snapshot_questions, &answer_map);

        let pass_score = sqlx::query_scalar::<_, i32>("SELECT pass_score FROM exams WHERE id = $1")
            .bind(submission.exam_id)
            .fetch_one(&self.repo.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load pass score"))?;

        Ok(SubmissionResultDto {
            submission_id: submission.id,
            exam_id: submission.exam_id,
            status: submission.status.clone(),
            score: submission.score.unwrap_or(evaluation.score),
            correct_count: if submission.total_questions > 0 {
                submission.correct_count
            } else {
                evaluation.correct_count
            },
            total_questions: if submission.total_questions > 0 {
                submission.total_questions
            } else {
                evaluation.total_questions
            },
            pass_score,
            passed: submission.score.unwrap_or(evaluation.score) >= pass_score as f64,
            finished_at: submission.finished_at,
            breakdown: evaluation.breakdown,
        })
    }

    /// List all submissions for an exam — teacher/admin monitor view
    pub async fn list_exam_submissions(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
    ) -> Result<Vec<super::dto::ExamSubmissionListItem>, CoreError> {
        let rows = sqlx::query_as::<_, ExamSubmissionRow>(
            "SELECT s.id AS submission_id,
                    s.student_id,
                    u.name AS student_name,
                    s.status,
                    (SELECT COUNT(*) FROM submission_answers sa WHERE sa.submission_id = s.id) AS answered_count,
                    (SELECT COUNT(*) FROM submission_anomalies an WHERE an.submission_id = s.id) AS anomaly_count,
                    s.started_at,
                    s.finished_at,
                    s.score::float8 AS score
             FROM submissions s
             JOIN users u ON u.id = s.student_id
             WHERE s.exam_id = $1 AND s.tenant_id = $2
             ORDER BY s.started_at ASC",
        )
        .bind(exam_id)
        .bind(tenant_id)
        .fetch_all(&self.repo.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to list exam submissions"))?;

        Ok(rows
            .into_iter()
            .map(|r| super::dto::ExamSubmissionListItem {
                submission_id: r.submission_id,
                student_id: r.student_id,
                student_name: r.student_name,
                status: r.status,
                answered_count: r.answered_count,
                anomaly_count: r.anomaly_count,
                started_at: r.started_at,
                finished_at: r.finished_at,
                score: r.score,
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use sqlx::postgres::PgPoolOptions;
    use uuid::Uuid;

    use super::SubmissionService;
    use crate::domain::{
        certificate::{repository::CertificateRepository, service::CertificateService},
        notification::{repository::NotificationRepository, service::NotificationService},
        submission::{models::SnapshotQuestion, repository::SubmissionRepository},
    };

    fn new_service() -> SubmissionService {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://postgres:postgres@localhost:5432/xamina")
            .expect("lazy pool");
        let repo = SubmissionRepository::new(pool.clone());
        let notification = NotificationService::new(NotificationRepository::new(pool));
        let certificate = CertificateService::new(CertificateRepository::new(repo.pool.clone()));
        let redis = redis::Client::open("redis://127.0.0.1/").expect("redis client");
        SubmissionService::new(repo, redis, notification, certificate)
    }

    fn mc_question(answer_key: &str) -> SnapshotQuestion {
        SnapshotQuestion {
            question_id: Uuid::new_v4(),
            r#type: "multiple_choice".to_string(),
            content: "Q".to_string(),
            options_jsonb: json!([{"id":"A","label":"A"},{"id":"B","label":"B"}]),
            answer_key: json!(answer_key),
            topic: None,
            difficulty: None,
            image_url: None,
        }
    }

    #[tokio::test]
    async fn normalize_text_should_trim_and_lowercase() {
        let service = new_service();
        let normalized = service.normalize_text("  Halo   DUNIA  ");
        assert_eq!(normalized, "halo dunia");
    }

    #[tokio::test]
    async fn multiple_choice_answer_check_should_be_case_insensitive() {
        let service = new_service();
        let question = mc_question("a");
        assert!(service.is_answer_correct(&question, &json!(" A ")));
        assert!(!service.is_answer_correct(&question, &json!("B")));
    }

    #[tokio::test]
    async fn true_false_answer_check_should_match_boolean() {
        let service = new_service();
        let question = SnapshotQuestion {
            question_id: Uuid::new_v4(),
            r#type: "true_false".to_string(),
            content: "Q".to_string(),
            options_jsonb: json!([{ "value": true }, { "value": false }]),
            answer_key: json!(true),
            topic: None,
            difficulty: None,
            image_url: None,
        };
        assert!(service.is_answer_correct(&question, &json!(true)));
        assert!(!service.is_answer_correct(&question, &json!(false)));
    }

    #[tokio::test]
    async fn short_answer_check_should_support_alias_array() {
        let service = new_service();
        let question = SnapshotQuestion {
            question_id: Uuid::new_v4(),
            r#type: "short_answer".to_string(),
            content: "Q".to_string(),
            options_jsonb: json!([]),
            answer_key: json!(["ibukota jakarta", "jakarta"]),
            topic: None,
            difficulty: None,
            image_url: None,
        };
        assert!(service.is_answer_correct(&question, &json!("Jakarta")));
        assert!(!service.is_answer_correct(&question, &json!("Bandung")));
    }

    #[tokio::test]
    async fn evaluate_submission_should_calculate_score_and_breakdown() {
        let service = new_service();
        let q1 = mc_question("A");
        let q2 = SnapshotQuestion {
            question_id: Uuid::new_v4(),
            r#type: "short_answer".to_string(),
            content: "Q2".to_string(),
            options_jsonb: json!([]),
            answer_key: json!("nusantara"),
            topic: None,
            difficulty: None,
            image_url: None,
        };

        let mut answers = std::collections::HashMap::new();
        answers.insert(q1.question_id, json!("A"));
        answers.insert(q2.question_id, json!("salah"));

        let result = service.evaluate_submission(&[q1, q2], &answers);
        assert_eq!(result.correct_count, 1);
        assert_eq!(result.total_questions, 2);
        assert!((result.score - 50.0).abs() < f64::EPSILON);
        assert_eq!(result.breakdown.len(), 2);
    }

    #[tokio::test]
    async fn parse_snapshot_questions_should_reject_invalid_json_shape() {
        let service = new_service();
        let err = service
            .parse_snapshot_questions(&json!({"not":"an array"}))
            .expect_err("must fail");
        assert_eq!(err.code, "DB_ERROR");
    }
}
