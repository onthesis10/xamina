use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use uuid::Uuid;
use xamina_core::domain::submission::dto::{AnomalyPayload, UpsertAnswersPayload};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::auth::AuthUser,
    ws_bus::{emit_or_local_fallback, WsEnvelope},
    ws_state::WsMessage,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/exams/:id/start", post(start_exam_session))
        .route(
            "/exams/:id/submissions/:student_id/force-finish",
            post(force_finish_submission_for_student),
        )
        .route("/exams/:id/submissions", get(list_exam_submissions))
        .route("/me/exams", get(list_my_exams))
        .route("/submissions/:id", get(get_submission_session))
        .route("/submissions/:id/answers", post(upsert_submission_answers))
        .route("/submissions/:id/anomalies", post(log_submission_anomaly))
        .route("/submissions/:id/finish", post(finish_submission))
        .route("/submissions/:id/result", get(get_submission_result))
}

fn ensure_student(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "siswa" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Siswa role required",
        ));
    }
    Ok(())
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

async fn start_exam_session(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(exam_id): Path<Uuid>,
) -> ApiResult<SuccessResponse<xamina_core::domain::submission::dto::StartSubmissionDto>> {
    ensure_student(&auth)?;
    let data = state
        .services
        .submission
        .start_exam_session(auth.0.tenant_id, auth.0.sub, exam_id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn list_my_exams(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<Vec<xamina_core::domain::submission::dto::StudentExamListItem>>> {
    ensure_student(&auth)?;
    let data = state
        .services
        .submission
        .list_my_exams(auth.0.tenant_id, auth.0.sub)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn get_submission_session(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(submission_id): Path<Uuid>,
) -> ApiResult<SuccessResponse<xamina_core::domain::submission::dto::SubmissionSessionDto>> {
    ensure_student(&auth)?;
    let data = state
        .services
        .submission
        .get_submission_session(auth.0.tenant_id, auth.0.sub, submission_id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn upsert_submission_answers(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(submission_id): Path<Uuid>,
    Json(payload): Json<UpsertAnswersPayload>,
) -> ApiResult<SuccessResponse<xamina_core::domain::submission::dto::UpsertAnswersResponse>> {
    ensure_student(&auth)?;
    let data = state
        .services
        .submission
        .upsert_submission_answers(auth.0.tenant_id, auth.0.sub, submission_id, payload)
        .await?;

    // Broadcast answer saved event to exam monitors via WebSocket
    // We need the exam_id — fetch from submission context
    if let Ok(session) = state
        .services
        .submission
        .get_submission_session(auth.0.tenant_id, auth.0.sub, submission_id)
        .await
    {
        let envelope = WsEnvelope::to_monitors(
            session.exam_id,
            WsMessage::AnswerSaved {
                student_id: auth.0.sub,
                answered_count: data.saved_count,
            },
        );
        emit_or_local_fallback(&state.redis, &state.ws, &envelope).await;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn log_submission_anomaly(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(submission_id): Path<Uuid>,
    Json(payload): Json<AnomalyPayload>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_student(&auth)?;
    let event_type = payload.event_type.clone();
    let data = state
        .services
        .submission
        .log_submission_anomaly(auth.0.tenant_id, auth.0.sub, submission_id, payload)
        .await?;

    // Broadcast anomaly event to exam monitors via WebSocket
    if let Ok(session) = state
        .services
        .submission
        .get_submission_session(auth.0.tenant_id, auth.0.sub, submission_id)
        .await
    {
        let envelope = WsEnvelope::to_monitors(
            session.exam_id,
            WsMessage::AnomalyDetected {
                student_id: auth.0.sub,
                event_type,
            },
        );
        emit_or_local_fallback(&state.redis, &state.ws, &envelope).await;
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: json!({"id": data.id, "submission_id": data.submission_id}),
    }))
}

async fn finish_submission(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(submission_id): Path<Uuid>,
) -> ApiResult<SuccessResponse<xamina_core::domain::submission::dto::SubmissionResultDto>> {
    ensure_student(&auth)?;
    let data = state
        .services
        .submission
        .finish_submission(auth.0.tenant_id, auth.0.sub, submission_id)
        .await?;

    // Broadcast student finished event to exam monitors via WebSocket
    let envelope = WsEnvelope::to_monitors(
        data.exam_id,
        WsMessage::StudentFinished {
            student_id: auth.0.sub,
            score: data.score,
        },
    );
    emit_or_local_fallback(&state.redis, &state.ws, &envelope).await;

    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn force_finish_submission_for_student(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path((exam_id, student_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<SuccessResponse<xamina_core::domain::submission::dto::SubmissionResultDto>> {
    ensure_teacher_or_admin(&auth)?;

    let result = state
        .services
        .submission
        .force_finish_submission(auth.0.tenant_id, exam_id, student_id)
        .await?;

    let ack = WsEnvelope::to_user(
        exam_id,
        student_id,
        WsMessage::ForceSubmitAck {
            exam_id,
            submission_id: Some(result.submission_id),
        },
    );
    emit_or_local_fallback(&state.redis, &state.ws, &ack).await;

    let finished = WsEnvelope::to_monitors(
        exam_id,
        WsMessage::StudentFinished {
            student_id,
            score: result.score,
        },
    );
    emit_or_local_fallback(&state.redis, &state.ws, &finished).await;

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn get_submission_result(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(submission_id): Path<Uuid>,
) -> ApiResult<SuccessResponse<xamina_core::domain::submission::dto::SubmissionResultDto>> {
    ensure_student(&auth)?;
    let data = state
        .services
        .submission
        .get_submission_result(auth.0.tenant_id, auth.0.sub, submission_id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

/// GET /exams/:id/submissions — teacher/admin monitor view
async fn list_exam_submissions(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(exam_id): Path<Uuid>,
) -> ApiResult<SuccessResponse<Vec<xamina_core::domain::submission::dto::ExamSubmissionListItem>>> {
    ensure_teacher_or_admin(&auth)?;
    let data = state
        .services
        .submission
        .list_exam_submissions(auth.0.tenant_id, exam_id)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}
