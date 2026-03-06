use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    app::SharedState,
    middleware::auth::decode_claims,
    ws_bus::{emit_or_local_fallback, WsEnvelope},
    ws_state::{ParticipantRole, WsMessage},
};

#[derive(Deserialize)]
pub struct WsAuthQuery {
    token: String,
}

pub fn routes() -> Router<SharedState> {
    Router::new().route("/ws/exam/:exam_id", get(ws_exam_handler))
}

async fn ws_exam_handler(
    ws: WebSocketUpgrade,
    Path(exam_id): Path<Uuid>,
    Query(auth): Query<WsAuthQuery>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let claims = match decode_claims(&auth.token, &state.jwt_secret) {
        Ok(claims) => claims,
        Err(err) => return (StatusCode::UNAUTHORIZED, err.message).into_response(),
    };

    let user_name = fetch_user_name(&state, claims.tenant_id, claims.sub).await;
    let user_id = claims.sub;
    let user_role = claims.role.clone();
    let tenant_id = claims.tenant_id;
    ws.on_upgrade(move |socket| {
        handle_ws_connection(
            socket, state, exam_id, tenant_id, user_id, user_name, user_role,
        )
    })
}

async fn fetch_user_name(state: &SharedState, tenant_id: Uuid, user_id: Uuid) -> String {
    sqlx::query_scalar::<_, String>("SELECT name FROM users WHERE id = $1 AND tenant_id = $2")
        .bind(user_id)
        .bind(tenant_id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| {
            let raw = user_id.to_string();
            format!("user-{}", &raw[..8])
        })
}

async fn handle_ws_connection(
    socket: WebSocket,
    state: SharedState,
    exam_id: Uuid,
    tenant_id: Uuid,
    user_id: Uuid,
    user_name: String,
    user_role: String,
) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    let participant_role = match user_role.as_str() {
        "guru" | "admin" | "super_admin" => ParticipantRole::Monitor,
        _ => ParticipantRole::Student,
    };

    let (connection_id, mut room_rx) =
        state
            .ws
            .join_room(exam_id, user_id, user_name.clone(), participant_role);

    match participant_role {
        ParticipantRole::Student => {
            let envelope = WsEnvelope::to_monitors(
                exam_id,
                WsMessage::StudentConnected {
                    student_id: user_id,
                    student_name: user_name.clone(),
                },
            );
            emit_or_local_fallback(&state.redis, &state.ws, &envelope).await;
        }
        ParticipantRole::Monitor => {
            // Monitor join confirmation and current local-room snapshot.
            state
                .ws
                .send_to_user(exam_id, user_id, &WsMessage::MonitorJoined { exam_id });
            let students = state.ws.connected_students(exam_id);
            for (sid, sname) in students {
                state.ws.send_to_user(
                    exam_id,
                    user_id,
                    &WsMessage::StudentConnected {
                        student_id: sid,
                        student_name: sname,
                    },
                );
            }
        }
    }

    let forward_task = tokio::spawn(async move {
        while let Some(msg) = room_rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if ws_tx.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    handle_incoming_message(
                        &state,
                        exam_id,
                        tenant_id,
                        connection_id,
                        user_id,
                        participant_role,
                        ws_msg,
                    )
                    .await;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    if let Some(leave) = state.ws.leave_room(exam_id, connection_id) {
        if leave.role == ParticipantRole::Student && leave.fully_disconnected {
            let envelope = WsEnvelope::to_monitors(
                exam_id,
                WsMessage::StudentDisconnected {
                    student_id: leave.user_id,
                },
            );
            emit_or_local_fallback(&state.redis, &state.ws, &envelope).await;
        }
    }

    forward_task.abort();
}

async fn handle_incoming_message(
    state: &SharedState,
    exam_id: Uuid,
    tenant_id: Uuid,
    connection_id: Uuid,
    user_id: Uuid,
    role: ParticipantRole,
    msg: WsMessage,
) {
    match msg {
        WsMessage::Heartbeat { .. } => {
            state.ws.mark_heartbeat(exam_id, connection_id);
            state
                .ws
                .send_to_user(exam_id, user_id, &WsMessage::HeartbeatAck);
        }
        WsMessage::ForceSubmit { student_id } => {
            if role != ParticipantRole::Monitor {
                state.ws.send_to_user(
                    exam_id,
                    user_id,
                    &WsMessage::Error {
                        message: "only monitors can force-submit".into(),
                    },
                );
                return;
            }

            match state
                .services
                .submission
                .force_finish_submission(tenant_id, exam_id, student_id)
                .await
            {
                Ok(result) => {
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
                }
                Err(err) => {
                    let ack = WsEnvelope::to_user(
                        exam_id,
                        student_id,
                        WsMessage::ForceSubmitAck {
                            exam_id,
                            submission_id: None,
                        },
                    );
                    emit_or_local_fallback(&state.redis, &state.ws, &ack).await;
                    state.ws.send_to_user(
                        exam_id,
                        user_id,
                        &WsMessage::Error {
                            message: format!("force-finish fallback mode: {}", err.message),
                        },
                    );
                }
            }
        }
        _ => {
            tracing::debug!("unhandled ws message from {}: {:?}", user_id, msg);
        }
    }
}
