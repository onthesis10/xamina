use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{MatchedPath, Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use redis::AsyncCommands;
use serde_json::json;

use crate::{
    app::{ApiError, SharedState},
    config::Config,
    middleware::auth::decode_claims,
};

#[derive(Debug, Clone)]
pub struct GlobalRateLimitProfile {
    pub default_per_min: u32,
    pub auth_per_min: u32,
    pub import_per_min: u32,
}

impl GlobalRateLimitProfile {
    pub fn from_config(config: &Config) -> Self {
        Self {
            default_per_min: config.global_rate_limit_per_min,
            auth_per_min: config.auth_rate_limit_per_min,
            import_per_min: config.import_rate_limit_per_min,
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum RateLimitBucket {
    Default,
    Auth,
    Import,
}

impl RateLimitBucket {
    fn slug(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Auth => "auth",
            Self::Import => "import",
        }
    }

    fn limit(self, profile: &GlobalRateLimitProfile) -> u32 {
        match self {
            Self::Default => profile.default_per_min,
            Self::Auth => profile.auth_per_min,
            Self::Import => profile.import_per_min,
        }
    }
}

pub async fn apply_global_rate_limit(
    State(state): State<SharedState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
        .unwrap_or_else(|| request.uri().path());
    let bucket = classify_bucket(path);
    let subject = identify_subject(request.headers(), &state.jwt_secret);
    enforce_limit(&state, bucket, &subject).await?;
    Ok(next.run(request).await)
}

fn classify_bucket(path: &str) -> RateLimitBucket {
    if path.starts_with("/api/v1/auth/") || path.starts_with("/auth/") {
        return RateLimitBucket::Auth;
    }
    if path.contains("/questions/import/") {
        return RateLimitBucket::Import;
    }
    RateLimitBucket::Default
}

fn identify_subject(headers: &HeaderMap, jwt_secret: &str) -> String {
    let ip = forwarded_ip(headers).unwrap_or("local");
    let tenant_part = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .and_then(|token| decode_claims(token, jwt_secret).ok())
        .map(|claims| format!("tenant:{}:user:{}", claims.tenant_id, claims.sub))
        .or_else(|| {
            headers
                .get("x-tenant-id")
                .and_then(|v| v.to_str().ok())
                .filter(|v| !v.is_empty())
                .map(|tenant_id| format!("tenant:{tenant_id}:ip:{ip}"))
        })
        .unwrap_or_else(|| format!("ip:{ip}"));

    tenant_part
}

fn forwarded_ip(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
}

async fn enforce_limit(
    state: &SharedState,
    bucket: RateLimitBucket,
    subject: &str,
) -> Result<(), ApiError> {
    let mut conn = state
        .redis
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
    let limit = bucket.limit(&state.global_rate_limits);
    let key = format!(
        "ratelimit:global:{}:{}:{}",
        bucket.slug(),
        subject,
        minute_bucket
    );

    let current: i64 = conn.incr(&key, 1).await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "RATE_LIMIT_BACKEND_ERROR",
            "Failed to update rate limit counter",
        )
    })?;
    if current == 1 {
        let _: Result<bool, _> = conn.expire(&key, 70).await;
    }

    if current > i64::from(limit) {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Global rate limit exceeded",
        )
        .with_details(json!({
            "bucket": bucket.slug(),
            "limit_per_min": limit,
            "current": current,
            "subject": subject,
        })));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{classify_bucket, forwarded_ip, identify_subject};
    use axum::http::{header, HeaderMap, HeaderValue};

    #[test]
    fn classify_bucket_should_map_auth_and_import() {
        assert!(matches!(
            classify_bucket("/auth/login"),
            super::RateLimitBucket::Auth
        ));
        assert!(matches!(
            classify_bucket("/questions/import/preview"),
            super::RateLimitBucket::Import
        ));
        assert!(matches!(
            classify_bucket("/reports/exam-insights"),
            super::RateLimitBucket::Default
        ));
    }

    #[test]
    fn forwarded_ip_should_prioritize_forwarded_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("10.0.0.1, 10.0.0.2"),
        );
        assert_eq!(forwarded_ip(&headers), Some("10.0.0.1"));
    }

    #[test]
    fn identify_subject_should_fall_back_to_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", HeaderValue::from_static("127.0.0.1"));
        assert_eq!(identify_subject(&headers, "test"), "ip:127.0.0.1");
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer nope"),
        );
        assert_eq!(identify_subject(&headers, "test"), "ip:127.0.0.1");
    }
}
