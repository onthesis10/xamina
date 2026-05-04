use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TeacherAssignmentDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub teacher_id: Uuid,
    pub subject_id: Uuid,
    pub class_id: Uuid,
    pub teacher_name: String,
    pub subject_name: String,
    pub class_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TeacherAssignmentRaw {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub teacher_id: Uuid,
    pub subject_id: Uuid,
    pub class_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateAssignmentPayload {
    pub teacher_id: Uuid,
    pub subject_id: Uuid,
    pub class_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListAssignmentsQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub teacher_id: Option<Uuid>,
    pub subject_id: Option<Uuid>,
    pub class_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

#[derive(Debug, Clone)]
pub struct ListAssignmentsResult {
    pub rows: Vec<TeacherAssignmentDto>,
    pub meta: PageMeta,
}

/// Lightweight DTO for checking what classes a teacher is assigned to for a subject
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TeacherSubjectClassDto {
    pub class_id: Uuid,
    pub class_name: String,
}

/// Lightweight DTO for checking what subjects a teacher is assigned to
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TeacherSubjectDto {
    pub subject_id: Uuid,
    pub subject_name: String,
}
