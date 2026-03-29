#[path = "auth_security.rs"]
pub(crate) mod auth_security;

use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::auth::{AuthUser, Claims},
};

use self::auth_security::{
    build_security_context, create_login_challenge, ensure_auth_security_schema_for_state,
    evaluate_risk, issue_session, load_settings_row, record_failed_password_attempt,
    record_successful_login, resend_login_otp, verify_login_otp, LoginResponseData,
    SecurityUserRow,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/login/verify-email-otp", post(verify_email_otp))
        .route("/auth/login/resend-email-otp", post(resend_email_otp))
        .route("/auth/refresh", post(refresh_token))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
    tenant_slug: Option<String>,
}

#[derive(Deserialize)]
struct VerifyOtpRequest {
    challenge_token: String,
    code: String,
}

#[derive(Deserialize)]
struct ResendOtpRequest {
    challenge_token: String,
}

#[derive(Deserialize)]
struct RefreshRequest {
    refresh_token: String,
}

#[derive(Deserialize)]
struct LogoutRequest {
    refresh_token: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthUserDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub class_id: Option<Uuid>,
}

#[derive(Debug, Clone, FromRow)]
struct TenantRow {
    id: Uuid,
}

#[derive(Debug, Clone, FromRow)]
struct UserRow {
    id: Uuid,
    tenant_id: Uuid,
    email: String,
    password_hash: String,
    name: String,
    role: String,
    class_id: Option<Uuid>,
    is_active: bool,
}

fn verify_password(hash: &str, password: &str) -> bool {
    if !hash.starts_with("$argon2") {
        return hash == password;
    }
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub(crate) fn issue_access_token(
    state: &crate::app::AppState,
    user_id: Uuid,
    tenant_id: Uuid,
    role: &str,
) -> Result<String, ApiError> {
    let claims = Claims {
        sub: user_id,
        tenant_id,
        role: role.to_string(),
        exp: (Utc::now() + Duration::minutes(state.access_ttl_minutes)).timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TOKEN_FAILED",
            "Failed to create access token",
        )
    })
}

async fn login(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> ApiResult<SuccessResponse<LoginResponseData>> {
    ensure_auth_security_schema_for_state(&state).await?;

    let tenant_slug = body.tenant_slug.unwrap_or_else(|| "default".to_string());
    let tenant = sqlx::query_as::<_, TenantRow>(
        "SELECT id FROM tenants WHERE slug = $1 AND is_active = TRUE",
    )
    .bind(tenant_slug)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load tenant",
        )
    })?
    .ok_or_else(|| {
        ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_LOGIN",
            "Invalid credentials",
        )
    })?;

    let email = body.email.trim().to_ascii_lowercase();
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, tenant_id, email, password_hash, name, role, class_id, is_active
         FROM users
         WHERE tenant_id = $1 AND email = $2",
    )
    .bind(tenant.id)
    .bind(&email)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load user",
        )
    })?;

    let security_ctx = build_security_context(&headers);

    let Some(user) = user else {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_LOGIN",
            "Invalid credentials",
        ));
    };

    if !user.is_active || !verify_password(&user.password_hash, &body.password) {
        record_failed_password_attempt(
            &state,
            user.tenant_id,
            Some(user.id),
            &email,
            &security_ctx,
        )
        .await?;
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_LOGIN",
            "Invalid credentials",
        ));
    }

    let settings = load_settings_row(&state, user.tenant_id, user.id).await?;
    let security_user = map_user(&user);
    let risk = evaluate_risk(
        &state,
        user.tenant_id,
        &user.email,
        user.id,
        &security_ctx,
        settings.email_otp_enabled,
    )
    .await?;

    if risk.requires_challenge {
        let challenge =
            create_login_challenge(&state, &security_user, &risk, &security_ctx).await?;
        return Ok(Json(SuccessResponse {
            success: true,
            data: LoginResponseData::ChallengeRequired(challenge),
        }));
    }

    let session = issue_session(&state, &security_user).await?;
    record_successful_login(&state, &security_user, &security_ctx).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: LoginResponseData::Authenticated(session),
    }))
}

async fn verify_email_otp(
    State(state): State<SharedState>,
    Json(body): Json<VerifyOtpRequest>,
) -> ApiResult<SuccessResponse<auth_security::LoginSessionData>> {
    let session = verify_login_otp(&state, &body.challenge_token, &body.code).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: session,
    }))
}

async fn resend_email_otp(
    State(state): State<SharedState>,
    Json(body): Json<ResendOtpRequest>,
) -> ApiResult<SuccessResponse<auth_security::LoginChallengeData>> {
    let challenge = resend_login_otp(&state, &body.challenge_token).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: challenge,
    }))
}

async fn refresh_token(
    State(state): State<SharedState>,
    Json(body): Json<RefreshRequest>,
) -> ApiResult<SuccessResponse<auth_security::LoginSessionData>> {
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT u.id, u.tenant_id, u.email, u.password_hash, u.name, u.role, u.class_id, u.is_active
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()",
    )
    .bind(&body.refresh_token)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to refresh token"))?
    .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "INVALID_REFRESH", "Refresh token invalid or expired"))?;

    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1")
        .bind(&body.refresh_token)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed to revoke old token",
            )
        })?;

    let session = issue_session(&state, &map_user(&user)).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: session,
    }))
}

async fn logout(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<LogoutRequest>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    sqlx::query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1 AND user_id = $2")
        .bind(body.refresh_token)
        .bind(auth.0.sub)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed to logout",
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "message": "Logged out" }),
    }))
}

async fn me(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<AuthUserDto>> {
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, tenant_id, email, password_hash, name, role, class_id, is_active
         FROM users WHERE id = $1 AND tenant_id = $2",
    )
    .bind(auth.0.sub)
    .bind(auth.0.tenant_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load user",
        )
    })?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "User not found"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: AuthUserDto {
            id: user.id,
            tenant_id: user.tenant_id,
            email: user.email,
            name: user.name,
            role: user.role,
            class_id: user.class_id,
        },
    }))
}

fn map_user(user: &UserRow) -> SecurityUserRow {
    SecurityUserRow {
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email.clone(),
        password_hash: user.password_hash.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
        class_id: user.class_id,
    }
}
