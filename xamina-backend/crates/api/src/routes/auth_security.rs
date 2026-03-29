use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use axum::http::{HeaderMap, StatusCode};
use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    app::{ApiError, SharedState},
    middleware::auth::AuthUser,
    routes::auth::AuthUserDto,
};

const OTP_TTL_MINUTES: i64 = 10;
const OTP_MAX_ATTEMPTS: i32 = 5;
const OTP_RESEND_COOLDOWN_SECONDS: i64 = 30;
const FAILED_LOGIN_WINDOW_SECONDS: usize = 15 * 60;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthResponseStatus {
    Authenticated,
    ChallengeRequired,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoginChallengeData {
    pub status: AuthResponseStatus,
    pub challenge_token: String,
    pub delivery: String,
    pub expires_at: DateTime<Utc>,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoginSessionData {
    pub status: AuthResponseStatus,
    pub access_token: String,
    pub refresh_token: String,
    pub user: AuthUserDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum LoginResponseData {
    Authenticated(LoginSessionData),
    ChallengeRequired(LoginChallengeData),
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SecurityEventDto {
    pub id: Uuid,
    pub event_type: String,
    pub risk_level: String,
    pub reason_codes_jsonb: Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SecuritySettingsDto {
    pub email_otp_enabled: bool,
    pub recent_events: Vec<SecurityEventDto>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSecuritySettingsRequest {
    pub email_otp_enabled: bool,
    pub current_password: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct UserSecuritySettingsRow {
    pub email_otp_enabled: bool,
}

#[derive(Debug, Clone, FromRow)]
pub struct SecurityUserRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub name: String,
    pub role: String,
    pub class_id: Option<Uuid>,
}

#[derive(Debug, Clone, FromRow)]
pub struct LoginChallengeRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub otp_code_hash: String,
    pub risk_level: String,
    pub reason_codes_jsonb: Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub user_agent_hash: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub resend_available_at: DateTime<Utc>,
    pub attempt_count: i32,
    pub max_attempts: i32,
}

#[derive(Debug, Clone)]
pub struct SecurityContext {
    pub ip_address: String,
    pub user_agent: Option<String>,
    pub user_agent_hash: String,
}

#[derive(Debug, Clone)]
pub struct RiskEvaluation {
    pub requires_challenge: bool,
    pub risk_level: String,
    pub reason_codes: Vec<String>,
}

pub async fn ensure_auth_security_schema_for_state(state: &SharedState) -> Result<(), ApiError> {
    let statements = [
        "CREATE TABLE IF NOT EXISTS user_security_settings (
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            email_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
        "CREATE TABLE IF NOT EXISTS auth_login_challenges (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            challenge_token TEXT NOT NULL UNIQUE,
            otp_code_hash TEXT NOT NULL,
            delivery TEXT NOT NULL DEFAULT 'email' CHECK (delivery IN ('email')),
            risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
            reason_codes_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
            ip_address TEXT,
            user_agent TEXT,
            user_agent_hash TEXT,
            expires_at TIMESTAMPTZ NOT NULL,
            resend_available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            consumed_at TIMESTAMPTZ,
            attempt_count INT NOT NULL DEFAULT 0,
            max_attempts INT NOT NULL DEFAULT 5,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
        "CREATE TABLE IF NOT EXISTS auth_login_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            challenge_id UUID REFERENCES auth_login_challenges(id) ON DELETE SET NULL,
            email TEXT NOT NULL,
            event_type TEXT NOT NULL CHECK (event_type IN ('success', 'failed_password', 'challenge_required', 'challenge_verified', 'otp_failed')),
            risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
            reason_codes_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
            ip_address TEXT,
            user_agent TEXT,
            user_agent_hash TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
        "CREATE INDEX IF NOT EXISTS idx_user_security_settings_tenant_user ON user_security_settings(tenant_id, user_id)",
        "CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_user_created ON auth_login_challenges(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_token ON auth_login_challenges(challenge_token)",
        "CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_active ON auth_login_challenges(user_id, consumed_at, expires_at)",
        "CREATE INDEX IF NOT EXISTS idx_auth_login_events_user_created ON auth_login_events(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_auth_login_events_email_created ON auth_login_events(tenant_id, email, created_at DESC)",
        "ALTER TABLE user_security_settings ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE auth_login_challenges ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE auth_login_events ENABLE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS user_security_settings_tenant_isolation ON user_security_settings",
        "CREATE POLICY user_security_settings_tenant_isolation ON user_security_settings
          USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
          WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id())",
        "DROP POLICY IF EXISTS auth_login_challenges_tenant_isolation ON auth_login_challenges",
        "CREATE POLICY auth_login_challenges_tenant_isolation ON auth_login_challenges
          USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
          WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id())",
        "DROP POLICY IF EXISTS auth_login_events_tenant_isolation ON auth_login_events",
        "CREATE POLICY auth_login_events_tenant_isolation ON auth_login_events
          USING (app.is_super_admin() OR tenant_id = app.current_tenant_id())
          WITH CHECK (app.is_super_admin() OR tenant_id = app.current_tenant_id())",
    ];

    for statement in statements {
        sqlx::query(statement)
            .execute(&state.pool)
            .await
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DB_ERROR",
                    "Failed to initialize auth security schema",
                )
            })?;
    }

    Ok(())
}

