use sqlx::PgPool;

use crate::error::CoreError;

use super::models::AiUsageLogCreate;

#[derive(Debug, Clone)]
pub struct AiRepository {
    pool: PgPool,
}

impl AiRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn insert_usage_log(&self, payload: &AiUsageLogCreate) -> Result<(), CoreError> {
        sqlx::query(
            "INSERT INTO ai_usage_logs (
                tenant_id,
                user_id,
                endpoint,
                provider,
                model,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                estimated_cost_usd,
                status,
                error_code,
                latency_ms,
                metadata
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::numeric, $10, $11, $12, $13
            )",
        )
        .bind(payload.tenant_id)
        .bind(payload.user_id)
        .bind(payload.endpoint.clone())
        .bind(payload.provider.clone())
        .bind(payload.model.clone())
        .bind(payload.prompt_tokens)
        .bind(payload.completion_tokens)
        .bind(payload.total_tokens)
        .bind(payload.estimated_cost_usd)
        .bind(payload.status.clone())
        .bind(payload.error_code.clone())
        .bind(payload.latency_ms)
        .bind(payload.metadata.clone())
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to insert AI usage log"))?;

        Ok(())
    }
}
