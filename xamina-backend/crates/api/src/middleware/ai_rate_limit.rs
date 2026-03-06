use std::time::{SystemTime, UNIX_EPOCH};

use axum::http::StatusCode;
use redis::AsyncCommands;
use serde_json::json;
use uuid::Uuid;

use crate::app::ApiError;

#[derive(Debug, Clone)]
pub struct AiRateLimitProfile {
    pub generate_per_min: u32,
    pub generate_stream_per_min: u32,
    pub grade_per_min: u32,
    pub extract_per_min: u32,
}

impl AiRateLimitProfile {
    pub fn from_env() -> Self {
        Self {
            generate_per_min: read_limit_env("AI_RATE_LIMIT_GENERATE_PER_MIN", 12),
            generate_stream_per_min: read_limit_env("AI_RATE_LIMIT_GENERATE_PER_MIN", 12),
            grade_per_min: read_limit_env("AI_RATE_LIMIT_GRADE_PER_MIN", 30),
            extract_per_min: read_limit_env("AI_RATE_LIMIT_EXTRACT_PER_MIN", 10),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum AiEndpoint {
    ExtractPdf,
    Generate,
    GenerateStream,
    Grade,
}

impl AiEndpoint {
    fn slug(self) -> &'static str {
        match self {
            Self::ExtractPdf => "extract_pdf",
            Self::Generate => "generate",
            Self::GenerateStream => "generate_stream",
            Self::Grade => "grade",
        }
    }

    fn limit(self, profile: &AiRateLimitProfile) -> u32 {
        match self {
            Self::ExtractPdf => profile.extract_per_min,
            Self::Generate => profile.generate_per_min,
            Self::GenerateStream => profile.generate_stream_per_min,
            Self::Grade => profile.grade_per_min,
        }
    }
}

pub async fn enforce_ai_rate_limit(
    redis: &redis::Client,
    profile: &AiRateLimitProfile,
    tenant_id: Uuid,
    endpoint: AiEndpoint,
) -> Result<(), ApiError> {
    let mut conn = redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "RATE_LIMIT_BACKEND_ERROR",
                "Failed to connect rate limit backend",
            )
        })?;

    let minute_bucket = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() / 60)
        .unwrap_or(0);
    let key = format!(
        "ratelimit:ai:{}:{}:{}",
        tenant_id,
        endpoint.slug(),
        minute_bucket
    );
    let limit = endpoint.limit(profile);

    let current: i64 = conn.incr(&key, 1).await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "RATE_LIMIT_BACKEND_ERROR",
            "Failed to update AI rate limit counter",
        )
    })?;
    if current == 1 {
        let _: Result<bool, _> = conn.expire(&key, 70).await;
    }

    if current > i64::from(limit) {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "AI rate limit exceeded",
        )
        .with_details(json!({
            "endpoint": endpoint.slug(),
            "limit_per_min": limit,
            "current": current,
        })));
    }

    Ok(())
}

fn read_limit_env(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(default)
}
