use std::collections::HashSet;

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;

use super::dto::{
    ExamDto, ExamPayload, ExamQuestionDto, PublishConflictExam, ReorderQuestionItem,
    ReorderQuestionsPayload,
};

#[derive(Debug, Clone)]
pub struct ExamRepository {
    pool: PgPool,
}

impl ExamRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count_exams(
        &self,
        tenant_id: Uuid,
        status: Option<String>,
        search: Option<String>,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM exams
             WHERE tenant_id = $1
               AND ($2::text IS NULL OR status = $2)
               AND ($3::text IS NULL OR title ILIKE '%' || $3 || '%')",
        )
        .bind(tenant_id)
        .bind(status)
        .bind(search)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count exams"))
    }

    pub async fn list_exams(
        &self,
        tenant_id: Uuid,
        status: Option<String>,
        search: Option<String>,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<ExamDto>, CoreError> {
        sqlx::query_as::<_, ExamDto>(
            "SELECT id, tenant_id, created_by, title, description, duration_minutes, pass_score, status, shuffle_questions, shuffle_options, start_at, end_at
             FROM exams
             WHERE tenant_id = $1
               AND ($2::text IS NULL OR status = $2)
               AND ($3::text IS NULL OR title ILIKE '%' || $3 || '%')
             ORDER BY created_at DESC
             LIMIT $4 OFFSET $5",
        )
        .bind(tenant_id)
        .bind(status)
        .bind(search)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to list exams"))
    }

    pub async fn create_exam(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        body: &ExamPayload,
        pass_score: i32,
    ) -> Result<ExamDto, CoreError> {
        sqlx::query_as::<_, ExamDto>(
            "INSERT INTO exams
             (tenant_id, created_by, title, description, duration_minutes, pass_score, status, shuffle_questions, shuffle_options, start_at, end_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10)
             RETURNING id, tenant_id, created_by, title, description, duration_minutes, pass_score, status, shuffle_questions, shuffle_options, start_at, end_at",
        )
        .bind(tenant_id)
        .bind(user_id)
        .bind(body.title.clone())
        .bind(body.description.clone())
        .bind(body.duration_minutes)
        .bind(pass_score)
        .bind(body.shuffle_questions.unwrap_or(false))
        .bind(body.shuffle_options.unwrap_or(false))
        .bind(body.start_at)
        .bind(body.end_at)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("CREATE_EXAM_FAILED", "Failed to create exam")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn get_exam(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
    ) -> Result<Option<ExamDto>, CoreError> {
        sqlx::query_as::<_, ExamDto>(
            "SELECT id, tenant_id, created_by, title, description, duration_minutes, pass_score, status, shuffle_questions, shuffle_options, start_at, end_at
             FROM exams WHERE id = $1 AND tenant_id = $2",
        )
        .bind(exam_id)
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam"))
    }

    pub async fn list_exam_questions(
        &self,
        exam_id: Uuid,
    ) -> Result<Vec<ExamQuestionDto>, CoreError> {
        sqlx::query_as::<_, ExamQuestionDto>(
            "SELECT exam_id, question_id, order_no FROM exam_questions WHERE exam_id = $1 ORDER BY order_no ASC",
        )
        .bind(exam_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam questions"))
    }

    pub async fn update_exam(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        body: &ExamPayload,
    ) -> Result<Option<ExamDto>, CoreError> {
        sqlx::query_as::<_, ExamDto>(
            "UPDATE exams
             SET title = $1, description = $2, duration_minutes = $3, pass_score = $4, shuffle_questions = $5, shuffle_options = $6, start_at = $7, end_at = $8, updated_at = NOW()
             WHERE id = $9 AND tenant_id = $10 AND status = 'draft'
             RETURNING id, tenant_id, created_by, title, description, duration_minutes, pass_score, status, shuffle_questions, shuffle_options, start_at, end_at",
        )
        .bind(body.title.clone())
        .bind(body.description.clone())
        .bind(body.duration_minutes)
        .bind(body.pass_score.unwrap_or(70).clamp(0, 100))
        .bind(body.shuffle_questions.unwrap_or(false))
        .bind(body.shuffle_options.unwrap_or(false))
        .bind(body.start_at)
        .bind(body.end_at)
        .bind(exam_id)
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("UPDATE_EXAM_FAILED", "Failed to update exam")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn delete_exam(&self, tenant_id: Uuid, exam_id: Uuid) -> Result<u64, CoreError> {
        sqlx::query("DELETE FROM exams WHERE id = $1 AND tenant_id = $2 AND status = 'draft'")
            .bind(exam_id)
            .bind(tenant_id)
            .execute(&self.pool)
            .await
            .map(|result| result.rows_affected())
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to delete exam"))
    }

    pub async fn count_editable_exam(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM exams WHERE id = $1 AND tenant_id = $2 AND status = 'draft'",
        )
        .bind(exam_id)
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to validate exam"))
    }

    pub async fn max_exam_question_order(&self, exam_id: Uuid) -> Result<i32, CoreError> {
        sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(MAX(order_no), 0) FROM exam_questions WHERE exam_id = $1",
        )
        .bind(exam_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to calculate order"))
    }

    pub async fn question_belongs_to_tenant(
        &self,
        tenant_id: Uuid,
        question_id: Uuid,
    ) -> Result<bool, CoreError> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM questions WHERE id = $1 AND tenant_id = $2",
        )
        .bind(question_id)
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to validate question"))?;
        Ok(count > 0)
    }

    pub async fn attach_question_if_missing(
        &self,
        exam_id: Uuid,
        question_id: Uuid,
        order_no: i32,
    ) -> Result<(), CoreError> {
        sqlx::query(
            "INSERT INTO exam_questions (exam_id, question_id, order_no)
             VALUES ($1, $2, $3)
             ON CONFLICT (exam_id, question_id) DO NOTHING",
        )
        .bind(exam_id)
        .bind(question_id)
        .bind(order_no)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to attach question"))
    }

    pub async fn get_exam_status(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
    ) -> Result<Option<String>, CoreError> {
        sqlx::query_scalar::<_, String>("SELECT status FROM exams WHERE id = $1 AND tenant_id = $2")
            .bind(exam_id)
            .bind(tenant_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam"))
    }

    pub async fn current_question_ids(&self, exam_id: Uuid) -> Result<Vec<Uuid>, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT question_id FROM exam_questions WHERE exam_id = $1 ORDER BY order_no ASC",
        )
        .bind(exam_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam questions"))
    }

    pub async fn reorder_questions(
        &self,
        exam_id: Uuid,
        body: &ReorderQuestionsPayload,
    ) -> Result<Vec<ReorderQuestionItem>, CoreError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to start transaction"))?;

        sqlx::query("UPDATE exam_questions SET order_no = order_no + 100000 WHERE exam_id = $1")
            .bind(exam_id)
            .execute(&mut *tx)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to prepare reorder"))?;

        for (index, question_id) in body.question_ids.iter().enumerate() {
            sqlx::query(
                "UPDATE exam_questions
                 SET order_no = $1
                 WHERE exam_id = $2 AND question_id = $3",
            )
            .bind((index as i32) + 1)
            .bind(exam_id)
            .bind(question_id)
            .execute(&mut *tx)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to reorder questions"))?;
        }

        let reordered = sqlx::query_as::<_, ReorderQuestionItem>(
            "SELECT question_id, order_no
             FROM exam_questions
             WHERE exam_id = $1
             ORDER BY order_no ASC",
        )
        .bind(exam_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load reordered questions"))?;

        tx.commit()
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to commit reorder"))?;

        Ok(reordered)
    }

    pub async fn detach_question(
        &self,
        exam_id: Uuid,
        question_id: Uuid,
    ) -> Result<u64, CoreError> {
        sqlx::query(
            "DELETE FROM exam_questions
             WHERE exam_id = $1
               AND question_id = $2",
        )
        .bind(exam_id)
        .bind(question_id)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to detach question"))
    }

    pub async fn count_exam_questions(&self, exam_id: Uuid) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM exam_questions WHERE exam_id = $1")
            .bind(exam_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count exam questions"))
    }

    pub async fn list_publish_conflicts(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        exam_creator: Uuid,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<PublishConflictExam>, CoreError> {
        sqlx::query_as::<_, PublishConflictExam>(
            "SELECT id, title, start_at, end_at
             FROM exams
             WHERE tenant_id = $1
               AND created_by = $2
               AND id <> $3
               AND status = 'published'
               AND start_at IS NOT NULL
               AND end_at IS NOT NULL
               AND tstzrange(start_at, end_at, '[)') && tstzrange($4, $5, '[)')
             ORDER BY start_at ASC
             LIMIT 5",
        )
        .bind(tenant_id)
        .bind(exam_creator)
        .bind(exam_id)
        .bind(start)
        .bind(end)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed schedule conflict check"))
    }

    pub async fn set_exam_status(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        status: &str,
    ) -> Result<(), CoreError> {
        sqlx::query(
            "UPDATE exams SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
        )
        .bind(status)
        .bind(exam_id)
        .bind(tenant_id)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update exam status"))
    }

    pub fn ensure_exact_question_set(current: &[Uuid], incoming: &[Uuid]) -> Result<(), CoreError> {
        if current.is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "Exam has no attached questions",
            ));
        }
        let current_set = current.iter().copied().collect::<HashSet<Uuid>>();
        let incoming_set = incoming.iter().copied().collect::<HashSet<Uuid>>();
        if current_set != incoming_set {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "question_ids must match currently attached questions exactly",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::ExamRepository;

    #[test]
    fn ensure_exact_question_set_should_reject_empty_current_questions() {
        let current: Vec<Uuid> = vec![];
        let incoming = vec![Uuid::new_v4()];
        let result = ExamRepository::ensure_exact_question_set(&current, &incoming);
        assert!(result.is_err());
    }

    #[test]
    fn ensure_exact_question_set_should_reject_mismatch() {
        let current = vec![Uuid::new_v4(), Uuid::new_v4()];
        let incoming = vec![current[0], Uuid::new_v4()];
        let result = ExamRepository::ensure_exact_question_set(&current, &incoming);
        assert!(result.is_err());
    }

    #[test]
    fn ensure_exact_question_set_should_accept_identical_set() {
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let current = vec![first, second];
        let incoming = vec![second, first];
        let result = ExamRepository::ensure_exact_question_set(&current, &incoming);
        assert!(result.is_ok());
    }
}
