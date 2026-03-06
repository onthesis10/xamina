use std::collections::HashSet;

use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{
        ExamDetailDto, ExamDto, ExamPayload, ListExamsQuery, PageMeta, PublishPrecheckIssue,
        PublishPrecheckResult, ReorderQuestionItem, ReorderQuestionsPayload,
    },
    models::ListExamsResult,
    repository::ExamRepository,
};

#[derive(Debug, Clone)]
pub struct ExamService {
    repo: ExamRepository,
}

impl ExamService {
    pub fn new(repo: ExamRepository) -> Self {
        Self { repo }
    }

    pub async fn list_exams(
        &self,
        tenant_id: Uuid,
        query: ListExamsQuery,
    ) -> Result<ListExamsResult, CoreError> {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * page_size;

        let total = self
            .repo
            .count_exams(tenant_id, query.status.clone(), query.search.clone())
            .await?;
        let rows = self
            .repo
            .list_exams(tenant_id, query.status, query.search, page_size, offset)
            .await?;

        Ok(ListExamsResult {
            rows,
            meta: PageMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn create_exam(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        body: ExamPayload,
    ) -> Result<ExamDto, CoreError> {
        self.validate_schedule(body.start_at, body.end_at)?;
        if body.title.trim().is_empty() || body.duration_minutes <= 0 {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "title and positive duration_minutes are required",
            ));
        }

        let pass_score = body.pass_score.unwrap_or(70).clamp(0, 100);
        self.repo
            .create_exam(tenant_id, user_id, &body, pass_score)
            .await
    }

    pub async fn get_exam(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
    ) -> Result<ExamDetailDto, CoreError> {
        let exam = self
            .repo
            .get_exam(tenant_id, exam_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Exam not found"))?;
        let questions = self.repo.list_exam_questions(exam_id).await?;
        Ok(ExamDetailDto { exam, questions })
    }

    pub async fn update_exam(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        body: ExamPayload,
    ) -> Result<ExamDto, CoreError> {
        self.validate_schedule(body.start_at, body.end_at)?;
        if body.title.trim().is_empty() || body.duration_minutes <= 0 {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "title and positive duration_minutes are required",
            ));
        }

        self.repo
            .update_exam(tenant_id, exam_id, &body)
            .await?
            .ok_or_else(|| {
                CoreError::bad_request("UPDATE_EXAM_FAILED", "Exam not found or already published")
            })
    }

    pub async fn delete_exam(&self, tenant_id: Uuid, exam_id: Uuid) -> Result<(), CoreError> {
        let affected = self.repo.delete_exam(tenant_id, exam_id).await?;
        if affected == 0 {
            return Err(CoreError::bad_request(
                "DELETE_EXAM_FAILED",
                "Exam not found or already published",
            ));
        }
        Ok(())
    }