pub async fn load_security_settings(
    state: &SharedState,
    auth: &AuthUser,
) -> Result<SecuritySettingsDto, ApiError> {
    ensure_auth_security_schema_for_state(state).await?;
    let settings = load_settings_row(state, auth.0.tenant_id, auth.0.sub).await?;
    let recent_events =
        list_recent_security_events(state, auth.0.tenant_id, auth.0.sub, 10).await?;
    Ok(SecuritySettingsDto {
        email_otp_enabled: settings.email_otp_enabled,
        recent_events,
    })
}

pub async fn update_security_settings(
    state: &SharedState,
    auth: &AuthUser,
    payload: UpdateSecuritySettingsRequest,
) -> Result<SecuritySettingsDto, ApiError> {
    ensure_auth_security_schema_for_state(state).await?;
    let password = payload.current_password.trim();
    if password.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Current password is required",
        ));
    }

    let user = load_security_user(state, auth.0.tenant_id, auth.0.sub).await?;
    if !verify_password_hash(&user.password_hash, password) {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_PASSWORD",
            "Current password is invalid",
        ));
    }

    sqlx::query(
        "INSERT INTO user_security_settings (tenant_id, user_id, email_otp_enabled, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET email_otp_enabled = EXCLUDED.email_otp_enabled, updated_at = NOW()",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .bind(payload.email_otp_enabled)
    .execute(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to update security settings",
        )
    })?;

    load_security_settings(state, auth).await
}

pub async fn load_security_user(
    state: &SharedState,
    tenant_id: Uuid,
    user_id: Uuid,
) -> Result<SecurityUserRow, ApiError> {
    sqlx::query_as::<_, SecurityUserRow>(
        "SELECT id, tenant_id, email, password_hash, name, role, class_id, is_active
         FROM users
         WHERE tenant_id = $1 AND id = $2",
    )
    .bind(tenant_id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load user",
        )
    })?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "User not found"))
}

pub fn build_security_context(headers: &HeaderMap) -> SecurityContext {
    let ip_address = extract_ip_address(headers).unwrap_or_else(|| "local".to_string());
    let user_agent = headers
        .get("user-agent")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let user_agent_hash = hash_value(user_agent.as_deref().unwrap_or("unknown"));

    SecurityContext {
        ip_address,
        user_agent,
        user_agent_hash,
    }
}

