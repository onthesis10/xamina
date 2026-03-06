use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
pub struct ListUsersQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub search: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
    pub class_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct UserDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub class_id: Option<Uuid>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateUserPayload {
    pub email: String,
    pub name: String,
    pub role: String,
    pub class_id: Option<Uuid>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserPayload {
    pub email: Option<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub class_id: Option<Uuid>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CsvImportError {
    pub line: usize,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CsvImportResult {
    pub inserted: usize,
    pub failed: usize,
    pub errors: Vec<CsvImportError>,
}
