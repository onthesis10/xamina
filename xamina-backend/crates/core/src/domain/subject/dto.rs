use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SubjectDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSubjectPayload {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSubjectPayload {
    pub name: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListSubjectsQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub search: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

#[derive(Debug, Clone)]
pub struct ListSubjectsResult {
    pub rows: Vec<SubjectDto>,
    pub meta: PageMeta,
}
