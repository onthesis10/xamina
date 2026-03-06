use axum::{extract::State, routing::get, Json, Router};
use xamina_core::domain::analytics::dto::{DashboardStatsDto, DashboardSummaryDto};

use crate::{
    app::{ApiResult, SharedState, SuccessResponse},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/dashboard/summary", get(dashboard_summary))
        .route("/dashboard/stats", get(dashboard_stats))
}

async fn dashboard_summary(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<DashboardSummaryDto>> {
    let data = state
        .services
        .analytics
        .dashboard_summary(auth.0.tenant_id, auth.0.sub, &auth.0.role)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn dashboard_stats(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<DashboardStatsDto>> {
    let data = state
        .services
        .analytics
        .dashboard_stats(auth.0.tenant_id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}
