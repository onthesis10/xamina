use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/classes", get(list_classes).post(create_class))
        .route("/classes/:id", patch(update_class).delete(delete_class))
}

#[derive(Debug, Serialize, FromRow)]
pub struct ClassDto {
    id: Uuid,
    tenant_id: Uuid,
    name: String,
    grade: Option<String>,
    major: Option<String>,
    is_active: bool,
}

#[derive(Debug, Deserialize)]
struct CreateClassRequest {
    name: String,
    grade: Option<String>,
    major: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateClassRequest {
    name: Option<String>,
    grade: Option<String>,
    major: Option<String>,
    is_active: Option<bool>,
}

fn ensure_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "admin" && auth.0.role != "super_admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Admin or super_admin role required",
        ));
    }
    Ok(())
}

async fn list_classes(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<Vec<ClassDto>>> {
    let rows = sqlx::query_as::<_, ClassDto>(
        "SELECT id, tenant_id, name, grade, major, is_active
         FROM classes WHERE tenant_id = $1 ORDER BY created_at DESC",
    )
    .bind(auth.0.tenant_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to list classes",
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: rows,
    }))
}

async fn create_class(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<CreateClassRequest>,
) -> ApiResult<SuccessResponse<ClassDto>> {
    ensure_admin(&auth)?;

    let row = sqlx::query_as::<_, ClassDto>(
        "INSERT INTO classes (tenant_id, name, grade, major)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, name, grade, major, is_active",
    )
    .bind(auth.0.tenant_id)
    .bind(body.name)
    .bind(body.grade)
    .bind(body.major)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "CREATE_CLASS_FAILED",
            "Failed to create class",
        )
        .with_details(json!({ "db_error": e.to_string() }))
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn update_class(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateClassRequest>,
) -> ApiResult<SuccessResponse<ClassDto>> {
    ensure_admin(&auth)?;

    let existing = sqlx::query_as::<_, ClassDto>(
        "SELECT id, tenant_id, name, grade, major, is_active FROM classes WHERE id = $1 AND tenant_id = $2",
    )
    .bind(id)
    .bind(auth.0.tenant_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to load class"))?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Class not found"))?;

    let next_is_active = body.is_active.unwrap_or(existing.is_active);
    if !next_is_active {
        let active_users = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND class_id = $2 AND is_active = TRUE",
        )
        .bind(auth.0.tenant_id)
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to validate class usage"))?;
        if active_users > 0 {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "CLASS_IN_USE",
                "Cannot deactivate class that is still assigned to active users",
            ));
        }
    }

    let updated = sqlx::query_as::<_, ClassDto>(
        "UPDATE classes SET name = $1, grade = $2, major = $3, is_active = $4
         WHERE id = $5 AND tenant_id = $6
         RETURNING id, tenant_id, name, grade, major, is_active",
    )
    .bind(body.name.unwrap_or(existing.name))
    .bind(body.grade.or(existing.grade))
    .bind(body.major.or(existing.major))
    .bind(next_is_active)
    .bind(id)
    .bind(auth.0.tenant_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "UPDATE_CLASS_FAILED",
            "Failed to update class",
        )
        .with_details(json!({ "db_error": e.to_string() }))
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: updated,
    }))
}

async fn delete_class(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_admin(&auth)?;

    let assigned_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND class_id = $2",
    )
    .bind(auth.0.tenant_id)
    .bind(id)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to validate class usage",
        )
    })?;
    if assigned_users > 0 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "CLASS_IN_USE",
            "Cannot delete class that is still assigned to users",
        ));
    }

    sqlx::query("DELETE FROM classes WHERE id = $1 AND tenant_id = $2")
        .bind(id)
        .bind(auth.0.tenant_id)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed to delete class",
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "id": id }),
    }))
}
