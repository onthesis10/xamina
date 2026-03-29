use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, QueryBuilder};
use uuid::Uuid;

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
    platform_audit::{ensure_platform_ops_schema, record_platform_audit},
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/platform/analytics/overview", get(analytics_overview))
        .route("/platform/system/health", get(system_health))
        .route(
            "/platform/ai-config",
            get(get_platform_ai_config).patch(update_platform_ai_config),
        )
        .route("/platform/audit-logs", get(list_platform_audit_logs))
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

#[derive(Debug, Serialize)]
struct PlatformAnalyticsOverviewDto {
    totals: PlatformAnalyticsTotalsDto,
    trend_14d: Vec<PlatformTrendPointDto>,
    top_tenants: Vec<PlatformTenantSnapshotDto>,
}

#[derive(Debug, Serialize, FromRow)]
struct PlatformAnalyticsTotalsDto {
    tenants_total: i64,
    active_tenants_total: i64,
    users_total: i64,
    exams_total: i64,
    submissions_total: i64,
    ai_requests_total: i64,
    active_mrr_total: i64,
    pending_invoices_total: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct PlatformTrendPointDto {
    day: String,
    submissions: i64,
    ai_requests: i64,
    paid_invoices: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct PlatformTenantSnapshotDto {
    tenant_id: Uuid,
    tenant_name: String,
    plan: String,
    users_count: i64,
    exams_count: i64,
    submissions_count: i64,
    ai_requests_30d: i64,
    mrr: i64,
    last_activity_at: DateTime<Utc>,
}

async fn analytics_overview(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<PlatformAnalyticsOverviewDto>> {
    ensure_super_admin(&auth)?;

    let totals = sqlx::query_as::<_, PlatformAnalyticsTotalsDto>(
        "SELECT
            (SELECT COUNT(*)::bigint FROM tenants) AS tenants_total,
            (SELECT COUNT(*)::bigint FROM tenants WHERE is_active = TRUE) AS active_tenants_total,
            (SELECT COUNT(*)::bigint FROM users) AS users_total,
            (SELECT COUNT(*)::bigint FROM exams) AS exams_total,
            (SELECT COUNT(*)::bigint FROM submissions) AS submissions_total,
            (SELECT COUNT(*)::bigint FROM ai_usage_logs) AS ai_requests_total,
            (
              SELECT COALESCE(SUM(amount), 0)::bigint
              FROM billing_subscriptions
              WHERE status IN ('active', 'past_due', 'pending_activation')
            ) AS active_mrr_total,
            (
              SELECT COUNT(*)::bigint
              FROM billing_invoices
              WHERE status IN ('pending', 'overdue', 'failed')
            ) AS pending_invoices_total",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load platform analytics totals",
        )
    })?;

    let trend_14d = sqlx::query_as::<_, PlatformTrendPointDto>(
        "WITH days AS (
            SELECT generate_series(
                date_trunc('day', NOW()) - INTERVAL '13 day',
                date_trunc('day', NOW()),
                INTERVAL '1 day'
            ) AS day_bucket
         ),
         submissions_daily AS (
            SELECT date_trunc('day', created_at) AS day_bucket, COUNT(*) AS submissions
            FROM submissions
            GROUP BY 1
         ),
         ai_daily AS (
            SELECT date_trunc('day', created_at) AS day_bucket, COUNT(*) AS ai_requests
            FROM ai_usage_logs
            GROUP BY 1
         ),
         paid_invoice_daily AS (
            SELECT date_trunc('day', paid_at) AS day_bucket, COUNT(*) AS paid_invoices
            FROM billing_invoices
            WHERE status = 'paid' AND paid_at IS NOT NULL
            GROUP BY 1
         )
         SELECT
            to_char(days.day_bucket::date, 'YYYY-MM-DD') AS day,
            COALESCE(submissions_daily.submissions, 0)::bigint AS submissions,
            COALESCE(ai_daily.ai_requests, 0)::bigint AS ai_requests,
            COALESCE(paid_invoice_daily.paid_invoices, 0)::bigint AS paid_invoices
         FROM days
         LEFT JOIN submissions_daily ON submissions_daily.day_bucket = days.day_bucket
         LEFT JOIN ai_daily ON ai_daily.day_bucket = days.day_bucket
         LEFT JOIN paid_invoice_daily ON paid_invoice_daily.day_bucket = days.day_bucket
         ORDER BY days.day_bucket ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load platform analytics trends",
        )
    })?;

    let top_tenants = sqlx::query_as::<_, PlatformTenantSnapshotDto>(
        "SELECT
            t.id AS tenant_id,
            t.name AS tenant_name,
            t.plan,
            COALESCE(u.users_count, 0)::bigint AS users_count,
            COALESCE(e.exams_count, 0)::bigint AS exams_count,
            COALESCE(s.submissions_count, 0)::bigint AS submissions_count,
            COALESCE(ai.ai_requests_30d, 0)::bigint AS ai_requests_30d,
            COALESCE(b.mrr, 0)::bigint AS mrr,
            GREATEST(
              COALESCE(s.last_submission_at, to_timestamp(0)),
              COALESCE(ai.last_ai_at, to_timestamp(0)),
              t.updated_at
            ) AS last_activity_at
         FROM tenants t
         LEFT JOIN (
            SELECT tenant_id, COUNT(*) AS users_count
            FROM users
            GROUP BY tenant_id
         ) u ON u.tenant_id = t.id
         LEFT JOIN (
            SELECT tenant_id, COUNT(*) AS exams_count
            FROM exams
            GROUP BY tenant_id
         ) e ON e.tenant_id = t.id
         LEFT JOIN (
            SELECT tenant_id, COUNT(*) AS submissions_count, MAX(created_at) AS last_submission_at
            FROM submissions
            GROUP BY tenant_id
         ) s ON s.tenant_id = t.id
         LEFT JOIN (
            SELECT tenant_id, COUNT(*) AS ai_requests_30d, MAX(created_at) AS last_ai_at
            FROM ai_usage_logs
            WHERE created_at >= NOW() - INTERVAL '30 day'
            GROUP BY tenant_id
         ) ai ON ai.tenant_id = t.id
         LEFT JOIN (
            SELECT tenant_id, COALESCE(SUM(amount), 0)::bigint AS mrr
            FROM billing_subscriptions
            WHERE status IN ('active', 'past_due', 'pending_activation')
            GROUP BY tenant_id
         ) b ON b.tenant_id = t.id
         ORDER BY submissions_count DESC, ai_requests_30d DESC, users_count DESC
         LIMIT 5",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load top tenant analytics",
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: PlatformAnalyticsOverviewDto {
            totals,
            trend_14d,
            top_tenants,
        },
    }))
}