pub async fn evaluate_risk(
    state: &SharedState,
    tenant_id: Uuid,
    email: &str,
    user_id: Uuid,
    ctx: &SecurityContext,
    always_on_otp: bool,
) -> Result<RiskEvaluation, ApiError> {
    ensure_auth_security_schema_for_state(state).await?;

    let mut reason_codes = Vec::new();
    if always_on_otp {
        reason_codes.push("always_on_email_otp".to_string());
    }

    let prior_successes = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)
         FROM auth_login_events
         WHERE tenant_id = $1
           AND user_id = $2
           AND event_type IN ('success', 'challenge_verified')
           AND created_at >= NOW() - INTERVAL '30 days'",
    )
    .bind(tenant_id)
    .bind(user_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    if prior_successes > 0 {
        let known_device = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM auth_login_events
             WHERE tenant_id = $1
               AND user_id = $2
               AND event_type IN ('success', 'challenge_verified')
               AND created_at >= NOW() - INTERVAL '30 days'
               AND COALESCE(ip_address, '') = $3
               AND COALESCE(user_agent_hash, '') = $4",
        )
        .bind(tenant_id)
        .bind(user_id)
        .bind(&ctx.ip_address)
        .bind(&ctx.user_agent_hash)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

        if known_device == 0 {
            reason_codes.push("new_device_or_ip".to_string());
        }
    }

    let failed_login_count = read_redis_counter(
        &state.redis,
        &failed_login_key(tenant_id, email, &ctx.ip_address),
    )
    .await;
    if failed_login_count >= 3 {
        reason_codes.push("recent_failed_logins".to_string());
    }

    let otp_failed_count = read_redis_counter(
        &state.redis,
        &otp_failed_key(tenant_id, email, &ctx.ip_address),
    )
    .await;
    if otp_failed_count >= 3 {
        reason_codes.push("recent_otp_failures".to_string());
    }

    let risk_level = if reason_codes
        .iter()
        .any(|item| item == "recent_failed_logins" || item == "recent_otp_failures")
    {
        "high"
    } else if reason_codes.iter().any(|item| item == "new_device_or_ip") {
        "medium"
    } else {
        "low"
    }
    .to_string();

    Ok(RiskEvaluation {
        requires_challenge: !reason_codes.is_empty(),
        risk_level,
        reason_codes,
    })
}

pub async fn create_login_challenge(
    state: &SharedState,
    user: &SecurityUserRow,
    risk: &RiskEvaluation,
    ctx: &SecurityContext,
) -> Result<LoginChallengeData, ApiError> {
    ensure_auth_security_schema_for_state(state).await?;
    let now = Utc::now();
    let expires_at = now + Duration::minutes(OTP_TTL_MINUTES);
    let resend_available_at = now + Duration::seconds(OTP_RESEND_COOLDOWN_SECONDS);
    let challenge_token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
    let otp_code = generate_otp_code();
    let otp_code_hash = hash_value(&otp_code);
    let reason_codes_jsonb = json!(risk.reason_codes);

    sqlx::query(
        "UPDATE auth_login_challenges
         SET consumed_at = NOW(), updated_at = NOW()
         WHERE user_id = $1
           AND consumed_at IS NULL",
    )
    .bind(user.id)
    .execute(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to rotate existing challenge",
        )
    })?;

    let challenge_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO auth_login_challenges (
            tenant_id, user_id, email, challenge_token, otp_code_hash, delivery, risk_level,
            reason_codes_jsonb, ip_address, user_agent, user_agent_hash, expires_at, resend_available_at,
            max_attempts
         )
         VALUES ($1, $2, $3, $4, $5, 'email', $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id",
    )
    .bind(user.tenant_id)
    .bind(user.id)
    .bind(&user.email)
    .bind(&challenge_token)
    .bind(&otp_code_hash)
    .bind(&risk.risk_level)
    .bind(reason_codes_jsonb)
    .bind(&ctx.ip_address)
    .bind(ctx.user_agent.as_deref())
    .bind(&ctx.user_agent_hash)
    .bind(expires_at)
    .bind(resend_available_at)
    .bind(OTP_MAX_ATTEMPTS)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to create login challenge"))?;

    enqueue_otp_email_job(state, user, &otp_code, expires_at).await?;
    record_login_event(
        state,
        Some(user.tenant_id),
        Some(user.id),
        Some(challenge_id),
        &user.email,
        "challenge_required",
        &risk.risk_level,
        &risk.reason_codes,
        ctx,
    )
    .await?;

    Ok(LoginChallengeData {
        status: AuthResponseStatus::ChallengeRequired,
        challenge_token,
        delivery: "email".to_string(),
        expires_at,
        reason_codes: risk.reason_codes.clone(),
    })
}

