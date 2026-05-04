use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;
use super::dto::{CreateAssignmentPayload, TeacherAssignmentDto, TeacherAssignmentRaw, TeacherSubjectClassDto, TeacherSubjectDto};

#[derive(Debug, Clone)]
pub struct TeacherAssignmentRepository {
    pool: PgPool,
}

impl TeacherAssignmentRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count_assignments(
        &self,
        tenant_id: Uuid,
        teacher_id: Option<Uuid>,
        subject_id: Option<Uuid>,
        class_id: Option<Uuid>,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM teacher_assignments
             WHERE tenant_id = $1
               AND ($2::uuid IS NULL OR teacher_id = $2)
               AND ($3::uuid IS NULL OR subject_id = $3)
               AND ($4::uuid IS NULL OR class_id = $4)",
        )
        .bind(tenant_id)
        .bind(teacher_id)
        .bind(subject_id)
        .bind(class_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count teacher assignments"))
    }

    pub async fn list_assignments(
        &self,
        tenant_id: Uuid,
        teacher_id: Option<Uuid>,
        subject_id: Option<Uuid>,
        class_id: Option<Uuid>,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<TeacherAssignmentDto>, CoreError> {
        sqlx::query_as::<_, TeacherAssignmentDto>(
            "SELECT ta.id, ta.tenant_id, ta.teacher_id, ta.subject_id, ta.class_id,
                    u.name AS teacher_name,
                    s.name AS subject_name,
                    c.name AS class_name,
                    ta.created_at
             FROM teacher_assignments ta
             JOIN users u ON u.id = ta.teacher_id
             JOIN subjects s ON s.id = ta.subject_id
             JOIN classes c ON c.id = ta.class_id
             WHERE ta.tenant_id = $1
               AND ($2::uuid IS NULL OR ta.teacher_id = $2)
               AND ($3::uuid IS NULL OR ta.subject_id = $3)
               AND ($4::uuid IS NULL OR ta.class_id = $4)
             ORDER BY u.name ASC, s.name ASC, c.name ASC
             LIMIT $5 OFFSET $6",
        )
        .bind(tenant_id)
        .bind(teacher_id)
        .bind(subject_id)
        .bind(class_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to list teacher assignments"))
    }

    pub async fn create_assignment(
        &self,
        tenant_id: Uuid,
        body: &CreateAssignmentPayload,
    ) -> Result<TeacherAssignmentRaw, CoreError> {
        sqlx::query_as::<_, TeacherAssignmentRaw>(
            "INSERT INTO teacher_assignments (tenant_id, teacher_id, subject_id, class_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, tenant_id, teacher_id, subject_id, class_id, created_at",
        )
        .bind(tenant_id)
        .bind(body.teacher_id)
        .bind(body.subject_id)
        .bind(body.class_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("CREATE_ASSIGNMENT_FAILED", "Failed to create teacher assignment")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn delete_assignment(
        &self,
        tenant_id: Uuid,
        assignment_id: Uuid,
    ) -> Result<u64, CoreError> {
        sqlx::query("DELETE FROM teacher_assignments WHERE id = $1 AND tenant_id = $2")
            .bind(assignment_id)
            .bind(tenant_id)
            .execute(&self.pool)
            .await
            .map(|result| result.rows_affected())
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to delete teacher assignment"))
    }

    /// Get all classes a teacher is assigned to for a specific subject
    pub async fn teacher_classes_for_subject(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
        subject_id: Uuid,
    ) -> Result<Vec<TeacherSubjectClassDto>, CoreError> {
        sqlx::query_as::<_, TeacherSubjectClassDto>(
            "SELECT c.id AS class_id, c.name AS class_name
             FROM teacher_assignments ta
             JOIN classes c ON c.id = ta.class_id
             WHERE ta.tenant_id = $1 AND ta.teacher_id = $2 AND ta.subject_id = $3
             ORDER BY c.name ASC",
        )
        .bind(tenant_id)
        .bind(teacher_id)
        .bind(subject_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load teacher classes"))
    }

    /// Get all subjects a teacher is assigned to (distinct)
    pub async fn teacher_subjects(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
    ) -> Result<Vec<TeacherSubjectDto>, CoreError> {
        sqlx::query_as::<_, TeacherSubjectDto>(
            "SELECT DISTINCT s.id AS subject_id, s.name AS subject_name
             FROM teacher_assignments ta
             JOIN subjects s ON s.id = ta.subject_id
             WHERE ta.tenant_id = $1 AND ta.teacher_id = $2
             ORDER BY s.name ASC",
        )
        .bind(tenant_id)
        .bind(teacher_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load teacher subjects"))
    }

    /// Check if a teacher has an assignment for a specific subject+class
    pub async fn teacher_has_assignment(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
        subject_id: Uuid,
        class_id: Uuid,
    ) -> Result<bool, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM teacher_assignments
             WHERE tenant_id = $1 AND teacher_id = $2 AND subject_id = $3 AND class_id = $4",
        )
        .bind(tenant_id)
        .bind(teacher_id)
        .bind(subject_id)
        .bind(class_id)
        .fetch_one(&self.pool)
        .await
        .map(|c| c > 0)
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to check teacher assignment"))
    }

    /// Get all class IDs a teacher is assigned to (any subject)
    pub async fn teacher_class_ids(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
    ) -> Result<Vec<Uuid>, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT DISTINCT class_id FROM teacher_assignments
             WHERE tenant_id = $1 AND teacher_id = $2",
        )
        .bind(tenant_id)
        .bind(teacher_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load teacher class ids"))
    }
}
