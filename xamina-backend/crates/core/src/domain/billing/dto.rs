use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct BillingPlanDto {
    pub code: String,
    pub label: String,
    pub amount: i64,
    pub currency: String,
    pub users_quota: i32,
    pub ai_credits_quota: i32,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct BillingSubscriptionDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub plan_code: String,
    pub status: String,
    pub provider: String,
    pub provider_ref: Option<String>,
    pub amount: i64,
    pub currency: String,
    pub period_start: Option<DateTime<Utc>>,
    pub period_end: Option<DateTime<Utc>>,
    pub latest_invoice_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct BillingInvoiceDto {
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
    pub pdf_url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BillingSummaryDto {
    pub tenant_id: Uuid,
    pub available_plans: Vec<BillingPlanDto>,
    pub current_subscription: Option<BillingSubscriptionDto>,
    pub outstanding_invoice: Option<BillingInvoiceDto>,
    pub recent_invoices: Vec<BillingInvoiceDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BillingCheckoutSessionDto {
    pub gateway_mode: String,
    pub checkout_url: String,
    pub invoice: BillingInvoiceDto,
    pub current_subscription: Option<BillingSubscriptionDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BillingWebhookProcessDto {
    pub already_processed: bool,
    pub invoice: BillingInvoiceDto,
    pub subscription: BillingSubscriptionDto,
}

#[derive(Debug, Clone, Serialize)]
pub struct BillingHistoryMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BillingHistoryQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCheckoutInput {
    pub plan_code: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChangePlanInput {
    pub plan_code: String,
}