pub async fn verify_login_otp(
    state: &SharedState,
    challenge_token: &str,
    code: &str,
) -> Result<LoginSessionData, ApiError> {
    ensure_auth_security_schema_for_state(state).await?;
    let challenge = load_active_challenge(state, challenge_token).await?;
    let user = load_security_user(state, challenge.tenant_id, challenge.user_id).await?;
    let ctx = SecurityContext {
        ip_address: challenge
            .ip_address
            .clone()
            .unwrap_or_else(|| "local".to_string()),
        user_agent: challenge.user_agent.clone(),
        user_agent_hash: challenge
            .user_agent_hash
            .clone()
            .unwrap_or_else(|| hash_value("unknown")),
    };
    let reason_codes = json_array_to_strings(&challenge.reason_codes_jsonb);
    let trimmed = code.trim();
    if trimmed.len() != 6 || !trimmed.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_OTP",
            "OTP must be 6 digits",
        ));
    }

    if challenge.expires_at <= Utc::now() {
        consume_challenge(state, challenge.id).await?;
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "OTP_EXPIRED",
            "OTP challenge has expired",
        ));
    }

    if challenge.attempt_count >= challenge.max_attempts {
        consume_challenge(state, challenge.id).await?;
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "OTP_ATTEMPTS_EXCEEDED",
            "OTP attempts exceeded",
        ));
    }

    if challenge.otp_code_hash != hash_value(trimmed) {
        let attempts = sqlx::query_scalar::<_, i32>(
            "UPDATE auth_login_challenges
             SET attempt_count = attempt_count + 1, updated_at = NOW()
             WHERE id = $1
             RETURNING attempt_count",
        )
        .bind(challenge.id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(challenge.attempt_count + 1);
        increment_redis_counter(
            &state.redis,
            &otp_failed_key(challenge.tenant_id, &challenge.email, &ctx.ip_address),
            FAILED_LOGIN_WINDOW_SECONDS,
        )
        .await;
        record_login_event(
            state,
            Some(challenge.tenant_id),
            Some(challenge.user_id),
            Some(challenge.id),
            &challenge.email,
            "otp_failed",
            &challenge.risk_level,
            &reason_codes,
            &ctx,
        )
        .await?;
        if attempts >= challenge.max_attempts {
            consume_challenge(state, challenge.id).await?;
            return Err(ApiError::new(
                StatusCode::UNAUTHORIZED,
                "OTP_ATTEMPTS_EXCEEDED",
                "OTP attempts exceeded",
            ));
        }
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_OTP",
            "OTP code is invalid",
        ));
    }

    consume_challenge(state, challenge.id).await?;
    clear_redis_counter(
        &state.redis,
        &failed_login_key(challenge.tenant_id, &challenge.email, &ctx.ip_address),
    )
    .await;
    clear_redis_counter(
        &state.redis,
        &otp_failed_key(challenge.tenant_id, &challenge.email, &ctx.ip_address),
    )
    .await;
    record_login_event(
        state,
        Some(challenge.tenant_id),
        Some(challenge.user_id),
        Some(challenge.id),
        &challenge.email,
        "challenge_verified",
        &challenge.risk_level,
        &reason_codes,
        &ctx,
    )
    .await?;
    issue_session(state, &user).await
}

pub async fn resend_login_otp(
    state: &SharedState,
    challenge_token: &str,
) -> Result<LoginChallengeData, ApiError> {
    ensure_auth_security_schema_for_state(state).await?;
    let challenge = load_active_challenge(state, challenge_token).await?;
    if challenge.resend_available_at > Utc::now() {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "OTP_RESEND_COOLDOWN",
            "OTP resend cooldown is active",
        ));
    }
    let user = load_security_user(state, challenge.tenant_id, challenge.user_id).await?;
    consume_challenge(state, challenge.id).await?;
    let risk = RiskEvaluation {
        requires_challenge: true,
        risk_level: challenge.risk_level.clone(),
        reason_codes: json_array_to_strings(&challenge.reason_codes_jsonb),
    };
    let ctx = SecurityContext {
        ip_address: challenge
            .ip_address
            .clone()
            .unwrap_or_else(|| "local".to_string()),
        user_agent: challenge.user_agent.clone(),
        user_agent_hash: challenge
            .user_agent_hash
            .clone()
            .unwrap_or_else(|| hash_value("unknown")),
    };
    create_login_challenge(state, &user, &risk, &ctx).await
}

