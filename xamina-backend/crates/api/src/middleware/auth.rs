use async_trait::async_trait;
use axum::{extract::FromRequestParts, http::request::Parts};
use chrono::Utc;
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::app::{ApiError, SharedState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub tenant_id: Uuid,
    pub role: String,
    pub exp: usize,
}

#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

pub fn decode_claims(token: &str, jwt_secret: &str) -> Result<Claims, ApiError> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| {
        ApiError::new(
            axum::http::StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Invalid token",
        )
    })?;

    if token_data.claims.exp <= Utc::now().timestamp() as usize {
        return Err(ApiError::new(
            axum::http::StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Token expired",
        ));
    }

    Ok(token_data.claims)
}

#[async_trait]
impl FromRequestParts<SharedState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| {
                ApiError::new(
                    axum::http::StatusCode::UNAUTHORIZED,
                    "UNAUTHORIZED",
                    "Missing bearer token",
                )
            })?;

        let mut claims = decode_claims(token, &state.jwt_secret)?;
        if claims.role == "super_admin" {
            if let Some(raw_tenant_id) = parts
                .headers
                .get("x-tenant-id")
                .and_then(|v| v.to_str().ok())
                .filter(|v| !v.is_empty())
            {
                if let Ok(tenant_id) = Uuid::parse_str(raw_tenant_id) {
                    claims.tenant_id = tenant_id;
                }
            }
        }

        Ok(Self(claims))
    }
}
