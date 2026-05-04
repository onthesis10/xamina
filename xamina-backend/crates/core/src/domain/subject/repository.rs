use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;
use super::dto::{CreateSubjectPayload, SubjectDto, UpdateSubjectPayload};

#[derive(Debug, Clone)]
pub struct SubjectRepository {
    pool: PgPool,
}

impl SubjectRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count_subjects(
        &self,
        tenant_id: Uuid,
        search: Option<String>,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM subjects
             WHERE tenant_id = $1
               AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')",
        )
        .bind(tenant_id)
        .bind(search)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::internal("DB_ERROR", "Failed to count subjects")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn list_subjects(
        &self,
        tenant_id: Uuid,
        search: Option<String>,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<SubjectDto>, CoreError> {
        sqlx::query_as::<_, SubjectDto>(
            "SELECT id, tenant_id, name, is_active, created_at
             FROM subjects
             WHERE tenant_id = $1
               AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
             ORDER BY name ASC
             LIMIT $3 OFFSET $4",
        )
        .bind(tenant_id)
        .bind(search)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            CoreError::internal("DB_ERROR", "Failed to list subjects")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn list_all_active(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<SubjectDto>, CoreError> {
        sqlx::query_as::<_, SubjectDto>(
            "SELECT id, tenant_id, name, is_active, created_at
             FROM subjects
             WHERE tenant_id = $1 AND is_active = TRUE
             ORDER BY name ASC",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            CoreError::internal("DB_ERROR", "Failed to list active subjects")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn get_subject(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
    ) -> Result<Option<SubjectDto>, CoreError> {
        sqlx::query_as::<_, SubjectDto>(
            "SELECT id, tenant_id, name, is_active, created_at
             FROM subjects
             WHERE id = $1 AND tenant_id = $2",
        )
        .bind(subject_id)
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load subject"))
    }

    pub async fn create_subject(
        &self,
        tenant_id: Uuid,
        body: &CreateSubjectPayload,
    ) -> Result<SubjectDto, CoreError> {
        sqlx::query_as::<_, SubjectDto>(
            "INSERT INTO subjects (tenant_id, name)
             VALUES ($1, $2)
             RETURNING id, tenant_id, name, is_active, created_at",
        )
        .bind(tenant_id)
        .bind(body.name.trim())
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("CREATE_SUBJECT_FAILED", "Failed to create subject")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn update_subject(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
        body: &UpdateSubjectPayload,
        existing: &SubjectDto,
    ) -> Result<SubjectDto, CoreError> {
        sqlx::query_as::<_, SubjectDto>(
            "UPDATE subjects
             SET name = $1, is_active = $2, updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4
             RETURNING id, tenant_id, name, is_active, created_at",
        )
        .bind(body.name.clone().unwrap_or_else(|| existing.name.clone()))
        .bind(body.is_active.unwrap_or(existing.is_active))
        .bind(subject_id)
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("UPDATE_SUBJECT_FAILED", "Failed to update subject")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn delete_subject(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
    ) -> Result<u64, CoreError> {
        sqlx::query("DELETE FROM subjects WHERE id = $1 AND tenant_id = $2")
            .bind(subject_id)
            .bind(tenant_id)
            .execute(&self.pool)
            .await
            .map(|result| result.rows_affected())
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to delete subject"))
    }

    pub async fn subject_exists(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
    ) -> Result<bool, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM subjects WHERE id = $1 AND tenant_id = $2",
        )
        .bind(subject_id)
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await
        .map(|c| c > 0)
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to check subject"))
    }
}