pub async fn record_failed_password_attempt(
    state: &SharedState,
    tenant_id: Uuid,
    user_id: Option<Uuid>,
    email: &str,
    ctx: &SecurityContext,
) -> Result<(), ApiError> {
    increment_redis_counter(
        &state.redis,
        &failed_login_key(tenant_id, email, &ctx.ip_address),
        FAILED_LOGIN_WINDOW_SECONDS,
    )
    .await;
    record_login_event(
        state,
        Some(tenant_id),
        user_id,
        None,
        email,
        "failed_password",
        "high",
        &["recent_failed_logins".to_string()],
        ctx,
    )
    .await
}

pub async fn record_successful_login(
    state: &SharedState,
    user: &SecurityUserRow,
    ctx: &SecurityContext,
) -> Result<(), ApiError> {
    clear_redis_counter(
        &state.redis,
        &failed_login_key(user.tenant_id, &user.email, &ctx.ip_address),
    )
    .await;
    clear_redis_counter(
        &state.redis,
        &otp_failed_key(user.tenant_id, &user.email, &ctx.ip_address),
    )
    .await;
    record_login_event(
        state,
        Some(user.tenant_id),
        Some(user.id),
        None,
        &user.email,
        "success",
        "low",
        &[],
        ctx,
    )
    .await
}

pub async fn issue_session(
    state: &SharedState,
    user: &SecurityUserRow,
) -> Result<LoginSessionData, ApiError> {
    let access_token = super::issue_access_token(state, user.id, user.tenant_id, &user.role)?;
    let refresh_token = format!("{}{}", Uuid::new_v4(), Uuid::new_v4());
    let refresh_exp = Utc::now() + Duration::days(state.refresh_ttl_days);

    sqlx::query(
        "INSERT INTO refresh_tokens (tenant_id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(user.tenant_id)
    .bind(user.id)
    .bind(&refresh_token)
    .bind(refresh_exp)
    .execute(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to create refresh token"))?;

    Ok(LoginSessionData {
        status: AuthResponseStatus::Authenticated,
        access_token,
        refresh_token,
        user: AuthUserDto {
            id: user.id,
            tenant_id: user.tenant_id,
            email: user.email.clone(),
            name: user.name.clone(),
            role: user.role.clone(),
            class_id: user.class_id,
        },
    })
}

pub async fn load_settings_row(
    state: &SharedState,
    tenant_id: Uuid,
    user_id: Uuid,
) -> Result<UserSecuritySettingsRow, ApiError> {
    sqlx::query_as::<_, UserSecuritySettingsRow>(
        "SELECT email_otp_enabled
         FROM user_security_settings
         WHERE tenant_id = $1 AND user_id = $2",
    )
    .bind(tenant_id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load security settings",
        )
    })?
    .map(Ok)
    .unwrap_or(Ok(UserSecuritySettingsRow {
        email_otp_enabled: false,
    }))
}

pub async fn list_recent_security_events(
    state: &SharedState,
    tenant_id: Uuid,
    user_id: Uuid,
    limit: i64,
) -> Result<Vec<SecurityEventDto>, ApiError> {
    sqlx::query_as::<_, SecurityEventDto>(
        "SELECT id, event_type, risk_level, reason_codes_jsonb, ip_address, user_agent, created_at
         FROM auth_login_events
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT $3",
    )
    .bind(tenant_id)
    .bind(user_id)
    .bind(limit.max(1))
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load security events",
        )
    })
}

fn extract_ip_address(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
}

async fn enqueue_otp_email_job(
    state: &SharedState,
    user: &SecurityUserRow,
    otp_code: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), ApiError> {
    let subject = "Kode verifikasi login Xamina";
    let body = format!(
        "Halo {},\n\nKode OTP login Anda adalah: {}\nKode ini berlaku sampai {} UTC.\nJika Anda tidak merasa melakukan login, abaikan email ini.",
        user.name,
        otp_code,
        expires_at.format("%Y-%m-%d %H:%M:%S")
    );

    sqlx::query(
        "INSERT INTO email_jobs (tenant_id, user_id, certificate_id, to_email, subject, body)
         VALUES ($1, $2, NULL, $3, $4, $5)",
    )
    .bind(user.tenant_id)
    .bind(user.id)
    .bind(&user.email)
    .bind(subject)
    .bind(body)
    .execute(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to enqueue OTP email",
        )
    })?;

    Ok(())
}

