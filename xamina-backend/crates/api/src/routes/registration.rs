use axum::{
    extract::State,
    http::StatusCode,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::app::{ApiError, ApiResult, SharedState, SuccessResponse};

pub fn routes() -> Router<SharedState> {
    Router::new().route("/public/register", post(register_tenant))
}

#[derive(Debug, Deserialize)]
struct RegisterPayload {
    tenant_name: String,
    admin_name: String,
    admin_email: String,
    admin_password: String,
}

#[derive(Debug, Serialize)]
struct RegisterResponse {
    tenant_id: Uuid,
    tenant_name: String,
    tenant_slug: String,
    admin_user_id: Uuid,
    admin_email: String,
}

/// Generate a URL-safe slug from tenant name.
/// "SMA Negeri 1 Jakarta" → "sma-negeri-1-jakarta"
fn slugify(name: &str) -> String {
    let slug: String = name
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();

    // Collapse consecutive dashes, trim leading/trailing dashes, truncate
    let collapsed: String = slug
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if collapsed.len() > 48 {
        collapsed[..48].trim_end_matches('-').to_string()
    } else {
        collapsed
    }
}

async fn register_tenant(
    State(state): State<SharedState>,
    Json(body): Json<RegisterPayload>,
) -> ApiResult<SuccessResponse<RegisterResponse>> {
    // ── Validation ──────────────────────────────────────────────
    let tenant_name = body.tenant_name.trim().to_string();
    let admin_name = body.admin_name.trim().to_string();
    let admin_email = body.admin_email.trim().to_ascii_lowercase();
    let admin_password = body.admin_password.clone();

    if tenant_name.is_empty() || admin_name.is_empty() || admin_email.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "tenant_name, admin_name, and admin_email are required",
        ));
    }

    if !admin_email.contains('@') || !admin_email.contains('.') {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "admin_email must be a valid email address",
        ));
    }

    if admin_password.len() < 8 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "admin_password must be at least 8 characters",
        ));
    }

    let slug = slugify(&tenant_name);
    if slug.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "tenant_name must contain at least one alphanumeric character",
        ));
    }

    // ── Hash password (Argon2, matching UserService pattern) ────
    let password_hash = {
        use argon2::{
            password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
            Argon2,
        };
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(admin_password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "HASH_FAILED",
                    "Failed to hash password",
                )
            })?
    };

    // ── Transaction: create tenant + admin user atomically ─────
    let mut tx = state.pool.begin().await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to start transaction",
        )
    })?;

    // 1. Insert tenant
    let tenant_id: Uuid = sqlx::query_scalar(
        "INSERT INTO tenants (name, slug, plan, is_active, users_quota, ai_credits_quota, ai_credits_used, updated_at)
         VALUES ($1, $2, 'starter', TRUE, 500, 200, 0, NOW())
         RETURNING id",
    )
    .bind(&tenant_name)
    .bind(&slug)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate key") || msg.contains("unique constraint") {
            if msg.contains("slug") {
                return ApiError::new(
                    StatusCode::CONFLICT,
                    "SLUG_CONFLICT",
                    "A tenant with this name (slug) already exists",
                )
                .with_details(json!({ "slug": slug }));
            }
        }
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "CREATE_TENANT_FAILED",
            "Failed to create tenant",
        )
        .with_details(json!({ "db_error": msg }))
    })?;

    // 2. Insert admin user
    let admin_user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (tenant_id, email, password_hash, name, role, is_active)
         VALUES ($1, $2, $3, $4, 'admin', TRUE)
         RETURNING id",
    )
    .bind(tenant_id)
    .bind(&admin_email)
    .bind(&password_hash)
    .bind(&admin_name)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate key") || msg.contains("unique constraint") {
            return ApiError::new(
                StatusCode::CONFLICT,
                "EMAIL_CONFLICT",
                "A user with this email already exists",
            )
            .with_details(json!({ "email": admin_email }));
        }
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "CREATE_USER_FAILED",
            "Failed to create admin user",
        )
        .with_details(json!({ "db_error": msg }))
    })?;

    // 3. Commit
    tx.commit().await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to commit registration",
        )
    })?;

    tracing::info!(
        tenant_id = %tenant_id,
        slug = %slug,
        admin_email = %admin_email,
        "New tenant registered via self-serve onboarding"
    );

    Ok(Json(SuccessResponse {
        success: true,
        data: RegisterResponse {
            tenant_id,
            tenant_name,
            tenant_slug: slug,
            admin_user_id,
            admin_email,
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("SMA Negeri 1 Jakarta"), "sma-negeri-1-jakarta");
    }

    #[test]
    fn slugify_special_chars() {
        assert_eq!(slugify("Sekolah (Baru) #1!"), "sekolah-baru-1");
    }

    #[test]
    fn slugify_empty_after_sanitize() {
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn slugify_long_name() {
        let long_name = "a".repeat(100);
        let result = slugify(&long_name);
        assert!(result.len() <= 48);
    }
}