#[derive(Debug, Serialize)]
struct RuntimeDependencyHealth {
    healthy: bool,
    detail: String,
}

#[derive(Debug, Serialize, FromRow)]
struct QueueBacklogSummary {
    email_jobs: i64,
    push_jobs: i64,
    billing_retries: i64,
}

#[derive(Debug, Serialize)]
struct PlatformSystemHealthDto {
    generated_at: DateTime<Utc>,
    uptime_seconds: i64,
    billing_provider: String,
    db: RuntimeDependencyHealth,
    redis: RuntimeDependencyHealth,
    queue_backlog: QueueBacklogSummary,
}

async fn system_health(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<PlatformSystemHealthDto>> {
    ensure_super_admin(&auth)?;

    let db_health = match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
    {
        Ok(_) => RuntimeDependencyHealth {
            healthy: true,
            detail: "Database ping OK".to_string(),
        },
        Err(err) => RuntimeDependencyHealth {
            healthy: false,
            detail: format!("Database ping failed: {err}"),
        },
    };

    let redis_health = match state.redis.get_multiplexed_async_connection().await {
        Ok(mut conn) => match redis::cmd("PING").query_async::<String>(&mut conn).await {
            Ok(value) if value.eq_ignore_ascii_case("PONG") => RuntimeDependencyHealth {
                healthy: true,
                detail: "Redis ping OK".to_string(),
            },
            Ok(value) => RuntimeDependencyHealth {
                healthy: false,
                detail: format!("Unexpected redis ping response: {value}"),
            },
            Err(err) => RuntimeDependencyHealth {
                healthy: false,
                detail: format!("Redis ping failed: {err}"),
            },
        },
        Err(err) => RuntimeDependencyHealth {
            healthy: false,
            detail: format!("Redis connection failed: {err}"),
        },
    };

    let queue_backlog = sqlx::query_as::<_, QueueBacklogSummary>(
        "SELECT
            (SELECT COUNT(*) FROM email_jobs WHERE status IN ('queued', 'processing', 'retry')) AS email_jobs,
            (SELECT COUNT(*) FROM push_jobs WHERE status IN ('queued', 'processing', 'retry')) AS push_jobs,
            (
                SELECT COUNT(*)
                FROM billing_invoices
                WHERE status IN ('pending', 'overdue')
                  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            ) AS billing_retries",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load queue backlog summary",
        )
    })?;

    let generated_at = Utc::now();
    let uptime_seconds = (generated_at - state.started_at).num_seconds().max(0);

    Ok(Json(SuccessResponse {
        success: true,
        data: PlatformSystemHealthDto {
            generated_at,
            uptime_seconds,
            billing_provider: state.billing.provider.clone(),
            db: db_health,
            redis: redis_health,
            queue_backlog,
        },
    }))
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
struct PlatformAiConfigDto {
    preferred_provider: String,
    openai_model: String,
    groq_model: String,
    ai_mock_mode: bool,
    generate_rate_limit_per_min: i32,
    grade_rate_limit_per_min: i32,
    extract_rate_limit_per_min: i32,
    updated_by: Option<Uuid>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct UpdatePlatformAiConfigInput {
    preferred_provider: Option<String>,
    openai_model: Option<String>,
    groq_model: Option<String>,
    ai_mock_mode: Option<bool>,
    generate_rate_limit_per_min: Option<i32>,
    grade_rate_limit_per_min: Option<i32>,
    extract_rate_limit_per_min: Option<i32>,
}

async fn ensure_platform_ai_settings_exists(state: &SharedState) -> Result<(), ApiError> {
    ensure_platform_ops_schema(&state.pool).await?;

    sqlx::query(
        "INSERT INTO platform_ai_settings (
            id,
            preferred_provider,
            openai_model,
            groq_model,
            ai_mock_mode,
            generate_rate_limit_per_min,
            grade_rate_limit_per_min,
            extract_rate_limit_per_min
        ) VALUES (TRUE, 'auto', 'gpt-4o-mini', 'llama-3.1-8b-instant', FALSE, 12, 30, 10)
        ON CONFLICT (id) DO NOTHING",
    )
    .execute(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to ensure platform AI config row",
        )
    })?;
    Ok(())
}

