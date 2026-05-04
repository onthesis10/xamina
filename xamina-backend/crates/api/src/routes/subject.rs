use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use xamina_core::domain::subject::dto::{
    CreateSubjectPayload, ListSubjectsQuery, PageMeta, SubjectDto, UpdateSubjectPayload,
};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/subjects", get(list_subjects).post(create_subject))
        .route(
            "/subjects/:id",
            axum::routing::patch(update_subject).delete(delete_subject),
        )
        .route("/subjects/all", get(list_all_active_subjects))
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

async fn list_subjects(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListSubjectsQuery>,
) -> ApiResult<SuccessWithMeta<Vec<SubjectDto>, PageMeta>> {
    ensure_admin_or_guru(&auth)?;

    let result = state
        .services
        .subject
        .list_subjects(auth.0.tenant_id, query)
        .await?;

    Ok(Json(SuccessWithMeta {
        success: true,
        data: result.rows,
        meta: result.meta,
    }))
}

async fn list_all_active_subjects(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<Vec<SubjectDto>>> {
    ensure_admin_or_guru(&auth)?;

    let rows = state
        .services
        .subject
        .list_all_active(auth.0.tenant_id)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: rows,
    }))
}

async fn create_subject(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<CreateSubjectPayload>,
) -> ApiResult<SuccessResponse<SubjectDto>> {
    ensure_admin(&auth)?;

    let subject = state
        .services
        .subject
        .create_subject(auth.0.tenant_id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: subject,
    }))
}

async fn update_subject(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSubjectPayload>,
) -> ApiResult<SuccessResponse<SubjectDto>> {
    ensure_admin(&auth)?;

    let subject = state
        .services
        .subject
        .update_subject(auth.0.tenant_id, id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: subject,
    }))
}

async fn delete_subject(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_admin(&auth)?;

    state
        .services
        .subject
        .delete_subject(auth.0.tenant_id, id)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "id": id }),
    }))
}
