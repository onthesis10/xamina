use std::convert::Infallible;
use std::panic::AssertUnwindSafe;

use axum::{
    extract::{Multipart, State},
    response::sse::{Event, KeepAlive, Sse},
    routing::post,
    Json, Router,
};
use futures_util::{FutureExt, StreamExt};
use serde_json::json;
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;

use crate::{
    ai_metrics,
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::{
        ai_rate_limit::{enforce_ai_rate_limit, AiEndpoint},
        auth::AuthUser,
    },
};
use xamina_core::domain::ai::{
    dto::{GenerateQuestionRequest, GradeEssayRequest},
    handler::AiHandler,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/ai/extract-pdf", post(extract_pdf))
        .route("/ai/generate", post(generate_questions))
        .route("/ai/generate/stream", post(generate_questions_stream))
        .route("/ai/grade", post(grade_essay))
}

fn ensure_teacher_or_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "admin" && auth.0.role != "guru" && auth.0.role != "super_admin" {
        return Err(ApiError::new(
            axum::http::StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Admin, guru, or super_admin role required",
        ));
    }
    Ok(())
}

async fn extract_pdf(
    State(state): State<SharedState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> ApiResult<SuccessResponse<xamina_core::domain::ai::dto::ExtractPdfResponse>> {
    ensure_teacher_or_admin(&auth)?;
    enforce_or_reject_rate_limit(&state, &auth, AiEndpoint::ExtractPdf, "/ai/extract-pdf").await?;

    let mut pdf_bytes = Vec::new();
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        ApiError::new(
            axum::http::StatusCode::BAD_REQUEST,
            "INVALID_MULTIPART",
            e.to_string(),
        )
    })? {
        if field.name() == Some("file") {
            let data = field.bytes().await.map_err(|e| {
                ApiError::new(
                    axum::http::StatusCode::BAD_REQUEST,
                    "READ_ERROR",
                    e.to_string(),
                )
            })?;
            pdf_bytes = data.to_vec();
            break;
        }
    }

    if pdf_bytes.is_empty() {
        ai_metrics::record_ai_request();
        return Err(ApiError::new(
            axum::http::StatusCode::BAD_REQUEST,
            "MISSING_FILE",
            "No PDF file uploaded",
        ));
    }

    let (result, usage) = match AiHandler::extract_pdf(
        &state.services.ai,
        auth.0.tenant_id,
        auth.0.sub,
        "/ai/extract-pdf",
        &pdf_bytes,
    )
    .await
    {
        Ok(value) => value,
        Err(err) => {
            ai_metrics::record_ai_request();
            return Err(ApiError::from(err));
        }
    };

    ai_metrics::record_ai_request();
    ai_metrics::record_ai_tokens(usage.total_tokens);
    ai_metrics::record_ai_cost_usd(usage.estimated_cost_usd);

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn generate_questions(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(payload): Json<GenerateQuestionRequest>,
) -> ApiResult<SuccessResponse<xamina_core::domain::ai::dto::GenerateQuestionResponse>> {
    ensure_teacher_or_admin(&auth)?;
    enforce_or_reject_rate_limit(&state, &auth, AiEndpoint::Generate, "/ai/generate").await?;

    let (result, usage) = match AiHandler::generate_questions(
        &state.services.ai,
        auth.0.tenant_id,
        auth.0.sub,
        "/ai/generate",
        payload,
    )
    .await
    {
        Ok(value) => value,
        Err(err) => {
            ai_metrics::record_ai_request();
            return Err(ApiError::from(err));
        }
    };

    ai_metrics::record_ai_request();
    ai_metrics::record_ai_tokens(usage.total_tokens);
    ai_metrics::record_ai_cost_usd(usage.estimated_cost_usd);

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn generate_questions_stream(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(payload): Json<GenerateQuestionRequest>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>>, ApiError> {
    ensure_teacher_or_admin(&auth)?;
    enforce_or_reject_rate_limit(
        &state,
        &auth,
        AiEndpoint::GenerateStream,
        "/ai/generate/stream",
    )
    .await?;

    let (tx, rx) = mpsc::unbounded_channel::<Event>();
    let ai_service = state.services.ai.clone();
    let tenant_id = auth.0.tenant_id;
    let user_id = auth.0.sub;
    let payload_for_fallback = payload.clone();

    tokio::spawn(async move {
        let chunk_sender = tx.clone();
        let result = AssertUnwindSafe(AiHandler::generate_questions_stream(
            &ai_service,
            tenant_id,
            user_id,
            "/ai/generate/stream",
            payload,
            move |chunk| {
                let event = Event::default()
                    .event("chunk")
                    .data(json!({ "text": chunk }).to_string());
                let _ = chunk_sender.send(event);
            },
        ))
        .catch_unwind()
        .await;

        match result {
            Ok(inner_result) => match inner_result {
                Ok((final_payload, usage)) => {
                    ai_metrics::record_ai_request();
                    ai_metrics::record_ai_tokens(usage.total_tokens);
                    ai_metrics::record_ai_cost_usd(usage.estimated_cost_usd);
                    let _ = tx.send(
                        Event::default()
                            .event("final")
                            .data(json!(final_payload).to_string()),
                    );
                }
                Err(err) => {
                    ai_metrics::record_ai_request();
                    let _ = tx.send(
                        Event::default().event("error").data(
                            json!({
                                "code": err.code,
                                "message": err.message,
                            })
                            .to_string(),
                        ),
                    );
                }
            },
            Err(_) => {
                let fallback = AiHandler::generate_questions(
                    &ai_service,
                    tenant_id,
                    user_id,
                    "/ai/generate/stream",
                    payload_for_fallback,
                )
                .await;

                match fallback {
                    Ok((final_payload, usage)) => {
                        ai_metrics::record_ai_request();
                        ai_metrics::record_ai_tokens(usage.total_tokens);
                        ai_metrics::record_ai_cost_usd(usage.estimated_cost_usd);
                        let _ = tx.send(
                            Event::default()
                                .event("final")
                                .data(json!(final_payload).to_string()),
                        );
                    }
                    Err(err) => {
                        ai_metrics::record_ai_request();
                        let _ = tx.send(
                            Event::default().event("error").data(
                                json!({
                                    "code": "AI_STREAM_PANIC",
                                    "message": format!(
                                        "AI stream worker panicked and fallback failed: {}",
                                        err.message
                                    ),
                                })
                                .to_string(),
                            ),
                        );
                    }
                }
            }
        }
    });

    let stream = UnboundedReceiverStream::new(rx).map(Ok::<Event, Infallible>);
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15))))
}

