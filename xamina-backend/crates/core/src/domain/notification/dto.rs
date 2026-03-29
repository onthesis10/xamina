use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct NotificationDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub r#type: String,
    pub title: String,
    pub message: String,
    pub payload_jsonb: Value,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListNotificationsQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub unread_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationListMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
    pub unread_count: i64,
}

#[derive(Debug, Clone)]
pub struct CreateNotificationInput {
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub r#type: String,
    pub title: String,
    pub message: String,
    pub payload_jsonb: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BroadcastNotificationRequest {
    pub title: String,
    pub message: String,
    pub target_roles: Option<Vec<String>>,
    pub target_user_ids: Option<Vec<Uuid>>,
    pub send_push: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BroadcastNotificationResult {
    pub targeted_users: usize,
    pub created_notifications: usize,
    pub enqueued_push_jobs: usize,
    pub push_job_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CertificateDeliveryResult {
    pub email_job_id: Option<Uuid>,
    pub push_job_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PushSubscribeRequest {
    pub endpoint: String,
    pub keys: PushSubscriptionKeys,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PushSubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PushUnsubscribeRequest {
    pub endpoint: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PushReceiptRequest {
    pub receipt_token: String,
    pub event_type: String,
    pub event_at: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PushSubscriptionDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct EmailJobDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub certificate_id: Option<Uuid>,
    pub to_email: String,
    pub subject: String,
    pub body: String,
    pub status: String,
    pub attempts: i32,
    pub max_attempts: i32,
    pub next_attempt_at: DateTime<Utc>,
    pub last_error: Option<String>,
    pub sent_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PushJobDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub certificate_id: Option<Uuid>,
    pub title: String,
    pub body: String,
    pub payload_jsonb: Value,
    pub status: String,
    pub attempts: i32,
    pub max_attempts: i32,
    pub next_attempt_at: DateTime<Utc>,
    pub last_error: Option<String>,
    pub sent_at: Option<DateTime<Utc>>,
    pub receipt_token: Uuid,
    pub receipt_received_at: Option<DateTime<Utc>>,
    pub receipt_clicked_at: Option<DateTime<Utc>>,
}