async fn get_platform_ai_config(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<PlatformAiConfigDto>> {
    ensure_super_admin(&auth)?;
    ensure_platform_ai_settings_exists(&state).await?;

    let data = sqlx::query_as::<_, PlatformAiConfigDto>(
        "SELECT
            preferred_provider,
            openai_model,
            groq_model,
            ai_mock_mode,
            generate_rate_limit_per_min,
            grade_rate_limit_per_min,
            extract_rate_limit_per_min,
            updated_by,
            updated_at
         FROM platform_ai_settings
         WHERE id = TRUE",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load platform AI config",
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn update_platform_ai_config(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<UpdatePlatformAiConfigInput>,
) -> ApiResult<SuccessResponse<PlatformAiConfigDto>> {
    ensure_super_admin(&auth)?;
    ensure_platform_ai_settings_exists(&state).await?;

    let normalized_provider = body.preferred_provider.as_ref().map(|value| {
        value
            .trim()
            .to_ascii_lowercase()
            .replace(' ', "")
            .replace('_', "")
    });
    if let Some(provider) = normalized_provider.as_deref() {
        if provider != "auto" && provider != "openai" && provider != "groq" {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "preferred_provider must be one of: auto, openai, groq",
            ));
        }
    }

    for value in [
        body.generate_rate_limit_per_min,
        body.grade_rate_limit_per_min,
        body.extract_rate_limit_per_min,
    ]
    .into_iter()
    .flatten()
    {
        if value <= 0 {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "rate limit values must be greater than 0",
            ));
        }
    }

    let data = sqlx::query_as::<_, PlatformAiConfigDto>(
        "UPDATE platform_ai_settings
         SET
            preferred_provider = COALESCE($1, preferred_provider),
            openai_model = COALESCE(NULLIF($2, ''), openai_model),
            groq_model = COALESCE(NULLIF($3, ''), groq_model),
            ai_mock_mode = COALESCE($4, ai_mock_mode),
            generate_rate_limit_per_min = COALESCE($5, generate_rate_limit_per_min),
            grade_rate_limit_per_min = COALESCE($6, grade_rate_limit_per_min),
            extract_rate_limit_per_min = COALESCE($7, extract_rate_limit_per_min),
            updated_by = $8,
            updated_at = NOW()
         WHERE id = TRUE
         RETURNING
            preferred_provider,
            openai_model,
            groq_model,
            ai_mock_mode,
            generate_rate_limit_per_min,
            grade_rate_limit_per_min,
            extract_rate_limit_per_min,
            updated_by,
            updated_at",
    )
    .bind(normalized_provider)
    .bind(
        body.openai_model
            .as_ref()
            .map(|value| value.trim().to_string()),
    )
    .bind(
        body.groq_model
            .as_ref()
            .map(|value| value.trim().to_string()),
    )
    .bind(body.ai_mock_mode)
    .bind(body.generate_rate_limit_per_min)
    .bind(body.grade_rate_limit_per_min)
    .bind(body.extract_rate_limit_per_min)
    .bind(auth.0.sub)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to update platform AI config",
        )
    })?;

    record_platform_audit(
        &state.pool,
        &auth,
        "platform.ai_config.updated",
        "platform_ai_config",
        None,
        None,
        json!({
            "preferred_provider": data.preferred_provider,
            "openai_model": data.openai_model,
            "groq_model": data.groq_model,
            "ai_mock_mode": data.ai_mock_mode,
            "generate_rate_limit_per_min": data.generate_rate_limit_per_min,
            "grade_rate_limit_per_min": data.grade_rate_limit_per_min,
            "extract_rate_limit_per_min": data.extract_rate_limit_per_min
        }),
    )
    .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

