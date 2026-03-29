use std::collections::{BTreeMap, HashMap};

use serde_json::Value;
use uuid::Uuid;

use crate::{domain::submission::models::SnapshotQuestion, error::CoreError};

use super::{
    dto::{
        AdminSummaryDto, ClassResultQuery, DashboardStatsDto, DashboardSummaryDto, ExamInsightsDto,
        ExamInsightsQuery, ExamInsightsSummaryDto, GuruSummaryDto, ItemAnalysisRowDto, PageMeta,
        ScoreDistributionBinDto, StudentSummaryDto, TimeSeriesPerformancePointDto,
    },
    models::ClassResultPage,
    repository::AnalyticsRepository,
};

#[derive(Debug, Clone)]
pub struct AnalyticsService {
    repo: AnalyticsRepository,
}

#[derive(Debug, Clone)]
struct DayAggregate {
    submissions: i64,
    score_sum: f64,
    pass_count: i64,
}

#[derive(Debug, Clone)]
struct ItemAccumulator {
    question_type: String,
    question_content: String,
    total_attempts: i64,
    correct_attempts: i64,
    correct_scores: Vec<f64>,
    incorrect_scores: Vec<f64>,
}

impl AnalyticsService {
    pub fn new(repo: AnalyticsRepository) -> Self {
        Self { repo }
    }

    pub async fn dashboard_summary(
        &self,
        tenant_id: Uuid,
        actor_id: Uuid,
        actor_role: &str,
    ) -> Result<DashboardSummaryDto, CoreError> {
        match actor_role {
            "admin" | "super_admin" => {
                let (
                    users_total,
                    classes_total,
                    exams_total,
                    submissions_total,
                    avg_score,
                    pass_rate,
                ) = self.repo.admin_totals(tenant_id).await?;
                let trend_7d = self.repo.trend_admin(tenant_id).await?;
                Ok(DashboardSummaryDto::Admin(AdminSummaryDto {
                    users_total,
                    classes_total,
                    exams_total,
                    submissions_total,
                    avg_score,
                    pass_rate,
                    trend_7d,
                }))
            }
            "guru" => {
                let (exams_total, published_exams_total, submissions_total, avg_score, pass_rate) =
                    self.repo.guru_totals(tenant_id, actor_id).await?;
                let trend_7d = self.repo.trend_guru(tenant_id, actor_id).await?;
                Ok(DashboardSummaryDto::Guru(GuruSummaryDto {
                    exams_total,
                    published_exams_total,
                    submissions_total,
                    avg_score,
                    pass_rate,
                    trend_7d,
                }))
            }
            "siswa" => {
                let (in_progress_count, finished_count, avg_score, recent_results, upcoming_exams) =
                    self.repo.student_summary(tenant_id, actor_id).await?;
                Ok(DashboardSummaryDto::Siswa(StudentSummaryDto {
                    in_progress_count,
                    finished_count,
                    avg_score,
                    recent_results,
                    upcoming_exams,
                }))
            }
            _ => Err(CoreError::forbidden("FORBIDDEN", "Unsupported role")),
        }
    }

