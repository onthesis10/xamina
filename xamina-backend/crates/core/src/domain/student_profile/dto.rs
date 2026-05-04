use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StudentProfileDto {
    pub id: Uuid,
    pub user_id: Uuid,
    pub nisn: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpsertProfilePayload {
    pub nisn: Option<String>,
}
