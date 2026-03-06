use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use axum::{
    extract::State,
    http::StatusCode,
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

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/auth/login", post(login))
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
struct RefreshRequest {
    refresh_token: String,
}

#[derive(Deserialize)]
struct LogoutRequest {
    refresh_token: String,
}

#[derive(Serialize)]
pub struct AuthUserDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub class_id: Option<Uuid>,
}

#[derive(Serialize)]
struct LoginData {
    access_token: String,
    refresh_token: String,
    user: AuthUserDto,
}

#[derive(FromRow)]
struct TenantRow {
    id: Uuid,
}

#[derive(FromRow)]
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

fn issue_access_token(
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
    Json(body): Json<LoginRequest>,
) -> ApiResult<SuccessResponse<LoginData>> {
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

    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, tenant_id, email, password_hash, name, role, class_id, is_active
         FROM users WHERE tenant_id = $1 AND email = $2",
    )
    .bind(tenant.id)
    .bind(body.email.to_lowercase())
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load user",
        )
    })?
    .ok_or_else(|| {
        ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_LOGIN",
            "Invalid credentials",
        )
    })?;

    if !user.is_active || !verify_password(&user.password_hash, &body.password) {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_LOGIN",
            "Invalid credentials",
        ));
    }

    let access_token = issue_access_token(&state, user.id, user.tenant_id, &user.role)?;
    let refresh_token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
    let refresh_exp = Utc::now() + Duration::days(state.refresh_ttl_days);

    sqlx::query("INSERT INTO refresh_tokens (tenant_id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)")
        .bind(user.tenant_id)
        .bind(user.id)
        .bind(&refresh_token)
        .bind(refresh_exp)
        .execute(&state.pool)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to create refresh token"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: LoginData {
            access_token,
            refresh_token,
            user: AuthUserDto {
                id: user.id,
                tenant_id: user.tenant_id,
                email: user.email,
                name: user.name,
                role: user.role,
                class_id: user.class_id,
            },
        },
    }))
}

async fn refresh_token(
    State(state): State<SharedState>,
    Json(body): Json<RefreshRequest>,
) -> ApiResult<SuccessResponse<LoginData>> {
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

    let access_token = issue_access_token(&state, user.id, user.tenant_id, &user.role)?;
    let refresh_token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
    let refresh_exp = Utc::now() + Duration::days(state.refresh_ttl_days);

    sqlx::query("INSERT INTO refresh_tokens (tenant_id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)")
        .bind(user.tenant_id)
        .bind(user.id)
        .bind(&refresh_token)
        .bind(refresh_exp)
        .execute(&state.pool)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to create new token"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: LoginData {
            access_token,
            refresh_token,
            user: AuthUserDto {
                id: user.id,
                tenant_id: user.tenant_id,
                email: user.email,
                name: user.name,
                role: user.role,
                class_id: user.class_id,
            },
        },
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
