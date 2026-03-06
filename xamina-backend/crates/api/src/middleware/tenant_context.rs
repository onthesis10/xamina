use axum::{extract::State, http::Request, middleware::Next, response::Response};
use sqlx::PgPool;

use crate::{app::SharedState, middleware::auth::decode_claims};

async fn set_app_context(pool: &PgPool, tenant_id: Option<&str>, role: Option<&str>) {
    let _ = sqlx::query(
        "SELECT set_config('app.tenant_id', COALESCE($1, ''), false),
                set_config('app.role', COALESCE($2, ''), false)",
    )
    .bind(tenant_id)
    .bind(role)
    .execute(pool)
    .await;
}

pub async fn apply_tenant_context(
    State(state): State<SharedState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let mut tenant_for_context: Option<String> = None;
    let mut role_for_context: Option<String> = None;

    if let Some(token) = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    {
        if let Ok(mut claims) = decode_claims(token, &state.jwt_secret) {
            if claims.role == "super_admin" {
                if let Some(raw_tenant) = request
                    .headers()
                    .get("x-tenant-id")
                    .and_then(|v| v.to_str().ok())
                    .filter(|v| !v.is_empty())
                {
                    if let Ok(target) = uuid::Uuid::parse_str(raw_tenant) {
                        claims.tenant_id = target;
                    }
                }
            }

            tenant_for_context = Some(claims.tenant_id.to_string());
            role_for_context = Some(claims.role);
        }
    }

    set_app_context(
        &state.pool,
        tenant_for_context.as_deref(),
        role_for_context.as_deref(),
    )
    .await;

    next.run(request).await
}
