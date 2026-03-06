use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::error::CoreError;

#[derive(Debug, FromRow)]
struct TenantQuotaRow {
    ai_credits_quota: i32,
    ai_credits_used: i32,
}

#[derive(Debug, Clone)]
pub struct TenantRepository {
    pool: PgPool,
}

impl TenantRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn check_and_deduct_ai_credits(
        &self,
        tenant_id: Uuid,
        amount: i32,
    ) -> Result<(), CoreError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to start transaction"))?;

        // Lock the row to prevent race conditions when checking/updating
        let tenant = sqlx::query_as::<_, TenantQuotaRow>(
            "SELECT ai_credits_quota, ai_credits_used FROM tenants WHERE id = $1 FOR UPDATE",
        )
        .bind(tenant_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to fetch tenant"))?
        .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Tenant not found"))?;

        if tenant.ai_credits_used + amount > tenant.ai_credits_quota {
            return Err(CoreError::bad_request(
                "QUOTA_EXCEEDED",
                format!(
                    "AI credits quota exceeded. Used: {}, Quota: {}, Required: {}",
                    tenant.ai_credits_used, tenant.ai_credits_quota, amount
                ),
            ));
        }

        sqlx::query("UPDATE tenants SET ai_credits_used = ai_credits_used + $1 WHERE id = $2")
            .bind(amount)
            .bind(tenant_id)
            .execute(&mut *tx)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update tenant AI credits"))?;

        tx.commit()
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to commit transaction"))?;

        Ok(())
    }
}
