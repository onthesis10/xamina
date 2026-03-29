use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{app::ApiError, middleware::auth::AuthUser};

pub async fn ensure_platform_ops_schema(pool: &PgPool) -> Result<(), ApiError> {
    for statement in [
        "CREATE TABLE IF NOT EXISTS platform_ai_settings (
            id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
            preferred_provider TEXT NOT NULL DEFAULT 'auto' CHECK (preferred_provider IN ('auto', 'openai', 'groq')),
            openai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
            groq_model TEXT NOT NULL DEFAULT 'llama-3.1-8b-instant',
            ai_mock_mode BOOLEAN NOT NULL DEFAULT FALSE,
            generate_rate_limit_per_min INT NOT NULL DEFAULT 12 CHECK (generate_rate_limit_per_min > 0),
            grade_rate_limit_per_min INT NOT NULL DEFAULT 30 CHECK (grade_rate_limit_per_min > 0),
            extract_rate_limit_per_min INT NOT NULL DEFAULT 10 CHECK (extract_rate_limit_per_min > 0),
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
        "CREATE TABLE IF NOT EXISTS platform_audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
            actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_role TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id UUID,
            metadata_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
        "CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created_at
            ON platform_audit_logs (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_action
            ON platform_audit_logs (action, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_tenant
            ON platform_audit_logs (tenant_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_actor
            ON platform_audit_logs (actor_user_id, created_at DESC)",
        "ALTER TABLE platform_ai_settings ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY",
        "DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'platform_ai_settings'
                  AND policyname = 'platform_ai_settings_super_admin_only'
            ) THEN
                CREATE POLICY platform_ai_settings_super_admin_only ON platform_ai_settings
                  USING (app.is_super_admin())
                  WITH CHECK (app.is_super_admin());
            END IF;
        END$$",
        "DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'platform_audit_logs'
                  AND policyname = 'platform_audit_logs_super_admin_only'
            ) THEN
                CREATE POLICY platform_audit_logs_super_admin_only ON platform_audit_logs
                  USING (app.is_super_admin())
                  WITH CHECK (app.is_super_admin());
            END IF;
        END$$",
    ] {
        sqlx::query(statement).execute(pool).await.map_err(|_| {
            ApiError::new(
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "PLATFORM_SCHEMA_SYNC_FAILED",
                "Failed to ensure platform operations schema",
            )
        })?;
    }

    Ok(())
}

pub async fn record_platform_audit(
    pool: &PgPool,
    actor: &AuthUser,
    action: &str,
    target_type: &str,
    target_id: Option<Uuid>,
    tenant_id: Option<Uuid>,
    metadata: Value,
) -> Result<(), ApiError> {
    ensure_platform_ops_schema(pool).await?;

    sqlx::query(
        "INSERT INTO platform_audit_logs (
            tenant_id,
            actor_user_id,
            actor_role,
            action,
            target_type,
            target_id,
            metadata_jsonb
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(tenant_id)
    .bind(actor.0.sub)
    .bind(actor.0.role.as_str())
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(metadata)
    .execute(pool)
    .await
    .map_err(|_| {
        ApiError::new(
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "AUDIT_LOG_WRITE_FAILED",
            "Failed to write platform audit log",
        )
    })?;

    Ok(())
}
