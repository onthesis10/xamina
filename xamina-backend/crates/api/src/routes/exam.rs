use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch},
    Json, Router,
};
use serde_json::json;
use uuid::Uuid;
use xamina_core::domain::exam::dto::{
    AttachQuestionsPayload, ExamPayload, ListExamsQuery, ReorderQuestionsPayload,
};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/exams", get(list_exams).post(create_exam))
        .route(
            "/exams/:id",
            get(get_exam).patch(update_exam).delete(delete_exam),
        )
        .route(
            "/exams/:id/questions",
            axum::routing::post(attach_questions),
        )
        .route(
            "/exams/:id/questions/reorder",
            patch(reorder_exam_questions),
        )
        .route(
            "/exams/:id/questions/:question_id",
            axum::routing::delete(detach_question),
        )
        .route("/exams/:id/publish-precheck", get(publish_precheck))
        .route("/exams/:id/publish", axum::routing::post(publish_exam))
        .route("/exams/:id/unpublish", axum::routing::post(unpublish_exam))
}

fn ensure_teacher_or_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "admin" && auth.0.role != "guru" && auth.0.role != "super_admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Admin, guru, or super_admin role required",
        ));
    }
    Ok(())
}

async fn list_exams(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListExamsQuery>,
) -> ApiResult<
    SuccessWithMeta<
        Vec<xamina_core::domain::exam::dto::ExamDto>,
        xamina_core::domain::exam::dto::PageMeta,
    >,
> {
    ensure_teacher_or_admin(&auth)?;
    let result = state
        .services
        .exam
        .list_exams(auth.0.tenant_id, query)
        .await?;
    Ok(Json(SuccessWithMeta {
        success: true,
        data: result.rows,
        meta: result.meta,
    }))
}

async fn create_exam(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<ExamPayload>,
) -> ApiResult<SuccessResponse<xamina_core::domain::exam::dto::ExamDto>> {
    ensure_teacher_or_admin(&auth)?;
    let row = state
        .services
        .exam
        .create_exam(auth.0.tenant_id, auth.0.sub, body)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn get_exam(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    let detail = state.services.exam.get_exam(auth.0.tenant_id, id).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({
            "exam": detail.exam,
            "questions": detail.questions,
        }),
    }))
}

async fn update_exam(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ExamPayload>,
) -> ApiResult<SuccessResponse<xamina_core::domain::exam::dto::ExamDto>> {
    ensure_teacher_or_admin(&auth)?;
    let row = state
        .services
        .exam
        .update_exam(auth.0.tenant_id, id, body)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn delete_exam(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    state
        .services
        .exam
        .delete_exam(auth.0.tenant_id, id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "id": id }),
    }))
}

async fn attach_questions(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AttachQuestionsPayload>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    state
        .services
        .exam
        .attach_questions(auth.0.tenant_id, id, body.question_ids)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "exam_id": id }),
    }))
}

async fn reorder_exam_questions(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ReorderQuestionsPayload>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    let reordered = state
        .services
        .exam
        .reorder_questions(auth.0.tenant_id, id, body)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({
            "exam_id": id,
            "questions": reordered,
        }),
    }))
}

async fn detach_question(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path((id, question_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    state
        .services
        .exam
        .detach_question(auth.0.tenant_id, id, question_id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "exam_id": id, "question_id": question_id }),
    }))
}

async fn publish_precheck(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<xamina_core::domain::exam::dto::PublishPrecheckResult>> {
    ensure_teacher_or_admin(&auth)?;
    let precheck = state
        .services
        .exam
        .publish_precheck(auth.0.tenant_id, id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: precheck,
    }))
}

async fn publish_exam(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    let detail = state.services.exam.get_exam(auth.0.tenant_id, id).await?;
    state
        .services
        .exam
        .publish_exam(auth.0.tenant_id, id)
        .await?;
    let _ = state
        .services
        .notification
        .notify_exam_published(auth.0.tenant_id, id, &detail.exam.title)
        .await;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "id": id, "status": "published" }),
    }))
}

async fn unpublish_exam(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    state
        .services
        .exam
        .unpublish_exam(auth.0.tenant_id, id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "id": id, "status": "draft" }),
    }))
}
