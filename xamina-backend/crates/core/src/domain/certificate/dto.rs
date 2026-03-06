use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CertificateDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub submission_id: Uuid,
    pub exam_id: Uuid,
    pub student_id: Uuid,
    pub certificate_no: String,
    pub score: f64,
    pub issued_at: DateTime<Utc>,
    pub file_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListCertificatesQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CertificateListMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}
