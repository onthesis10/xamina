use std::sync::Arc;

use axum::{http::StatusCode, response::IntoResponse, Json, Router};
use serde::Serialize;
use serde_json::json;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use crate::services::AppServices;
use crate::ws_state::WsState;
use crate::{
    ai_metrics,
    middleware::{
        ai_rate_limit::AiRateLimitProfile, metrics::build_metrics_layer,
        tenant_context::apply_tenant_context,
    },
    routes,
};
use xamina_core::error::{CoreError, CoreErrorKind};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub redis: redis::Client,
    pub jwt_secret: String,
    pub access_ttl_minutes: i64,
    pub refresh_ttl_days: i64,
    pub services: AppServices,
    pub ws: WsState,
    pub ai_rate_limits: AiRateLimitProfile,
}

pub type SharedState = Arc<AppState>;

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    pub details: serde_json::Value,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            details: serde_json::Value::Null,
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = details;
        self
    }
}

impl From<CoreError> for ApiError {
    fn from(value: CoreError) -> Self {
        let status = match value.kind {
            CoreErrorKind::BadRequest => StatusCode::BAD_REQUEST,
            CoreErrorKind::Unauthorized => StatusCode::UNAUTHORIZED,
            CoreErrorKind::Forbidden => StatusCode::FORBIDDEN,
            CoreErrorKind::NotFound => StatusCode::NOT_FOUND,
            CoreErrorKind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        ApiError {
            status,
            code: value.code,
            message: value.message,
            details: value.details,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(json!({
                "success": false,
                "error": {
                    "code": self.code,
                    "message": self.message,
                    "details": self.details,
                }
            })),
        )
            .into_response()
    }
}

pub type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Serialize)]
pub struct SuccessResponse<T> {
    pub success: bool,
    pub data: T,
}

#[derive(Serialize)]
pub struct SuccessWithMeta<T, M> {
    pub success: bool,
    pub data: T,
    pub meta: M,
}

pub fn create_router(state: SharedState) -> Router {
    let metrics_disabled = std::env::var("XAMINA_DISABLE_METRICS")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let base_router = Router::new()
        .route("/health", axum::routing::get(|| async { "OK" }))
        .nest_service("/uploads", ServeDir::new("uploads"))
        .merge(routes::websocket::routes())
        .nest("/api/v1", routes::router())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            apply_tenant_context,
        ))
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_headers(Any)
                .allow_methods(Any),
        );

    if metrics_disabled {
        return base_router
            .route(
                "/metrics",
                axum::routing::get(|| async {
                    format!(
                        "# HELP axum_http_requests_total disabled in test mode\naxum_http_requests_total 0\n{}",
                        ai_metrics::render_prometheus()
                    )
                }),
            )
            .with_state(state);
    }

    let (prometheus_layer, prometheus_handle) = build_metrics_layer();
    base_router
        .route(
            "/metrics",
            axum::routing::get(move || {
                let handle = prometheus_handle.clone();
                async move {
                    let mut rendered = handle.render();
                    rendered.push_str(&ai_metrics::render_prometheus());
                    rendered
                }
            }),
        )
        .layer(prometheus_layer)
        .with_state(state)
}
