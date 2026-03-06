use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};
use xamina_core::domain::user::dto::{
    CreateUserPayload, CsvImportResult, ListUsersQuery, PageMeta, UpdateUserPayload, UserDto,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/import-csv", post(import_users_csv))
        .route("/users/import-csv-file", post(import_users_csv_file))
        .route(
            "/users/:id",
            get(get_user).patch(update_user).delete(delete_user),
        )
}

const DEFAULT_MAX_CSV_UPLOAD_BYTES: usize = 2 * 1024 * 1024;

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

async fn list_users(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListUsersQuery>,
) -> ApiResult<SuccessWithMeta<Vec<UserDto>, PageMeta>> {
    ensure_admin(&auth)?;

    let result = state
        .services
        .user
        .list_users(auth.0.tenant_id, query)
        .await?;
    Ok(Json(SuccessWithMeta {
        success: true,
        data: result.rows,
        meta: result.meta,
    }))
}

async fn create_user(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<CreateUserPayload>,
) -> ApiResult<SuccessResponse<UserDto>> {
    ensure_admin(&auth)?;
    let user = state
        .services
        .user
        .create_user(auth.0.tenant_id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: user,
    }))
}

async fn get_user(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<UserDto>> {
    ensure_admin(&auth)?;
    let user = state.services.user.get_user(auth.0.tenant_id, id).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: user,
    }))
}

async fn update_user(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateUserPayload>,
) -> ApiResult<SuccessResponse<UserDto>> {
    ensure_admin(&auth)?;
    let user = state
        .services
        .user
        .update_user(auth.0.tenant_id, id, body)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: user,
    }))
}

async fn delete_user(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_admin(&auth)?;

    state
        .services
        .user
        .delete_user(auth.0.tenant_id, id)
        .await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: json!({ "id": id }),
    }))
}

async fn import_users_csv(
    State(state): State<SharedState>,
    auth: AuthUser,
    body: String,
) -> ApiResult<SuccessResponse<CsvImportResult>> {
    ensure_admin(&auth)?;
    let result = state
        .services
        .user
        .import_users_csv(auth.0.tenant_id, &body)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn import_users_csv_file(
    State(state): State<SharedState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> ApiResult<SuccessResponse<CsvImportResult>> {
    ensure_admin(&auth)?;

    let mut csv_text: Option<String> = None;
    while let Some(field) = multipart.next_field().await.map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "UPLOAD_FAILED",
            "Invalid multipart payload",
        )
    })? {
        if csv_text.is_some() {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Only one CSV file is allowed",
            ));
        }

        let content_type = field
            .content_type()
            .map(|value| {
                value
                    .split(';')
                    .next()
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase()
            })
            .unwrap_or_default();
        let allowed = content_type.is_empty()
            || content_type == "text/csv"
            || content_type == "text/plain"
            || content_type == "application/vnd.ms-excel";
        if !allowed {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Unsupported CSV content type",
            ));
        }

        let bytes = field.bytes().await.map_err(|_| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "UPLOAD_FAILED",
                "Failed to read CSV file",
            )
        })?;
        if bytes.len() > DEFAULT_MAX_CSV_UPLOAD_BYTES {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                format!(
                    "CSV file exceeds max size ({} bytes)",
                    DEFAULT_MAX_CSV_UPLOAD_BYTES
                ),
            ));
        }

        let parsed = String::from_utf8(bytes.to_vec()).map_err(|_| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "CSV file must be valid UTF-8 text",
            )
        })?;
        csv_text = Some(parsed);
    }

    let body = csv_text.ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Multipart CSV file field is required",
        )
    })?;

    let result = state
        .services
        .user
        .import_users_csv(auth.0.tenant_id, &body)
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}