    pub async fn class_results(
        &self,
        tenant_id: Uuid,
        actor_id: Uuid,
        actor_role: &str,
        query: ClassResultQuery,
    ) -> Result<ClassResultPage, CoreError> {
        if actor_role != "admin" && actor_role != "guru" && actor_role != "super_admin" {
            return Err(CoreError::forbidden(
                "FORBIDDEN",
                "Admin, guru, or super_admin role required",
            ));
        }
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * page_size;
        let total = self
            .repo
            .count_class_results(
                tenant_id,
                actor_role,
                actor_id,
                query.class_id,
                query.exam_id,
            )
            .await?;
        let rows = self
            .repo
            .class_results(
                tenant_id,
                actor_role,
                actor_id,
                query.class_id,
                query.exam_id,
                page_size,
                offset,
            )
            .await?;
        Ok(ClassResultPage {
            rows,
            meta: PageMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn exam_insights(
        &self,
        tenant_id: Uuid,
        actor_id: Uuid,
        actor_role: &str,
        query: ExamInsightsQuery,
    ) -> Result<ExamInsightsDto, CoreError> {
        if actor_role != "admin" && actor_role != "guru" && actor_role != "super_admin" {
            return Err(CoreError::forbidden(
                "FORBIDDEN",
                "Admin, guru, or super_admin role required",
            ));
        }

        let exam_id = query.exam_id.ok_or_else(|| {
            CoreError::bad_request("VALIDATION_ERROR", "exam_id is required for exam insights")
        })?;

        let exam = self
            .repo
            .find_exam_for_insights(tenant_id, exam_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Exam not found"))?;

        if actor_role == "guru" && exam.created_by != actor_id {
            return Err(CoreError::forbidden(
                "FORBIDDEN",
                "Guru can only access own exam insights",
            ));
        }

        let submissions = self
            .repo
            .list_exam_submissions_for_insights(tenant_id, exam_id, query.class_id)
            .await?;
        let submission_ids: Vec<Uuid> = submissions.iter().map(|row| row.submission_id).collect();
        let answer_rows = self
            .repo
            .list_submission_answers_for_insights(&submission_ids)
            .await?;

        let mut answers_by_submission: HashMap<Uuid, HashMap<Uuid, Value>> = HashMap::new();
        for row in answer_rows {
            answers_by_submission
                .entry(row.submission_id)
                .or_default()
                .insert(row.question_id, row.answer_jsonb);
        }

        let mut score_sum = 0.0_f64;
        let mut scores: Vec<f64> = Vec::with_capacity(submissions.len());
        let mut pass_count = 0_i64;
        let mut distribution_counts: [i64; 10] = [0; 10];
        let mut days: BTreeMap<chrono::NaiveDate, DayAggregate> = BTreeMap::new();
        let mut items: HashMap<Uuid, ItemAccumulator> = HashMap::new();

        for submission in &submissions {
            let score = submission.score.unwrap_or(0.0);
            score_sum += score;
            scores.push(score);
            if score >= exam.pass_score as f64 {
                pass_count += 1;
            }

            let clamped = score.clamp(0.0, 100.0);
            let index = if clamped >= 100.0 {
                9
            } else {
                (clamped / 10.0).floor() as usize
            };
            distribution_counts[index] += 1;

            if let Some(finished_at) = submission.finished_at {
                let day = finished_at.date_naive();
                let entry = days.entry(day).or_insert(DayAggregate {
                    submissions: 0,
                    score_sum: 0.0,
                    pass_count: 0,
                });
                entry.submissions += 1;
                entry.score_sum += score;
                if score >= exam.pass_score as f64 {
                    entry.pass_count += 1;
                }
            }

            let snapshot_questions =
                self.parse_snapshot_questions(&submission.question_order_jsonb)?;
            let answer_map = answers_by_submission.get(&submission.submission_id);

            for question in snapshot_questions {
                let submitted_answer = answer_map
                    .and_then(|answers| answers.get(&question.question_id))
                    .unwrap_or(&Value::Null);
                let is_correct = self.is_answer_correct(&question, submitted_answer);

                let entry = items
                    .entry(question.question_id)
                    .or_insert_with(|| ItemAccumulator {
                        question_type: question.r#type.clone(),
                        question_content: question.content.clone(),
                        total_attempts: 0,
                        correct_attempts: 0,
                        correct_scores: Vec::new(),
                        incorrect_scores: Vec::new(),
                    });
                entry.total_attempts += 1;
                if is_correct {
                    entry.correct_attempts += 1;
                    entry.correct_scores.push(score);
                } else {
                    entry.incorrect_scores.push(score);
                }
            }
        }

        let submission_count = submissions.len() as i64;
        let avg_score = if submission_count > 0 {
            score_sum / submission_count as f64
        } else {
            0.0
        };
        let pass_rate = if submission_count > 0 {
            (pass_count as f64 / submission_count as f64) * 100.0
        } else {
            0.0
        };

        let distribution = distribution_counts
            .iter()
            .enumerate()
            .map(|(index, count)| {
                let lower_bound = (index as i32) * 10;
                let upper_bound = if index == 9 { 100 } else { lower_bound + 9 };
                ScoreDistributionBinDto {
                    label: format!("{lower_bound}-{upper_bound}"),
                    lower_bound,
                    upper_bound,
                    count: *count,
                }
            })
            .collect();

        let time_series = days
            .into_iter()
            .map(|(day, aggregate)| {
                let day_avg = if aggregate.submissions > 0 {
                    aggregate.score_sum / aggregate.submissions as f64
                } else {
                    0.0
                };
                let day_pass_rate = if aggregate.submissions > 0 {
                    (aggregate.pass_count as f64 / aggregate.submissions as f64) * 100.0
                } else {
                    0.0
                };
                TimeSeriesPerformancePointDto {
                    day,
                    submissions: aggregate.submissions,
                    avg_score: day_avg,
                    pass_rate: day_pass_rate,
                }
            })
            .collect();

        let sd_total_score = Self::sample_standard_deviation(&scores);
        let mut item_analysis: Vec<ItemAnalysisRowDto> = items
            .into_iter()
            .map(|(question_id, item)| {
                let p_value = if item.total_attempts > 0 {
                    item.correct_attempts as f64 / item.total_attempts as f64
                } else {
                    0.0
                };
                let point_biserial = Self::compute_point_biserial(
                    &item.correct_scores,
                    &item.incorrect_scores,
                    sd_total_score,
                    item.total_attempts,
                    item.correct_attempts,
                );

                let mut recommendations = Vec::new();
                if p_value < 0.30 {
                    recommendations.push("too_difficult".to_string());
                }
                if p_value > 0.85 {
                    recommendations.push("too_easy".to_string());
                }
                if let Some(discrimination) = point_biserial {
                    if discrimination < 0.0 {
                        recommendations.push("negative_discrimination".to_string());
                    }
                    if discrimination < 0.10 {
                        recommendations.push("weak_discrimination".to_string());
                    }
                } else {
                    recommendations.push("weak_discrimination".to_string());
                }

                ItemAnalysisRowDto {
                    question_id,
                    question_type: item.question_type,
                    question_content: item.question_content,
                    total_attempts: item.total_attempts,
                    correct_attempts: item.correct_attempts,
                    p_value,
                    point_biserial,
                    recommendations,
                }
            })
            .collect();
        item_analysis.sort_by_key(|row| row.question_id);

        Ok(ExamInsightsDto {
            summary: ExamInsightsSummaryDto {
                exam_id: exam.exam_id,
                exam_title: exam.exam_title,
                pass_score: exam.pass_score,
                submission_count,
                avg_score,
                pass_rate,
            },
            distribution,
            time_series,
            item_analysis,
        })
    }

    pub async fn dashboard_stats(&self, tenant_id: Uuid) -> Result<DashboardStatsDto, CoreError> {
        let tenant = self.repo.tenant_quota_stats(tenant_id).await?;
        Ok(DashboardStatsDto { tenant })
    }

    fn parse_snapshot_questions(
        &self,
        snapshot: &Value,
    ) -> Result<Vec<SnapshotQuestion>, CoreError> {
        serde_json::from_value::<Vec<SnapshotQuestion>>(snapshot.clone())
            .map_err(|_| CoreError::internal("DB_ERROR", "Invalid question snapshot format"))
    }

    fn normalize_text(&self, raw: &str) -> String {
        raw.split_whitespace()
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
                let expected = question
                    .answer_key
                    .as_str()
                    .map(|value| self.normalize_text(value));
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
                        .map(|value| self.normalize_text(value))
                        .any(|candidate| candidate == got);
                }
                false
            }
            _ => false,
        }
    }

    fn sample_standard_deviation(values: &[f64]) -> f64 {
        if values.len() < 2 {
            return 0.0;
        }
        let mean = values.iter().sum::<f64>() / values.len() as f64;
        let variance = values
            .iter()
            .map(|value| (value - mean).powi(2))
            .sum::<f64>()
            / (values.len() as f64 - 1.0);
        variance.sqrt()
    }

    fn compute_point_biserial(
        correct_scores: &[f64],
        incorrect_scores: &[f64],
        sd_total_score: f64,
        total_attempts: i64,
        correct_attempts: i64,
    ) -> Option<f64> {
        if total_attempts < 2
            || correct_attempts <= 0
            || correct_attempts >= total_attempts
            || sd_total_score <= f64::EPSILON
            || correct_scores.is_empty()
            || incorrect_scores.is_empty()
        {
            return None;
        }

        let p = correct_attempts as f64 / total_attempts as f64;
        let q = 1.0 - p;
        if p <= 0.0 || q <= 0.0 {
            return None;
        }

        let mean_correct = correct_scores.iter().sum::<f64>() / correct_scores.len() as f64;
        let mean_incorrect = incorrect_scores.iter().sum::<f64>() / incorrect_scores.len() as f64;
        Some(((mean_correct - mean_incorrect) / sd_total_score) * (p * q).sqrt())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::postgres::PgPoolOptions;
    use uuid::Uuid;

    use super::AnalyticsService;
    use crate::domain::analytics::{
        dto::{ClassResultQuery, ExamInsightsQuery},
        repository::AnalyticsRepository,
    };

    fn new_service() -> AnalyticsService {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://postgres:postgres@localhost:5432/xamina")
            .expect("lazy pool");
        AnalyticsService::new(AnalyticsRepository::new(pool))
    }

    #[tokio::test]
    async fn dashboard_summary_should_reject_unsupported_role() {
        let service = new_service();
        let err = service
            .dashboard_summary(Uuid::new_v4(), Uuid::new_v4(), "ops")
            .await
            .expect_err("must fail");
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[tokio::test]
    async fn class_results_should_require_admin_or_guru_role() {
        let service = new_service();
        let err = service
            .class_results(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "siswa",
                ClassResultQuery {
                    page: Some(1),
                    page_size: Some(20),
                    class_id: None,
                    exam_id: None,
                },
            )
            .await
            .expect_err("must fail");
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[tokio::test]
    async fn exam_insights_should_require_exam_id() {
        let service = new_service();
        let err = service
            .exam_insights(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "admin",
                ExamInsightsQuery {
                    exam_id: None,
                    class_id: None,
                },
            )
            .await
            .expect_err("must fail");
        assert_eq!(err.code, "VALIDATION_ERROR");
    }

    #[test]
    fn point_biserial_should_return_none_when_sd_is_zero() {
        let point = AnalyticsService::compute_point_biserial(&[80.0, 80.0], &[80.0], 0.0, 3, 2);
        assert!(point.is_none());
    }
}
