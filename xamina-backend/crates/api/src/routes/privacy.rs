use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::auth::AuthUser,
    privacy_ops::ensure_privacy_schema_for_state,
    routes::auth::auth_security::{
        load_security_settings, update_security_settings, SecuritySettingsDto,
        UpdateSecuritySettingsRequest,
    },
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/auth/privacy/export", get(export_my_data))
        .route(
            "/auth/privacy/security-settings",
            get(get_security_settings).patch(patch_security_settings),
        )
        .route(
            "/auth/privacy/delete-request",
            get(get_latest_delete_request).post(create_delete_request),
        )
}

#[derive(Serialize)]
struct PrivacyExportDto {
    generated_at: DateTime<Utc>,
    user: PrivacyProfileDto,
    sessions: Vec<PrivacySessionDto>,
    submissions: Vec<PrivacySubmissionDto>,
    notifications: Vec<PrivacyNotificationExportDto>,
    certificates: Vec<PrivacyCertificateExportDto>,
    deletion_request: Option<AccountDeletionRequestDto>,
}

#[derive(Serialize, FromRow)]
struct PrivacyProfileDto {
    id: Uuid,
    tenant_id: Uuid,
    tenant_name: String,
    tenant_slug: String,
    email: String,
    name: String,
    role: String,
    class_id: Option<Uuid>,
    class_name: Option<String>,
    is_active: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
struct PrivacySessionDto {
    id: Uuid,
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, FromRow)]
struct PrivacySubmissionDto {
    id: Uuid,
    exam_id: Uuid,
    exam_title: String,
    status: String,
    score: Option<f64>,
    correct_count: i32,
    total_questions: i32,
    started_at: DateTime<Utc>,
    finished_at: Option<DateTime<Utc>>,
    deadline_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
struct PrivacyNotificationExportDto {
    id: Uuid,
    r#type: String,
    title: String,
    message: String,
    payload_jsonb: Value,
    is_read: bool,
    read_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
struct PrivacyCertificateExportDto {
    id: Uuid,
    submission_id: Uuid,
    exam_id: Uuid,
    exam_title: String,
    certificate_no: String,
    score: f64,
    issued_at: DateTime<Utc>,
    file_url: String,
    created_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
struct AccountDeletionRequestDto {
    id: Uuid,
    reason: Option<String>,
    status: String,
    notes: Option<String>,
    requested_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
    processed_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
struct CreateDeleteRequestBody {
    reason: Option<String>,
}

async fn export_my_data(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<PrivacyExportDto>> {
    ensure_privacy_schema_for_state(&state).await?;

    let user = sqlx::query_as::<_, PrivacyProfileDto>(
        "SELECT
            u.id,
            u.tenant_id,
            t.name AS tenant_name,
            t.slug AS tenant_slug,
            u.email,
            u.name,
            u.role,
            u.class_id,
            c.name AS class_name,
            u.is_active,
            u.created_at,
            u.updated_at
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN classes c ON c.id = u.class_id
         WHERE u.id = $1 AND u.tenant_id = $2",
    )
    .bind(auth.0.sub)
    .bind(auth.0.tenant_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load privacy profile",
        )
    })?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "User not found"))?;

    let sessions = sqlx::query_as::<_, PrivacySessionDto>(
        "SELECT id, created_at, expires_at, revoked_at
         FROM refresh_tokens
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY created_at DESC",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load privacy sessions",
        )
    })?;

    let submissions = sqlx::query_as::<_, PrivacySubmissionDto>(
        "SELECT
            s.id,
            s.exam_id,
            e.title AS exam_title,
            s.status,
            s.score::double precision AS score,
            s.correct_count,
            s.total_questions,
            s.started_at,
            s.finished_at,
            s.deadline_at,
            s.created_at,
            s.updated_at
         FROM submissions s
         JOIN exams e ON e.id = s.exam_id
         WHERE s.tenant_id = $1 AND s.student_id = $2
         ORDER BY s.created_at DESC",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load privacy submissions",
        )
    })?;

    let notifications = sqlx::query_as::<_, PrivacyNotificationExportDto>(
        "SELECT id, type, title, message, payload_jsonb, is_read, read_at, created_at
         FROM notifications
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY created_at DESC",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load privacy notifications",
        )
    })?;

    let certificates = sqlx::query_as::<_, PrivacyCertificateExportDto>(
        "SELECT
            c.id,
            c.submission_id,
            c.exam_id,
            e.title AS exam_title,
            c.certificate_no,
            c.score::double precision AS score,
            c.issued_at,
            c.file_url,
            c.created_at
         FROM certificates c
         JOIN exams e ON e.id = c.exam_id
         WHERE c.tenant_id = $1 AND c.student_id = $2
         ORDER BY c.issued_at DESC",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to load privacy certificates",
        )
    })?;

    let deletion_request = latest_delete_request(&state, &auth).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: PrivacyExportDto {
            generated_at: Utc::now(),
            user,
            sessions,
            submissions,
            notifications,
            certificates,
            deletion_request,
        },
    }))
}

async fn get_latest_delete_request(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<Option<AccountDeletionRequestDto>>> {
    ensure_privacy_schema_for_state(&state).await?;
    let data = latest_delete_request(&state, &auth).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn get_security_settings(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<SecuritySettingsDto>> {
    let data = load_security_settings(&state, &auth).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn patch_security_settings(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<UpdateSecuritySettingsRequest>,
) -> ApiResult<SuccessResponse<SecuritySettingsDto>> {
    let data = update_security_settings(&state, &auth, body).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

async fn create_delete_request(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<CreateDeleteRequestBody>,
) -> ApiResult<SuccessResponse<AccountDeletionRequestDto>> {
    ensure_privacy_schema_for_state(&state).await?;

    let reason = normalize_reason(body.reason)?;

    let existing = sqlx::query_as::<_, AccountDeletionRequestDto>(
        "SELECT id, reason, status, notes, requested_at, reviewed_at, processed_at, created_at, updated_at
         FROM account_deletion_requests
         WHERE tenant_id = $1 AND user_id = $2 AND status = 'pending'
         ORDER BY requested_at DESC
         LIMIT 1",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to load deletion request"))?;

    if let Some(request) = existing {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "DELETE_REQUEST_EXISTS",
            "Pending deletion request already exists",
        )
        .with_details(serde_json::json!({
            "request_id": request.id,
            "status": request.status,
        })));
    }

    let request = sqlx::query_as::<_, AccountDeletionRequestDto>(
        "INSERT INTO account_deletion_requests (
            tenant_id,
            user_id,
            requested_by,
            reason,
            status
         )
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, reason, status, notes, requested_at, reviewed_at, processed_at, created_at, updated_at",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .bind(auth.0.sub)
    .bind(reason)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to create deletion request"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: request,
    }))
}

async fn latest_delete_request(
    state: &SharedState,
    auth: &AuthUser,
) -> Result<Option<AccountDeletionRequestDto>, ApiError> {
    sqlx::query_as::<_, AccountDeletionRequestDto>(
        "SELECT id, reason, status, notes, requested_at, reviewed_at, processed_at, created_at, updated_at
         FROM account_deletion_requests
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY requested_at DESC
         LIMIT 1",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to load latest deletion request"))
}

fn normalize_reason(reason: Option<String>) -> Result<Option<String>, ApiError> {
    let trimmed = reason.map(|value| value.trim().to_string());
    let normalized = trimmed.filter(|value| !value.is_empty());

    if normalized.as_ref().is_some_and(|value| value.len() > 1000) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Deletion request reason must be 1000 characters or fewer",
        ));
    }

    Ok(normalized)
}
