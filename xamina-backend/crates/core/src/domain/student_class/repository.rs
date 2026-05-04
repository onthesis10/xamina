use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;
use super::dto::{ActiveClassDto, StudentClassHistoryDto, StudentClassHistoryRaw};

#[derive(Debug, Clone)]
pub struct StudentClassRepository {
    pub(crate) pool: PgPool,
}

impl StudentClassRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_history(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<Vec<StudentClassHistoryDto>, CoreError> {
        sqlx::query_as::<_, StudentClassHistoryDto>(
            "SELECT sch.id, sch.tenant_id, sch.student_id, sch.class_id,
                    c.name AS class_name,
                    sch.academic_year, sch.is_active, sch.created_at
             FROM student_class_history sch
             JOIN classes c ON c.id = sch.class_id
             WHERE sch.tenant_id = $1 AND sch.student_id = $2
             ORDER BY sch.created_at DESC",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load student class history"))
    }

    pub async fn get_active_class(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<Option<ActiveClassDto>, CoreError> {
        sqlx::query_as::<_, ActiveClassDto>(
            "SELECT c.id AS class_id, c.name AS class_name, sch.academic_year
             FROM student_class_history sch
             JOIN classes c ON c.id = sch.class_id
             WHERE sch.tenant_id = $1 AND sch.student_id = $2 AND sch.is_active = TRUE
             ORDER BY sch.created_at DESC
             LIMIT 1",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load active class"))
    }

    /// Get the active class_id for a student (lightweight)
    pub async fn get_active_class_id(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<Option<Uuid>, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT class_id
             FROM student_class_history
             WHERE tenant_id = $1 AND student_id = $2 AND is_active = TRUE
             ORDER BY created_at DESC
             LIMIT 1",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load active class id"))
    }

    pub async fn assign_class(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        class_id: Uuid,
        academic_year: &str,
    ) -> Result<StudentClassHistoryRaw, CoreError> {
        // Deactivate all current active entries for this student
        sqlx::query(
            "UPDATE student_class_history SET is_active = FALSE
             WHERE tenant_id = $1 AND student_id = $2 AND is_active = TRUE",
        )
        .bind(tenant_id)
        .bind(student_id)
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to deactivate old class"))?;

        // Also update users.class_id for backward compat
        sqlx::query("UPDATE users SET class_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3")
            .bind(class_id)
            .bind(student_id)
            .bind(tenant_id)
            .execute(&self.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update user class_id"))?;

        // Insert new active entry
        sqlx::query_as::<_, StudentClassHistoryRaw>(
            "INSERT INTO student_class_history (tenant_id, student_id, class_id, academic_year, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (tenant_id, student_id, class_id, academic_year)
             DO UPDATE SET is_active = TRUE
             RETURNING id, tenant_id, student_id, class_id, academic_year, is_active, created_at",
        )
        .bind(tenant_id)
        .bind(student_id)
        .bind(class_id)
        .bind(academic_year)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("ASSIGN_CLASS_FAILED", "Failed to assign class")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    /// Batch deactivate for promote
    pub async fn deactivate_student(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<(), CoreError> {
        sqlx::query(
            "UPDATE student_class_history SET is_active = FALSE
             WHERE tenant_id = $1 AND student_id = $2 AND is_active = TRUE",
        )
        .bind(tenant_id)
        .bind(student_id)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to deactivate student classes"))
    }

    /// Ensure a history record exists (for user creation)
    pub async fn ensure_history(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        class_id: Uuid,
        academic_year: &str,
    ) -> Result<(), CoreError> {
        sqlx::query(
            "INSERT INTO student_class_history (tenant_id, student_id, class_id, academic_year, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (tenant_id, student_id, class_id, academic_year) DO NOTHING",
        )
        .bind(tenant_id)
        .bind(student_id)
        .bind(class_id)
        .bind(academic_year)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to ensure class history"))
    }
}
