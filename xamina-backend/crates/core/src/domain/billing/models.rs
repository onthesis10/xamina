use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use super::dto::{BillingHistoryMeta, BillingInvoiceDto};

#[derive(Debug, Clone)]
pub struct BillingHistoryPage {
    pub rows: Vec<BillingInvoiceDto>,
    pub meta: BillingHistoryMeta,
}

#[derive(Debug, Clone)]
pub struct BillingPlanDefinition {
    pub code: &'static str,
    pub label: &'static str,
    pub amount: i64,
    pub currency: &'static str,
    pub users_quota: i32,
    pub ai_credits_quota: i32,
    pub description: &'static str,
}

#[derive(Debug, Clone, FromRow)]
pub struct BillingTenantRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub plan: String,
    pub users_quota: i32,
    pub ai_credits_quota: i32,
}

#[derive(Debug, Clone, FromRow)]
pub struct BillingWebhookEventRow {
    pub id: Uuid,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct BillingInvoiceRawRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub subscription_id: Uuid,
    pub plan_code: String,
    pub status: String,
    pub provider: String,
    pub provider_ref: String,
    pub amount: i64,
    pub currency: String,
    pub period_start: Option<DateTime<Utc>>,
    pub period_end: Option<DateTime<Utc>>,
    pub due_at: DateTime<Utc>,
    pub paid_at: Option<DateTime<Utc>>,
    pub attempt_count: i32,
    pub next_retry_at: Option<DateTime<Utc>>,
    pub checkout_url: Option<String>,
    pub pdf_path: String,
    pub pdf_url: String,
    pub raw_payload_jsonb: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct BillingInvoiceInsertInput {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub subscription_id: Uuid,
    pub plan_code: String,
    pub status: String,
    pub provider: String,
    pub provider_ref: String,
    pub amount: i64,
    pub currency: String,
    pub period_start: Option<DateTime<Utc>>,
    pub period_end: Option<DateTime<Utc>>,
    pub due_at: DateTime<Utc>,
    pub checkout_url: Option<String>,
    pub pdf_path: String,
    pub pdf_url: String,
    pub raw_payload_jsonb: Value,
}
