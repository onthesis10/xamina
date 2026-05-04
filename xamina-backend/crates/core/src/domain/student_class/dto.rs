use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StudentClassHistoryDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub student_id: Uuid,
    pub class_id: Uuid,
    pub class_name: String,
    pub academic_year: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StudentClassHistoryRaw {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub student_id: Uuid,
    pub class_id: Uuid,
    pub academic_year: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignClassPayload {
    pub class_id: Uuid,
    pub academic_year: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PromoteStudentsPayload {
    pub student_ids: Vec<Uuid>,
    pub new_class_id: Uuid,
    pub new_academic_year: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PromoteResult {
    pub promoted_count: usize,
    pub errors: Vec<PromoteError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PromoteError {
    pub student_id: Uuid,
    pub reason: String,
}

/// Active class info for a student
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ActiveClassDto {
    pub class_id: Uuid,
    pub class_name: String,
    pub academic_year: String,
}