async fn grade_essay(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(payload): Json<GradeEssayRequest>,
) -> ApiResult<SuccessResponse<xamina_core::domain::ai::dto::GradeEssayResponse>> {
    ensure_teacher_or_admin(&auth)?;
    enforce_or_reject_rate_limit(&state, &auth, AiEndpoint::Grade, "/ai/grade").await?;

    let (result, usage) = match AiHandler::grade_essay(
        &state.services.ai,
        auth.0.tenant_id,
        auth.0.sub,
        "/ai/grade",
        payload,
    )
    .await
    {
        Ok(value) => value,
        Err(err) => {
            ai_metrics::record_ai_request();
            return Err(ApiError::from(err));
        }
    };

    ai_metrics::record_ai_request();
    ai_metrics::record_ai_tokens(usage.total_tokens);
    ai_metrics::record_ai_cost_usd(usage.estimated_cost_usd);

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn enforce_or_reject_rate_limit(
    state: &SharedState,
    auth: &AuthUser,
    endpoint: AiEndpoint,
    endpoint_path: &str,
) -> Result<(), ApiError> {
    match enforce_ai_rate_limit(
        &state.redis,
        &state.ai_rate_limits,
        auth.0.tenant_id,
        endpoint,
    )
    .await
    {
        Ok(()) => Ok(()),
        Err(err) => {
            if err.code == "RATE_LIMITED" {
                ai_metrics::record_ai_request();
                ai_metrics::record_ai_rate_limit_hit();
                let _ = state
                    .services
                    .ai
                    .log_rate_limited(
                        auth.0.tenant_id,
                        auth.0.sub,
                        endpoint_path,
                        err.code,
                        err.details.clone(),
                    )
                    .await;
            }
            Err(err)
        }
    }
}
