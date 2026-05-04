use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use xamina_core::domain::student_profile::dto::{StudentProfileDto, UpsertProfilePayload};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route(
            "/students/:id/profile",
            get(get_profile).put(upsert_profile),
        )
}

fn ensure_admin_or_guru(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "admin" && auth.0.role != "guru" && auth.0.role != "super_admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Admin, guru, or super_admin role required",
        ));
    }
    Ok(())
}

fn ensure_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "admin" && auth.0.role != "super_admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Admin or super_admin role required",
        ));
    }
    Ok(())
}

async fn get_profile(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<StudentProfileDto>> {
    ensure_admin_or_guru(&auth)?;

    let profile = state.services.student_profile.get_profile(id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: profile,
    }))
}

async fn upsert_profile(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpsertProfilePayload>,
) -> ApiResult<SuccessResponse<StudentProfileDto>> {
    ensure_admin(&auth)?;

    let profile = state
        .services
        .student_profile
        .upsert_profile(id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: profile,
    }))
}
