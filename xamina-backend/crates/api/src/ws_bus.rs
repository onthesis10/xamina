use std::time::Duration;

use futures_util::StreamExt;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use uuid::Uuid;

use crate::ws_state::{ParticipantRole, WsMessage, WsState};

const WS_CHANNEL_PREFIX: &str = "ws:exam:";
const WS_CHANNEL_PATTERN: &str = "ws:exam:*";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsEnvelope {
    pub exam_id: Uuid,
    pub target_user_id: Option<Uuid>,
    pub monitors_only: bool,
    pub message: WsMessage,
}

impl WsEnvelope {
    pub fn to_room(exam_id: Uuid, message: WsMessage) -> Self {
        Self {
            exam_id,
            target_user_id: None,
            monitors_only: false,
            message,
        }
    }

    pub fn to_monitors(exam_id: Uuid, message: WsMessage) -> Self {
        Self {
            exam_id,
            target_user_id: None,
            monitors_only: true,
            message,
        }
    }

    pub fn to_user(exam_id: Uuid, user_id: Uuid, message: WsMessage) -> Self {
        Self {
            exam_id,
            target_user_id: Some(user_id),
            monitors_only: false,
            message,
        }
    }
}

pub fn dispatch_local(ws: &WsState, envelope: &WsEnvelope) {
    if let Some(user_id) = envelope.target_user_id {
        ws.send_to_user(envelope.exam_id, user_id, &envelope.message);
        return;
    }

    if envelope.monitors_only {
        ws.broadcast_to_monitors(envelope.exam_id, &envelope.message);
    } else {
        ws.broadcast_to_room(envelope.exam_id, &envelope.message);
    }
}

pub async fn publish_event(redis: &redis::Client, envelope: &WsEnvelope) -> anyhow::Result<()> {
    let mut conn = redis.get_multiplexed_async_connection().await?;
    let channel = channel_for_exam(envelope.exam_id);
    let payload = serde_json::to_string(envelope)?;
    let _: usize = conn.publish(channel, payload).await?;
    Ok(())
}

pub async fn emit_or_local_fallback(redis: &redis::Client, ws: &WsState, envelope: &WsEnvelope) {
    if let Err(err) = publish_event(redis, envelope).await {
        warn!(
            code = "WS_REDIS_PUBLISH_FAILED",
            error = %err,
            exam_id = %envelope.exam_id,
            "ws redis publish failed, falling back to local dispatch"
        );
        dispatch_local(ws, envelope);
    }
}

pub fn spawn_redis_subscriber(redis: redis::Client, ws: WsState) {
    tokio::spawn(async move {
        loop {
            let sub_result = async {
                let mut pubsub = redis.get_async_pubsub().await?;
                pubsub.psubscribe(WS_CHANNEL_PATTERN).await?;
                let mut stream = pubsub.on_message();
                while let Some(message) = stream.next().await {
                    let payload = message.get_payload::<String>()?;
                    match serde_json::from_str::<WsEnvelope>(&payload) {
                        Ok(envelope) => dispatch_local(&ws, &envelope),
                        Err(err) => {
                            warn!(
                                code = "WS_EVENT_DESERIALIZE_FAILED",
                                error = %err,
                                "ignoring invalid ws envelope payload"
                            );
                        }
                    }
                }
                anyhow::Ok(())
            }
            .await;

            if let Err(err) = sub_result {
                warn!(
                    code = "WS_REDIS_SUBSCRIBE_FAILED",
                    error = %err,
                    "redis pubsub stream failed, retrying"
                );
                tokio::time::sleep(Duration::from_secs(2)).await;
            } else {
                debug!("ws redis subscriber stream ended");
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    });
}

pub fn spawn_heartbeat_sweeper(
    redis: redis::Client,
    ws: WsState,
    timeout_secs: i64,
    interval_secs: u64,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));
        loop {
            interval.tick().await;
            let stale = ws.sweep_stale_participants(timeout_secs);
            for participant in stale {
                if participant.role == ParticipantRole::Student {
                    let envelope = WsEnvelope::to_monitors(
                        participant.exam_id,
                        WsMessage::StudentDisconnected {
                            student_id: participant.user_id,
                        },
                    );
                    emit_or_local_fallback(&redis, &ws, &envelope).await;
                }
            }
        }
    });
}

fn channel_for_exam(exam_id: Uuid) -> String {
    format!("{WS_CHANNEL_PREFIX}{exam_id}")
}