#[derive(Debug, Deserialize)]
struct ListAuditLogQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    action: Option<String>,
    tenant_id: Option<Uuid>,
    target_type: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct PlatformAuditLogDto {
    id: Uuid,
    tenant_id: Option<Uuid>,
    actor_user_id: Option<Uuid>,
    actor_role: String,
    actor_name: Option<String>,
    actor_email: Option<String>,
    action: String,
    target_type: String,
    target_id: Option<Uuid>,
    metadata_jsonb: serde_json::Value,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct PlatformAuditMeta {
    page: i64,
    page_size: i64,
    total: i64,
}

async fn list_platform_audit_logs(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListAuditLogQuery>,
) -> ApiResult<SuccessWithMeta<Vec<PlatformAuditLogDto>, PlatformAuditMeta>> {
    ensure_super_admin(&auth)?;
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let action_filter = query
        .action
        .as_ref()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    let target_type_filter = query
        .target_type
        .as_ref()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());

    ensure_platform_ops_schema(&state.pool).await?;

    // platform_audit_logs is guarded by super-admin-only RLS, so we must
    // refresh the app role/tenant GUCs on the exact pooled connection used by
    // the count + data queries below.
    let mut conn = state.pool.acquire().await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to acquire platform audit connection",
        )
    })?;
    sqlx::query(
        "SELECT set_config('app.tenant_id', $1, false),
                set_config('app.role', $2, false)",
    )
    .bind(auth.0.tenant_id.to_string())
    .bind(auth.0.role.as_str())
    .execute(&mut *conn)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to apply platform audit context",
        )
    })?;

    let mut total_query =
        QueryBuilder::new("SELECT COUNT(*)::bigint FROM platform_audit_logs WHERE 1=1");
    if let Some(action) = action_filter.as_deref() {
        total_query
            .push(" AND LOWER(action) LIKE ")
            .push_bind(format!("%{action}%"));
    }
    if let Some(tenant_id) = query.tenant_id {
        total_query.push(" AND tenant_id = ").push_bind(tenant_id);
    }
    if let Some(target_type) = target_type_filter.as_deref() {
        total_query
            .push(" AND LOWER(target_type) = ")
            .push_bind(target_type);
    }
    let total = total_query
        .build_query_scalar::<i64>()
        .fetch_one(&mut *conn)
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "Failed to count platform audit logs");
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed to count platform audit logs",
            )
        })?;

    let mut data_query = QueryBuilder::new(
        "SELECT
            l.id,
            l.tenant_id,
            l.actor_user_id,
            l.actor_role,
            u.name AS actor_name,
            u.email AS actor_email,
            l.action,
            l.target_type,
            l.target_id,
            l.metadata_jsonb,
            l.created_at
         FROM platform_audit_logs l
         LEFT JOIN users u ON u.id = l.actor_user_id
         WHERE 1=1",
    );
    if let Some(action) = action_filter.as_deref() {
        data_query
            .push(" AND LOWER(l.action) LIKE ")
            .push_bind(format!("%{action}%"));
    }
    if let Some(tenant_id) = query.tenant_id {
        data_query.push(" AND l.tenant_id = ").push_bind(tenant_id);
    }
    if let Some(target_type) = target_type_filter.as_deref() {
        data_query
            .push(" AND LOWER(l.target_type) = ")
            .push_bind(target_type);
    }
    let data = data_query
        .push(" ORDER BY l.created_at DESC LIMIT ")
        .push_bind(page_size)
        .push(" OFFSET ")
        .push_bind(offset)
        .build_query_as::<PlatformAuditLogDto>()
        .fetch_all(&mut *conn)
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "Failed to load platform audit logs");
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed to load platform audit logs",
            )
        })?;

    Ok(Json(SuccessWithMeta {
        success: true,
        data,
        meta: PlatformAuditMeta {
            page,
            page_size,
            total,
        },
    }))
}
