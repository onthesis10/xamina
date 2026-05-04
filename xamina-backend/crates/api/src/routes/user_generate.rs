use axum::{
    extract::{State},
    http::StatusCode,
    routing::post,
    Json, Router,
};

use xamina_core::domain::user::dto::{GenerateBulkUsersPayload, GenerateBulkUsersResult};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new().route("/users/generate", post(generate_bulk_users))
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

async fn generate_bulk_users(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<GenerateBulkUsersPayload>,
) -> ApiResult<SuccessResponse<GenerateBulkUsersResult>> {
    ensure_admin(&auth)?;

    // We use the new user_generate service method which will handle creating
    // student profiles and class history properly.
    let result = state
        .services
        .user
        .generate_bulk_users(auth.0.tenant_id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}
