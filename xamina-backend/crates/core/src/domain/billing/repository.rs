use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{BillingInvoiceDto, BillingSubscriptionDto},
    models::{
        BillingInvoiceInsertInput, BillingInvoiceRawRow, BillingTenantRow, BillingWebhookEventRow,
    },
};

#[derive(Debug, Clone)]
pub struct BillingRepository {
    pool: PgPool,
}

impl BillingRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_tenant(&self, tenant_id: Uuid) -> Result<Option<BillingTenantRow>, CoreError> {
        sqlx::query_as::<_, BillingTenantRow>(
            "SELECT id, name, slug, plan, users_quota, ai_credits_quota
             FROM tenants
             WHERE id = $1",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load billing tenant"))
    }

    pub async fn count_invoices(&self, tenant_id: Uuid) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM billing_invoices WHERE tenant_id = $1")
            .bind(tenant_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count billing invoices"))
    }

    pub async fn list_invoices(
        &self,
        tenant_id: Uuid,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<BillingInvoiceDto>, CoreError> {
        let rows = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "SELECT
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at
             FROM billing_invoices
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3",
        )
        .bind(tenant_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to list billing invoices"))?;
        Ok(rows.into_iter().map(map_invoice_row).collect())
    }

    pub async fn get_outstanding_invoice(
        &self,
        tenant_id: Uuid,
    ) -> Result<Option<BillingInvoiceDto>, CoreError> {
        let row = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "SELECT
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at
             FROM billing_invoices
             WHERE tenant_id = $1
               AND status IN ('pending', 'overdue')
             ORDER BY created_at DESC
             LIMIT 1",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load outstanding invoice"))?;
        Ok(row.map(map_invoice_row))
    }

    pub async fn get_subscription(
        &self,
        tenant_id: Uuid,
    ) -> Result<Option<BillingSubscriptionDto>, CoreError> {
        sqlx::query_as::<_, BillingSubscriptionDto>(
            "SELECT
                id, tenant_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, latest_invoice_id, created_at, updated_at
             FROM billing_subscriptions
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT 1",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load billing subscription"))
    }

    pub async fn get_subscription_by_id(
        &self,
        tenant_id: Uuid,
        subscription_id: Uuid,
    ) -> Result<Option<BillingSubscriptionDto>, CoreError> {
        sqlx::query_as::<_, BillingSubscriptionDto>(
            "SELECT
                id, tenant_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, latest_invoice_id, created_at, updated_at
             FROM billing_subscriptions
             WHERE tenant_id = $1 AND id = $2",
        )
        .bind(tenant_id)
        .bind(subscription_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load billing subscription"))
    }

    pub async fn create_subscription(
        &self,
        tenant_id: Uuid,
        plan_code: &str,
        provider: &str,
        amount: i64,
        currency: &str,
        status: &str,
    ) -> Result<BillingSubscriptionDto, CoreError> {
        sqlx::query_as::<_, BillingSubscriptionDto>(
            "INSERT INTO billing_subscriptions
                (tenant_id, plan_code, status, provider, amount, currency, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING
                id, tenant_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, latest_invoice_id, created_at, updated_at",
        )
        .bind(tenant_id)
        .bind(plan_code)
        .bind(status)
        .bind(provider)
        .bind(amount)
        .bind(currency)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("BILLING_SUBSCRIPTION_FAILED", "Failed to create subscription")
                .with_details(json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn update_subscription_pending_plan(
        &self,
        tenant_id: Uuid,
        subscription_id: Uuid,
        plan_code: &str,
        amount: i64,
        status: &str,
    ) -> Result<BillingSubscriptionDto, CoreError> {
        sqlx::query_as::<_, BillingSubscriptionDto>(
            "UPDATE billing_subscriptions
             SET plan_code = $1, amount = $2, status = $3, updated_at = NOW()
             WHERE tenant_id = $4 AND id = $5
             RETURNING
                id, tenant_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, latest_invoice_id, created_at, updated_at",
        )
        .bind(plan_code)
        .bind(amount)
        .bind(status)
        .bind(tenant_id)
        .bind(subscription_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("BILLING_SUBSCRIPTION_FAILED", "Failed to update subscription")
                .with_details(json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn activate_subscription(
        &self,
        tenant_id: Uuid,
        subscription_id: Uuid,
        plan_code: &str,
        provider_ref: &str,
        amount: i64,
        period_start: DateTime<Utc>,
        period_end: DateTime<Utc>,
        latest_invoice_id: Uuid,
    ) -> Result<BillingSubscriptionDto, CoreError> {
        sqlx::query_as::<_, BillingSubscriptionDto>(
            "UPDATE billing_subscriptions
             SET
                plan_code = $1,
                status = 'active',
                provider_ref = $2,
                amount = $3,
                period_start = $4,
                period_end = $5,
                latest_invoice_id = $6,
                updated_at = NOW()
             WHERE tenant_id = $7 AND id = $8
             RETURNING
                id, tenant_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, latest_invoice_id, created_at, updated_at",
        )
        .bind(plan_code)
        .bind(provider_ref)
        .bind(amount)
        .bind(period_start)
        .bind(period_end)
        .bind(latest_invoice_id)
        .bind(tenant_id)
        .bind(subscription_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("BILLING_SUBSCRIPTION_FAILED", "Failed to activate subscription")
                .with_details(json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn mark_subscription_past_due(
        &self,
        tenant_id: Uuid,
        subscription_id: Uuid,
    ) -> Result<(), CoreError> {
        sqlx::query(
            "UPDATE billing_subscriptions
             SET status = 'past_due', updated_at = NOW()
             WHERE tenant_id = $1 AND id = $2 AND status = 'active'",
        )
        .bind(tenant_id)
        .bind(subscription_id)
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to mark subscription past due"))?;
        Ok(())
    }

    pub async fn insert_invoice(
        &self,
        input: BillingInvoiceInsertInput,
    ) -> Result<BillingInvoiceDto, CoreError> {
        let row = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "INSERT INTO billing_invoices
                (id, tenant_id, subscription_id, plan_code, status, provider, provider_ref, amount, currency,
                 period_start, period_end, due_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, updated_at)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 $10, $11, $12, $13, $14, $15, $16, NOW())
             RETURNING
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at",
        )
        .bind(input.id)
        .bind(input.tenant_id)
        .bind(input.subscription_id)
        .bind(input.plan_code)
        .bind(input.status)
        .bind(input.provider)
        .bind(input.provider_ref)
        .bind(input.amount)
        .bind(input.currency)
        .bind(input.period_start)
        .bind(input.period_end)
        .bind(input.due_at)
        .bind(input.checkout_url)
        .bind(input.pdf_path)
        .bind(input.pdf_url)
        .bind(input.raw_payload_jsonb)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("BILLING_INVOICE_FAILED", "Failed to create invoice")
                .with_details(json!({ "db_error": e.to_string() }))
        })?;
        Ok(map_invoice_row(row))
    }

    pub async fn update_invoice_checkout_url(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
        checkout_url: &str,
    ) -> Result<BillingInvoiceDto, CoreError> {
        let row = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "UPDATE billing_invoices
             SET checkout_url = $1, updated_at = NOW()
             WHERE tenant_id = $2 AND id = $3
             RETURNING
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at",
        )
        .bind(checkout_url)
        .bind(tenant_id)
        .bind(invoice_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update invoice checkout url"))?;
        Ok(map_invoice_row(row))
    }

    pub async fn get_invoice(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
    ) -> Result<Option<BillingInvoiceDto>, CoreError> {
        let row = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "SELECT
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at
             FROM billing_invoices
             WHERE tenant_id = $1 AND id = $2",
        )
        .bind(tenant_id)
        .bind(invoice_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load invoice"))?;
        Ok(row.map(map_invoice_row))
    }

    pub async fn get_invoice_raw(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
    ) -> Result<Option<BillingInvoiceRawRow>, CoreError> {
        sqlx::query_as::<_, BillingInvoiceRawRow>(
            "SELECT
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at
             FROM billing_invoices
             WHERE tenant_id = $1 AND id = $2",
        )
        .bind(tenant_id)
        .bind(invoice_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load raw invoice"))
    }

    pub async fn get_invoice_raw_by_provider_ref(
        &self,
        provider_ref: &str,
    ) -> Result<Option<BillingInvoiceRawRow>, CoreError> {
        sqlx::query_as::<_, BillingInvoiceRawRow>(
            "SELECT
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at
             FROM billing_invoices
             WHERE provider_ref = $1",
        )
        .bind(provider_ref)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load invoice by provider ref"))
    }

    pub async fn update_invoice_status(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
        status: &str,
        paid_at: Option<DateTime<Utc>>,
        raw_payload_jsonb: Value,
    ) -> Result<BillingInvoiceDto, CoreError> {
        let row = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "UPDATE billing_invoices
             SET status = $1, paid_at = $2, raw_payload_jsonb = $3, updated_at = NOW()
             WHERE tenant_id = $4 AND id = $5
             RETURNING
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at",
        )
        .bind(status)
        .bind(paid_at)
        .bind(raw_payload_jsonb)
        .bind(tenant_id)
        .bind(invoice_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update invoice status"))?;
        Ok(map_invoice_row(row))
    }

    pub async fn update_tenant_plan(
        &self,
        tenant_id: Uuid,
        plan_code: &str,
        users_quota: i32,
        ai_credits_quota: i32,
    ) -> Result<(), CoreError> {
        sqlx::query(
            "UPDATE tenants
             SET plan = $1, users_quota = $2, ai_credits_quota = $3, updated_at = NOW()
             WHERE id = $4",
        )
        .bind(plan_code)
        .bind(users_quota)
        .bind(ai_credits_quota)
        .bind(tenant_id)
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update tenant plan"))?;
        Ok(())
    }

    pub async fn insert_webhook_event(
        &self,
        tenant_id: Option<Uuid>,
        provider: &str,
        event_key: &str,
        provider_ref: Option<&str>,
        raw_payload_jsonb: Value,
    ) -> Result<Option<BillingWebhookEventRow>, CoreError> {
        sqlx::query_as::<_, BillingWebhookEventRow>(
            "INSERT INTO billing_webhook_events
                (tenant_id, provider, event_key, provider_ref, raw_payload_jsonb)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (provider, event_key) DO NOTHING
             RETURNING id",
        )
        .bind(tenant_id)
        .bind(provider)
        .bind(event_key)
        .bind(provider_ref)
        .bind(raw_payload_jsonb)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to persist webhook event"))
    }

    pub async fn list_due_invoices_for_dunning(
        &self,
        max_attempts: i32,
        limit: i64,
    ) -> Result<Vec<BillingInvoiceDto>, CoreError> {
        let rows = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "SELECT
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at
             FROM billing_invoices
             WHERE status IN ('pending', 'overdue')
               AND due_at <= NOW()
               AND attempt_count < $1
               AND (next_retry_at IS NULL OR next_retry_at <= NOW())
             ORDER BY due_at ASC
             LIMIT $2",
        )
        .bind(max_attempts)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load due billing invoices"))?;
        Ok(rows.into_iter().map(map_invoice_row).collect())
    }

    pub async fn mark_invoice_dunning_attempt(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
        next_status: &str,
        next_retry_at: Option<DateTime<Utc>>,
    ) -> Result<BillingInvoiceDto, CoreError> {
        let row = sqlx::query_as::<_, BillingInvoiceRawRow>(
            "UPDATE billing_invoices
             SET
                status = $1,
                attempt_count = attempt_count + 1,
                next_retry_at = $2,
                updated_at = NOW()
             WHERE tenant_id = $3 AND id = $4
             RETURNING
                id, tenant_id, subscription_id, plan_code, status, provider, provider_ref,
                amount, currency, period_start, period_end, due_at, paid_at, attempt_count,
                next_retry_at, checkout_url, pdf_path, pdf_url, raw_payload_jsonb, created_at, updated_at",
        )
        .bind(next_status)
        .bind(next_retry_at)
        .bind(tenant_id)
        .bind(invoice_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to mark invoice dunning attempt"))?;
        Ok(map_invoice_row(row))
    }
}

fn map_invoice_row(row: BillingInvoiceRawRow) -> BillingInvoiceDto {
    BillingInvoiceDto {
        id: row.id,
        tenant_id: row.tenant_id,
        subscription_id: row.subscription_id,
        plan_code: row.plan_code,
        status: row.status,
        provider: row.provider,
        provider_ref: row.provider_ref,
        amount: row.amount,
        currency: row.currency,
        period_start: row.period_start,
        period_end: row.period_end,
        due_at: row.due_at,
        paid_at: row.paid_at,
        attempt_count: row.attempt_count,
        next_retry_at: row.next_retry_at,
        checkout_url: row.checkout_url,
        pdf_url: row.pdf_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}