async fn record_login_event(
    state: &SharedState,
    tenant_id: Option<Uuid>,
    user_id: Option<Uuid>,
    challenge_id: Option<Uuid>,
    email: &str,
    event_type: &str,
    risk_level: &str,
    reason_codes: &[String],
    ctx: &SecurityContext,
) -> Result<(), ApiError> {
    let Some(tenant_id) = tenant_id else {
        return Ok(());
    };
    sqlx::query(
        "INSERT INTO auth_login_events (
            tenant_id, user_id, challenge_id, email, event_type, risk_level, reason_codes_jsonb,
            ip_address, user_agent, user_agent_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(tenant_id)
    .bind(user_id)
    .bind(challenge_id)
    .bind(email)
    .bind(event_type)
    .bind(risk_level)
    .bind(json!(reason_codes))
    .bind(&ctx.ip_address)
    .bind(ctx.user_agent.as_deref())
    .bind(&ctx.user_agent_hash)
    .execute(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to record auth security event",
        )
    })?;
    Ok(())
}

async fn load_active_challenge(
    state: &SharedState,
    challenge_token: &str,
) -> Result<LoginChallengeRow, ApiError> {
    sqlx::query_as::<_, LoginChallengeRow>(
        "SELECT
            id, tenant_id, user_id, email, otp_code_hash, risk_level,
            reason_codes_jsonb, ip_address, user_agent, user_agent_hash, expires_at,
            resend_available_at, attempt_count, max_attempts
         FROM auth_login_challenges
         WHERE challenge_token = $1
           AND consumed_at IS NULL",
    )
    .bind(challenge_token)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load login challenge",
        )
    })?
    .ok_or_else(|| {
        ApiError::new(
            StatusCode::UNAUTHORIZED,
            "CHALLENGE_NOT_FOUND",
            "Login challenge not found",
        )
    })
}

async fn consume_challenge(state: &SharedState, challenge_id: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        "UPDATE auth_login_challenges
         SET consumed_at = NOW(), updated_at = NOW()
         WHERE id = $1",
    )
    .bind(challenge_id)
    .execute(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to update login challenge",
        )
    })?;
    Ok(())
}

fn failed_login_key(tenant_id: Uuid, email: &str, ip_address: &str) -> String {
    format!(
        "security:failed-login:{}:{}:{}",
        tenant_id,
        email.trim().to_ascii_lowercase(),
        ip_address
    )
}

fn otp_failed_key(tenant_id: Uuid, email: &str, ip_address: &str) -> String {
    format!(
        "security:otp-failed:{}:{}:{}",
        tenant_id,
        email.trim().to_ascii_lowercase(),
        ip_address
    )
}

async fn increment_redis_counter(redis: &redis::Client, key: &str, ttl_seconds: usize) {
    if let Ok(mut conn) = redis.get_multiplexed_async_connection().await {
        let current: Result<i64, _> = conn.incr(key, 1).await;
        if matches!(current, Ok(1)) {
            let _: Result<bool, _> = conn.expire(key, ttl_seconds as i64).await;
        }
    }
}

async fn read_redis_counter(redis: &redis::Client, key: &str) -> i64 {
    if let Ok(mut conn) = redis.get_multiplexed_async_connection().await {
        let value: Result<Option<i64>, _> = conn.get(key).await;
        return value.ok().flatten().unwrap_or(0);
    }
    0
}

async fn clear_redis_counter(redis: &redis::Client, key: &str) {
    if let Ok(mut conn) = redis.get_multiplexed_async_connection().await {
        let _: Result<i64, _> = conn.del(key).await;
    }
}

fn hash_value(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn generate_otp_code() -> String {
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(0..1_000_000))
}

fn json_array_to_strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item.as_str().map(ToOwned::to_owned))
        .collect()
}

fn verify_password_hash(hash: &str, password: &str) -> bool {
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
