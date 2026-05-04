use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

use xamina_core::domain::student_class::dto::{
    AssignClassPayload, PromoteResult, PromoteStudentsPayload, StudentClassHistoryDto,
};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/students/:id/class-history", get(get_class_history))
        .route("/students/:id/assign-class", post(assign_class))
        .route("/students/promote", post(promote_students))
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

async fn get_class_history(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<Vec<StudentClassHistoryDto>>> {
    ensure_admin(&auth)?;

    let history = state
        .services
        .student_class
        .get_history(auth.0.tenant_id, id)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: history,
    }))
}

async fn assign_class(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AssignClassPayload>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_admin(&auth)?;

    let result = state
        .services
        .student_class
        .assign_class(auth.0.tenant_id, id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({
            "id": result.id,
            "student_id": result.student_id,
            "class_id": result.class_id,
            "academic_year": result.academic_year,
        }),
    }))
}

async fn promote_students(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<PromoteStudentsPayload>,
) -> ApiResult<SuccessResponse<PromoteResult>> {
    ensure_admin(&auth)?;

    let result = state
        .services
        .student_class
        .promote_students(auth.0.tenant_id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}
