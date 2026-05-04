use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use uuid::Uuid;

use xamina_core::domain::teacher_assignment::dto::{
    CreateAssignmentPayload, ListAssignmentsQuery, PageMeta, TeacherAssignmentDto,
    TeacherAssignmentRaw, TeacherSubjectClassDto, TeacherSubjectDto,
};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route(
            "/teacher-assignments",
            get(list_assignments).post(create_assignment),
        )
        .route("/teacher-assignments/:id", delete(delete_assignment))
        .route("/teachers/:id/subjects", get(teacher_subjects))
        .route(
            "/teachers/:teacher_id/subjects/:subject_id/classes",
            get(teacher_classes_for_subject),
        )
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

fn ensure_admin_or_self_guru(auth: &AuthUser, teacher_id: Uuid) -> Result<(), ApiError> {
    if auth.0.role == "admin" || auth.0.role == "super_admin" {
        return Ok(());
    }
    if auth.0.role == "guru" && auth.0.sub == teacher_id {
        return Ok(());
    }
    Err(ApiError::new(
        StatusCode::FORBIDDEN,
        "FORBIDDEN",
        "Admin, super_admin, or own teacher account required",
    ))
}

async fn list_assignments(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(mut query): Query<ListAssignmentsQuery>,
) -> ApiResult<SuccessWithMeta<Vec<TeacherAssignmentDto>, PageMeta>> {
    // Guru can only see their own assignments
    if auth.0.role == "guru" {
        query.teacher_id = Some(auth.0.sub);
    } else {
        ensure_admin(&auth)?;
    }

    let result = state
        .services
        .teacher_assignment
        .list_assignments(auth.0.tenant_id, query)
        .await?;

    Ok(Json(SuccessWithMeta {
        success: true,
        data: result.rows,
        meta: result.meta,
    }))
}

async fn create_assignment(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<CreateAssignmentPayload>,
) -> ApiResult<SuccessResponse<TeacherAssignmentRaw>> {
    ensure_admin(&auth)?;

    let assignment = state
        .services
        .teacher_assignment
        .create_assignment(auth.0.tenant_id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: assignment,
    }))
}

async fn delete_assignment(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_admin(&auth)?;

    state
        .services
        .teacher_assignment
        .delete_assignment(auth.0.tenant_id, id)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({ "id": id }),
    }))
}

async fn teacher_subjects(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<Vec<TeacherSubjectDto>>> {
    ensure_admin_or_self_guru(&auth, id)?;

    let subjects = state
        .services
        .teacher_assignment
        .teacher_subjects(auth.0.tenant_id, id)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: subjects,
    }))
}

async fn teacher_classes_for_subject(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path((teacher_id, subject_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<SuccessResponse<Vec<TeacherSubjectClassDto>>> {
    ensure_admin_or_self_guru(&auth, teacher_id)?;

    let classes = state
        .services
        .teacher_assignment
        .teacher_classes_for_subject(auth.0.tenant_id, teacher_id, subject_id)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: classes,
    }))
}