    pub async fn attach_questions(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        question_ids: Vec<Uuid>,
    ) -> Result<(), CoreError> {
        if question_ids.is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "question_ids cannot be empty",
            ));
        }
        let editable = self.repo.count_editable_exam(tenant_id, exam_id).await?;
        if editable == 0 {
            return Err(CoreError::bad_request(
                "ATTACH_FAILED",
                "Exam not found or not editable",
            ));
        }

        let mut next_order = self.repo.max_exam_question_order(exam_id).await?;
        for question_id in question_ids {
            if !self
                .repo
                .question_belongs_to_tenant(tenant_id, question_id)
                .await?
            {
                continue;
            }
            next_order += 1;
            self.repo
                .attach_question_if_missing(exam_id, question_id, next_order)
                .await?;
        }
        Ok(())
    }

    pub async fn reorder_questions(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        body: ReorderQuestionsPayload,
    ) -> Result<Vec<ReorderQuestionItem>, CoreError> {
        if body.question_ids.is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "question_ids cannot be empty",
            ));
        }

        let incoming_unique_len = body
            .question_ids
            .iter()
            .copied()
            .collect::<HashSet<Uuid>>()
            .len();
        if incoming_unique_len != body.question_ids.len() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "question_ids contains duplicate values",
            ));
        }

        let status = self
            .repo
            .get_exam_status(tenant_id, exam_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Exam not found"))?;
        if status != "draft" {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "Only draft exam can be reordered",
            ));
        }

        let current_questions = self.repo.current_question_ids(exam_id).await?;
        ExamRepository::ensure_exact_question_set(&current_questions, &body.question_ids)?;

        self.repo.reorder_questions(exam_id, &body).await
    }

    pub async fn detach_question(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        question_id: Uuid,
    ) -> Result<(), CoreError> {
        let status = self
            .repo
            .get_exam_status(tenant_id, exam_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Exam not found"))?;
        if status != "draft" {
            return Err(CoreError::bad_request(
                "ATTACH_FAILED",
                "Exam not found or not editable",
            ));
        }
        let affected = self.repo.detach_question(exam_id, question_id).await?;
        if affected == 0 {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "Question is not attached to exam",
            ));
        }
        Ok(())
    }

    pub async fn publish_precheck(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
    ) -> Result<PublishPrecheckResult, CoreError> {
        let exam = self
            .repo
            .get_exam(tenant_id, exam_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Exam not found"))?;

        let mut issues: Vec<PublishPrecheckIssue> = Vec::new();
        if exam.status != "draft" {
            issues.push(PublishPrecheckIssue {
                code: "NOT_DRAFT".to_string(),
                message: "Only draft exam can be published".to_string(),
                details: None,
            });
        }

        match (exam.start_at, exam.end_at) {
            (Some(start), Some(end)) => {
                if start >= end {
                    issues.push(PublishPrecheckIssue {
                        code: "INVALID_SCHEDULE".to_string(),
                        message: "start_at must be before end_at".to_string(),
                        details: None,
                    });
                }
            }
            _ => {
                issues.push(PublishPrecheckIssue {
                    code: "SCHEDULE_REQUIRED".to_string(),
                    message: "Exam schedule is required before publish".to_string(),
                    details: None,
                });
            }
        }

        let question_count = self.repo.count_exam_questions(exam.id).await?;
        if question_count < 1 {
            issues.push(PublishPrecheckIssue {
                code: "NO_QUESTIONS".to_string(),
                message: "Exam must have at least one question".to_string(),
                details: None,
            });
        }

        if let (Some(start), Some(end)) = (exam.start_at, exam.end_at) {
            let conflicts = self
                .repo
                .list_publish_conflicts(tenant_id, exam.id, exam.created_by, start, end)
                .await?;
            if !conflicts.is_empty() {
                let sample_titles = conflicts
                    .iter()
                    .take(2)
                    .map(|item| item.title.clone())
                    .collect::<Vec<_>>()
                    .join(", ");
                let more_suffix = if conflicts.len() > 2 { ", +more" } else { "" };
                issues.push(PublishPrecheckIssue {
                    code: "SCHEDULE_CONFLICT".to_string(),
                    message: format!(
                        "Schedule conflicts with published exam(s): {sample_titles}{more_suffix}"
                    ),
                    details: Some(serde_json::json!({ "conflicting_exams": conflicts })),
                });
            }
        }

        Ok(PublishPrecheckResult {
            exam_id: exam.id,
            publishable: issues.is_empty(),
            status: exam.status,
            question_count,
            issues,
        })
    }

    pub async fn publish_exam(&self, tenant_id: Uuid, exam_id: Uuid) -> Result<(), CoreError> {
        let precheck = self.publish_precheck(tenant_id, exam_id).await?;
        if !precheck.publishable {
            let first_message = precheck
                .issues
                .first()
                .map(|issue| issue.message.clone())
                .unwrap_or_else(|| "Exam cannot be published".to_string());
            return Err(CoreError::bad_request("PUBLISH_FAILED", first_message)
                .with_details(serde_json::json!({ "precheck": precheck })));
        }
        self.repo
            .set_exam_status(tenant_id, exam_id, "published")
            .await
    }

    pub async fn unpublish_exam(&self, tenant_id: Uuid, exam_id: Uuid) -> Result<(), CoreError> {
        self.repo.set_exam_status(tenant_id, exam_id, "draft").await
    }

    fn validate_schedule(
        &self,
        start_at: Option<chrono::DateTime<chrono::Utc>>,
        end_at: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Result<(), CoreError> {
        match (start_at, end_at) {
            (Some(start), Some(end)) => {
                if start >= end {
                    return Err(CoreError::bad_request(
                        "VALIDATION_ERROR",
                        "start_at must be before end_at",
                    ));
                }
            }
            (Some(_), None) | (None, Some(_)) => {
                return Err(CoreError::bad_request(
                    "VALIDATION_ERROR",
                    "start_at and end_at must both be provided",
                ));
            }
            (None, None) => {}
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use sqlx::postgres::PgPoolOptions;
    use uuid::Uuid;

    use super::ExamService;
    use crate::domain::exam::{dto::ListExamsQuery, repository::ExamRepository};

    fn new_service() -> ExamService {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://postgres:postgres@localhost:5432/xamina")
            .expect("lazy pool");
        ExamService::new(ExamRepository::new(pool))
    }

    #[tokio::test]
    async fn list_exams_should_clamp_pagination_before_repo_call() {
        let service = new_service();
        let query = ListExamsQuery {
            page: Some(-3),
            page_size: Some(9999),
            status: None,
            search: None,
        };

        let result = service.list_exams(Uuid::new_v4(), query).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn create_exam_should_reject_invalid_schedule_before_repo_call() {
        let service = new_service();
        let now = Utc::now();
        let payload = crate::domain::exam::dto::ExamPayload {
            title: "Math".to_string(),
            description: None,
            duration_minutes: 90,
            pass_score: Some(70),
            shuffle_questions: Some(false),
            shuffle_options: Some(false),
            start_at: Some(now),
            end_at: Some(now - Duration::minutes(1)),
        };

        let err = service
            .create_exam(Uuid::new_v4(), Uuid::new_v4(), payload)
            .await
            .expect_err("must fail");
        assert_eq!(err.code, "VALIDATION_ERROR");
    }

    #[tokio::test]
    async fn create_exam_should_reject_missing_schedule_pair_before_repo_call() {
        let service = new_service();
        let payload = crate::domain::exam::dto::ExamPayload {
            title: "Math".to_string(),
            description: None,
            duration_minutes: 90,
            pass_score: Some(70),
            shuffle_questions: Some(false),
            shuffle_options: Some(false),
            start_at: Some(Utc::now()),
            end_at: None,
        };

        let err = service
            .create_exam(Uuid::new_v4(), Uuid::new_v4(), payload)
            .await
            .expect_err("must fail");
        assert_eq!(err.code, "VALIDATION_ERROR");
    }
}
