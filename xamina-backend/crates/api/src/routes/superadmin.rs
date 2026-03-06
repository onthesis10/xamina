use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/platform/tenants", get(list_tenants).post(create_tenant))
        .route(
            "/platform/tenants/:id",
            get(get_tenant).patch(update_tenant),
        )
}

#[derive(Debug, Deserialize)]
struct ListTenantsQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
}

#[derive(Debug, Serialize)]
struct PageMeta {
    page: i64,
    page_size: i64,
    total: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct TenantRow {
    id: Uuid,
    name: String,
    slug: String,
    plan: String,
    is_active: bool,
    users_quota: i32,
    ai_credits_quota: i32,
    ai_credits_used: i32,
    users_count: i64,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
struct CreateTenantPayload {
    name: String,
    slug: String,
    plan: Option<String>,
    users_quota: Option<i32>,
    ai_credits_quota: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct UpdateTenantPayload {
    name: Option<String>,
    slug: Option<String>,
    plan: Option<String>,
    is_active: Option<bool>,
    users_quota: Option<i32>,
    ai_credits_quota: Option<i32>,
    ai_credits_used: Option<i32>,
}

fn ensure_super_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "super_admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "super_admin role required",
        ));
    }
    Ok(())
}

fn sanitize_plan(input: Option<String>) -> String {
    let value = input.unwrap_or_else(|| "starter".to_string());
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "starter" | "professional" | "enterprise" => normalized,
        _ => "starter".to_string(),
    }
}

async fn list_tenants(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListTenantsQuery>,
) -> ApiResult<SuccessWithMeta<Vec<TenantRow>, PageMeta>> {
    ensure_super_admin(&auth)?;
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)
         FROM tenants
         WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR slug ILIKE '%' || $1 || '%')",
    )
    .bind(query.search.clone())
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to count tenants",
        )
    })?;

    let rows = sqlx::query_as::<_, TenantRow>(
        "SELECT
            t.id,
            t.name,
            t.slug,
            t.plan,
            t.is_active,
            t.users_quota,
            t.ai_credits_quota,
            t.ai_credits_used,
            COALESCE(COUNT(u.id), 0)::bigint AS users_count,
            t.created_at,
            t.updated_at
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.id
         WHERE ($1::text IS NULL OR t.name ILIKE '%' || $1 || '%' OR t.slug ILIKE '%' || $1 || '%')
         GROUP BY t.id
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3",
    )
    .bind(query.search)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to list tenants",
        )
    })?;

    Ok(Json(SuccessWithMeta {
        success: true,
        data: rows,
        meta: PageMeta {
            page,
            page_size,
            total,
        },
    }))
}

async fn create_tenant(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<CreateTenantPayload>,
) -> ApiResult<SuccessResponse<TenantRow>> {
    ensure_super_admin(&auth)?;
    if body.name.trim().is_empty() || body.slug.trim().is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "name and slug are required",
        ));
    }

    let row = sqlx::query_as::<_, TenantRow>(
        "WITH inserted AS (
            INSERT INTO tenants (name, slug, plan, is_active, users_quota, ai_credits_quota, ai_credits_used, updated_at)
            VALUES ($1, $2, $3, TRUE, $4, $5, 0, NOW())
            RETURNING id, name, slug, plan, is_active, users_quota, ai_credits_quota, ai_credits_used, created_at, updated_at
         )
         SELECT
            i.id, i.name, i.slug, i.plan, i.is_active, i.users_quota, i.ai_credits_quota, i.ai_credits_used,
            0::bigint AS users_count, i.created_at, i.updated_at
         FROM inserted i",
    )
    .bind(body.name.trim())
    .bind(body.slug.trim().to_ascii_lowercase())
    .bind(sanitize_plan(body.plan))
    .bind(body.users_quota.unwrap_or(500).max(1))
    .bind(body.ai_credits_quota.unwrap_or(200).max(0))
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "CREATE_TENANT_FAILED",
            "Failed to create tenant",
        )
        .with_details(json!({ "db_error": e.to_string() }))
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn get_tenant(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<TenantRow>> {
    ensure_super_admin(&auth)?;
    let row = sqlx::query_as::<_, TenantRow>(
        "SELECT
            t.id,
            t.name,
            t.slug,
            t.plan,
            t.is_active,
            t.users_quota,
            t.ai_credits_quota,
            t.ai_credits_used,
            COALESCE(COUNT(u.id), 0)::bigint AS users_count,
            t.created_at,
            t.updated_at
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.id
         WHERE t.id = $1
         GROUP BY t.id",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load tenant",
        )
    })?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Tenant not found"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn update_tenant(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTenantPayload>,
) -> ApiResult<SuccessResponse<TenantRow>> {
    ensure_super_admin(&auth)?;

    let existing = sqlx::query_as::<_, TenantRow>(
        "SELECT
            t.id,
            t.name,
            t.slug,
            t.plan,
            t.is_active,
            t.users_quota,
            t.ai_credits_quota,
            t.ai_credits_used,
            COALESCE(COUNT(u.id), 0)::bigint AS users_count,
            t.created_at,
            t.updated_at
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.id
         WHERE t.id = $1
         GROUP BY t.id",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load tenant",
        )
    })?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Tenant not found"))?;

    let users_quota = body.users_quota.unwrap_or(existing.users_quota).max(1);
    let ai_credits_quota = body
        .ai_credits_quota
        .unwrap_or(existing.ai_credits_quota)
        .max(0);
    let ai_credits_used = body
        .ai_credits_used
        .unwrap_or(existing.ai_credits_used)
        .max(0);

    let row = sqlx::query_as::<_, TenantRow>(
        "WITH updated AS (
            UPDATE tenants
            SET
              name = $1,
              slug = $2,
              plan = $3,
              is_active = $4,
              users_quota = $5,
              ai_credits_quota = $6,
              ai_credits_used = $7,
              updated_at = NOW()
            WHERE id = $8
            RETURNING id, name, slug, plan, is_active, users_quota, ai_credits_quota, ai_credits_used, created_at, updated_at
         )
         SELECT
            u.id, u.name, u.slug, u.plan, u.is_active, u.users_quota, u.ai_credits_quota, u.ai_credits_used,
            COALESCE((SELECT COUNT(*) FROM users us WHERE us.tenant_id = u.id), 0)::bigint AS users_count,
            u.created_at, u.updated_at
         FROM updated u
        ",
    )
    .bind(body.name.unwrap_or(existing.name))
    .bind(
        body.slug
            .unwrap_or(existing.slug)
            .trim()
            .to_ascii_lowercase(),
    )
    .bind(sanitize_plan(body.plan.or(Some(existing.plan))))
    .bind(body.is_active.unwrap_or(existing.is_active))
    .bind(users_quota)
    .bind(ai_credits_quota)
    .bind(ai_credits_used)
    .bind(id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "UPDATE_TENANT_FAILED",
            "Failed to update tenant",
        )
        .with_details(json!({ "db_error": e.to_string() }))
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}
