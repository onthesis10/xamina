use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use redis::AsyncCommands;
use serde_json::json;
use uuid::Uuid;
use xamina_core::domain::notification::dto::{
    BroadcastNotificationRequest, BroadcastNotificationResult, ListNotificationsQuery,
    NotificationDto, NotificationListMeta, PushSubscribeRequest, PushUnsubscribeRequest,
};

use crate::{
    app::{ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/notifications", get(list_notifications))
        .route("/notifications/broadcast", post(broadcast_notifications))
        .route("/notifications/push/public-key", get(get_push_public_key))
        .route("/notifications/push/subscribe", post(subscribe_push))
        .route(
            "/notifications/push/subscribe",
            axum::routing::delete(unsubscribe_push),
        )
        .route("/notifications/:id/read", patch(mark_notification_read))
        .route("/notifications/read-all", post(mark_all_notifications_read))
}

async fn list_notifications(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListNotificationsQuery>,
) -> ApiResult<SuccessWithMeta<Vec<NotificationDto>, NotificationListMeta>> {
    let result = state
        .services
        .notification
        .list(auth.0.tenant_id, auth.0.sub, query)
        .await?;
    Ok(Json(SuccessWithMeta {
        success: true,
        data: result.rows,
        meta: result.meta,
    }))
}

async fn mark_notification_read(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    state
        .services
        .notification
        .mark_read(auth.0.tenant_id, auth.0.sub, id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "id": id, "is_read": true }),
    }))
}

async fn mark_all_notifications_read(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    let affected = state
        .services
        .notification
        .mark_all_read(auth.0.tenant_id, auth.0.sub)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "updated": affected }),
    }))
}

fn ensure_broadcast_role(auth: &AuthUser) -> Result<(), crate::app::ApiError> {
    if auth.0.role != "admin" && auth.0.role != "guru" && auth.0.role != "super_admin" {
        return Err(crate::app::ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Admin, guru, or super_admin role required",
        ));
    }
    Ok(())
}

async fn broadcast_notifications(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<BroadcastNotificationRequest>,
) -> ApiResult<SuccessResponse<BroadcastNotificationResult>> {
    ensure_broadcast_role(&auth)?;
    let result = state
        .services
        .notification
        .broadcast(auth.0.tenant_id, body)
        .await?;

    if !result.push_job_ids.is_empty() {
        let mut conn = state
            .redis
            .get_multiplexed_async_connection()
            .await
            .map_err(|_| {
                crate::app::ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "REDIS_ERROR",
                    "Failed to connect redis",
                )
            })?;
        let push_ids = result
            .push_job_ids
            .iter()
            .map(|x| x.to_string())
            .collect::<Vec<_>>();
        let _: i32 = conn.lpush("jobs:push", push_ids).await.map_err(|_| {
            crate::app::ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "REDIS_ERROR",
                "Failed to enqueue push jobs",
            )
        })?;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn get_push_public_key() -> ApiResult<SuccessResponse<serde_json::Value>> {
    let key = std::env::var("WEB_PUSH_VAPID_PUBLIC_KEY")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| {
            crate::app::ApiError::new(
                StatusCode::BAD_REQUEST,
                "WEB_PUSH_NOT_CONFIGURED",
                "Web push public key is not configured",
            )
        })?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "public_key": key }),
    }))
}

async fn subscribe_push(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<PushSubscribeRequest>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    let row = state
        .services
        .notification
        .subscribe_push(auth.0.tenant_id, auth.0.sub, body)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({
            "id": row.id,
            "endpoint": row.endpoint,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }),
    }))
}

async fn unsubscribe_push(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<PushUnsubscribeRequest>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    let affected = state
        .services
        .notification
        .unsubscribe_push(auth.0.tenant_id, auth.0.sub, &body.endpoint)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "deleted": affected }),
    }))
}
