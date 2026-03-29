use sqlx::PgPool;

use crate::app::{ApiError, SharedState};

pub async fn ensure_privacy_schema(pool: &PgPool) -> Result<(), ApiError> {
    for statement in [
        "CREATE TABLE IF NOT EXISTS account_deletion_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reason TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
            notes TEXT,
            requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_at TIMESTAMPTZ,
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
        "CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_created
            ON account_deletion_requests (tenant_id, user_id, requested_at DESC)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_requests_user_pending
            ON account_deletion_requests (tenant_id, user_id)
            WHERE status = 'pending'",
        "ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY",
        "DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'account_deletion_requests'
                  AND policyname = 'account_deletion_requests_tenant_isolation'
            ) THEN
                CREATE POLICY account_deletion_requests_tenant_isolation ON account_deletion_requests
                  USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
                  WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id());
            END IF;
        END$$",
    ] {
        sqlx::query(statement).execute(pool).await.map_err(|_| {
            ApiError::new(
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed to ensure privacy schema",
            )
        })?;
    }

    Ok(())
}

pub async fn ensure_privacy_schema_for_state(state: &SharedState) -> Result<(), ApiError> {
    ensure_privacy_schema(&state.pool).await
}
