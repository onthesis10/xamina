use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use aws_credential_types::Credentials;
use aws_sdk_s3::{primitives::ByteStream, Client};
use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use tracing::warn;
use uuid::Uuid;

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};

const DEFAULT_MAX_UPLOAD_BYTES: usize = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UploadMode {
    Local,
    S3,
}

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/questions", get(list_questions).post(create_question))
        .route("/questions/bulk-delete", post(bulk_delete_questions))
        .route(
            "/questions/:id",
            get(get_question)
                .patch(update_question)
                .delete(delete_question),
        )
        .route("/uploads/question-image", post(upload_question_image))
}

#[derive(Debug, Deserialize)]
struct ListQuestionsQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
    topic: Option<String>,
    difficulty: Option<String>,
    r#type: Option<String>,
}

#[derive(Debug, Serialize)]
struct PageMeta {
    page: i64,
    page_size: i64,
    total: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct QuestionDto {
    id: Uuid,
    tenant_id: Uuid,
    created_by: Uuid,
    r#type: String,
    content: String,
    options_jsonb: serde_json::Value,
    answer_key: serde_json::Value,
    topic: Option<String>,
    difficulty: Option<String>,
    image_url: Option<String>,
    is_active: bool,
}

#[derive(Debug, Deserialize)]
struct QuestionPayload {
    r#type: String,
    content: String,
    options_jsonb: Option<serde_json::Value>,
    answer_key: serde_json::Value,
    topic: Option<String>,
    difficulty: Option<String>,
    image_url: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct BulkDeletePayload {
    ids: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
struct BulkDeleteResult {
    deleted_count: u64,
}

#[derive(Debug, Serialize)]
struct UploadImageResult {
    image_url: String,
}

fn ensure_teacher_or_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "admin" && auth.0.role != "guru" && auth.0.role != "super_admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Admin, guru, or super_admin role required",
        ));
    }
    Ok(())
}

fn validate_question(payload: &QuestionPayload) -> Result<(), ApiError> {
    if payload.content.trim().is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Question content is required",
        ));
    }

    match payload.r#type.as_str() {
        "multiple_choice" => {
            let options = payload.options_jsonb.clone().unwrap_or_else(|| json!([]));
            let arr = options.as_array().ok_or_else(|| {
                ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "options_jsonb must be an array",
                )
            })?;
            if arr.len() < 2 {
                return Err(ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Multiple choice requires at least 2 options",
                ));
            }
            if !payload.answer_key.is_string() {
                return Err(ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Multiple choice answer_key must be string",
                ));
            }
        }
        "true_false" => {
            if !payload.answer_key.is_boolean() {
                return Err(ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "True/false answer_key must be boolean",
                ));
            }
        }
        "short_answer" => {
            let ok = payload.answer_key.is_string() || payload.answer_key.is_array();
            if !ok {
                return Err(ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Short answer answer_key must be string or array",
                ));
            }
        }
        _ => {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Invalid question type",
            ));
        }
    }

    Ok(())
}

async fn list_questions(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListQuestionsQuery>,
) -> ApiResult<SuccessWithMeta<Vec<QuestionDto>, PageMeta>> {
    ensure_teacher_or_admin(&auth)?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)
         FROM questions
         WHERE tenant_id = $1
           AND ($2::text IS NULL OR content ILIKE '%' || $2 || '%')
           AND ($3::text IS NULL OR topic = $3)
           AND ($4::text IS NULL OR difficulty = $4)
           AND ($5::text IS NULL OR type = $5)",
    )
    .bind(auth.0.tenant_id)
    .bind(query.search.clone())
    .bind(query.topic.clone())
    .bind(query.difficulty.clone())
    .bind(query.r#type.clone())
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to count questions",
        )
    })?;

    let rows = sqlx::query_as::<_, QuestionDto>(
        "SELECT id, tenant_id, created_by, type, content, options_jsonb, answer_key, topic, difficulty, image_url, is_active
         FROM questions
         WHERE tenant_id = $1
           AND ($2::text IS NULL OR content ILIKE '%' || $2 || '%')
           AND ($3::text IS NULL OR topic = $3)
           AND ($4::text IS NULL OR difficulty = $4)
           AND ($5::text IS NULL OR type = $5)
         ORDER BY created_at DESC
         LIMIT $6 OFFSET $7",
    )
    .bind(auth.0.tenant_id)
    .bind(query.search)
    .bind(query.topic)
    .bind(query.difficulty)
    .bind(query.r#type)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to list questions"))?;

    Ok(Json(SuccessWithMeta {
        success: true,
        data: rows,
        meta: PageMeta {
            page,
            page_size,
            total,
        },
    }))
}

async fn create_question(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<QuestionPayload>,
) -> ApiResult<SuccessResponse<QuestionDto>> {
    ensure_teacher_or_admin(&auth)?;
    validate_question(&body)?;

    let row = sqlx::query_as::<_, QuestionDto>(
        "INSERT INTO questions
         (tenant_id, created_by, type, content, options_jsonb, answer_key, topic, difficulty, image_url, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, tenant_id, created_by, type, content, options_jsonb, answer_key, topic, difficulty, image_url, is_active",
    )
    .bind(auth.0.tenant_id)
    .bind(auth.0.sub)
    .bind(body.r#type)
    .bind(body.content)
    .bind(body.options_jsonb.unwrap_or_else(|| json!([])))
    .bind(body.answer_key)
    .bind(body.topic)
    .bind(body.difficulty)
    .bind(body.image_url)
    .bind(body.is_active.unwrap_or(true))
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        ApiError::new(StatusCode::BAD_REQUEST, "CREATE_QUESTION_FAILED", "Failed to create question")
            .with_details(json!({"db_error": e.to_string()}))
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn get_question(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<QuestionDto>> {
    ensure_teacher_or_admin(&auth)?;

    let row = sqlx::query_as::<_, QuestionDto>(
        "SELECT id, tenant_id, created_by, type, content, options_jsonb, answer_key, topic, difficulty, image_url, is_active
         FROM questions WHERE id = $1 AND tenant_id = $2",
    )
    .bind(id)
    .bind(auth.0.tenant_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "Failed to load question"))?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Question not found"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn update_question(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<QuestionPayload>,
) -> ApiResult<SuccessResponse<QuestionDto>> {
    ensure_teacher_or_admin(&auth)?;
    validate_question(&body)?;

    let row = sqlx::query_as::<_, QuestionDto>(
        "UPDATE questions
         SET type = $1, content = $2, options_jsonb = $3, answer_key = $4, topic = $5, difficulty = $6, image_url = $7, is_active = $8, updated_at = NOW()
         WHERE id = $9 AND tenant_id = $10
         RETURNING id, tenant_id, created_by, type, content, options_jsonb, answer_key, topic, difficulty, image_url, is_active",
    )
    .bind(body.r#type)
    .bind(body.content)
    .bind(body.options_jsonb.unwrap_or_else(|| json!([])))
    .bind(body.answer_key)
    .bind(body.topic)
    .bind(body.difficulty)
    .bind(body.image_url)
    .bind(body.is_active.unwrap_or(true))
    .bind(id)
    .bind(auth.0.tenant_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        ApiError::new(StatusCode::BAD_REQUEST, "UPDATE_QUESTION_FAILED", "Failed to update question")
            .with_details(json!({"db_error": e.to_string()}))
    })?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Question not found"))?;

    Ok(Json(SuccessResponse {
        success: true,
        data: row,
    }))
}

async fn delete_question(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<SuccessResponse<serde_json::Value>> {
    ensure_teacher_or_admin(&auth)?;
    sqlx::query("DELETE FROM questions WHERE id = $1 AND tenant_id = $2")
        .bind(id)
        .bind(auth.0.tenant_id)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed to delete question",
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: json!({"id": id}),
    }))
}

async fn bulk_delete_questions(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<BulkDeletePayload>,
) -> ApiResult<SuccessResponse<BulkDeleteResult>> {
    ensure_teacher_or_admin(&auth)?;
    if body.ids.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "ids cannot be empty",
        ));
    }

    let result = sqlx::query("DELETE FROM questions WHERE tenant_id = $1 AND id = ANY($2)")
        .bind(auth.0.tenant_id)
        .bind(&body.ids)
        .execute(&state.pool)
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "Failed bulk delete questions",
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: BulkDeleteResult {
            deleted_count: result.rows_affected(),
        },
    }))
}

async fn upload_question_image(
    auth: AuthUser,
    mut multipart: Multipart,
) -> ApiResult<SuccessResponse<UploadImageResult>> {
    ensure_teacher_or_admin(&auth)?;
    let max_bytes = upload_max_bytes();

    let mut saved_url: Option<String> = None;
    while let Some(field) = multipart.next_field().await.map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "UPLOAD_FAILED",
            "Invalid multipart payload",
        )
    })? {
        if saved_url.is_some() {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Only one file is allowed per request",
            ));
        }

        let file_name = field.file_name().map(ToString::to_string).ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "File name is required",
            )
        })?;
        let content_type = normalize_content_type(field.content_type().unwrap_or_default());

        let ext = file_name
            .split('.')
            .next_back()
            .filter(|s| !s.is_empty())
            .map(|v| v.to_ascii_lowercase())
            .unwrap_or_else(|| "bin".to_string());

        if !is_allowed_extension(&ext) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Unsupported file extension. Allowed: jpg, jpeg, png, webp, gif",
            ));
        }

        if !content_type.is_empty() && !is_allowed_mime(&content_type) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Unsupported image content type",
            ));
        }

        let bytes = field.bytes().await.map_err(|_| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "UPLOAD_FAILED",
                "Failed to read upload bytes",
            )
        })?;
        if bytes.len() > max_bytes {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                format!("Image exceeds max size ({} bytes)", max_bytes),
            ));
        }

        let detected_mime = detect_magic_mime(&bytes).ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Unsupported or invalid image signature",
            )
        })?;

        if !extension_matches_mime(&ext, detected_mime) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "File extension does not match image signature",
            ));
        }

        if !content_type.is_empty() && !mime_matches(content_type.as_str(), detected_mime) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Content type does not match image signature",
            ));
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let file_name = format!("qimg-{}-{}.{}", timestamp, Uuid::new_v4(), ext);
        let tenant_folder = auth.0.tenant_id.to_string();
        let key = format!("{tenant_folder}/{file_name}");

        let image_url = match upload_mode() {
            UploadMode::Local => save_to_local(&tenant_folder, &file_name, &bytes).await?,
            UploadMode::S3 => save_to_s3(&key, detected_mime, &bytes).await?,
        };
        saved_url = Some(image_url);
    }

    let image_url = saved_url.ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "UPLOAD_FAILED",
            "No file field found in multipart request",
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: UploadImageResult { image_url },
    }))
}

fn upload_mode() -> UploadMode {
    let mode = std::env::var("UPLOAD_MODE").unwrap_or_else(|_| "local".to_string());
    if mode.eq_ignore_ascii_case("s3") {
        UploadMode::S3
    } else {
        UploadMode::Local
    }
}

async fn save_to_local(
    tenant_folder: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<String, ApiError> {
    let dir: PathBuf = ["uploads", "question-images", tenant_folder]
        .iter()
        .collect();
    tokio::fs::create_dir_all(&dir).await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "UPLOAD_FAILED",
            "Failed to create upload directory",
        )
    })?;
    let path = dir.join(file_name);
    tokio::fs::write(&path, bytes).await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "UPLOAD_FAILED",
            "Failed to write upload file",
        )
    })?;

    let base =
        std::env::var("UPLOAD_BASE_URL").unwrap_or_else(|_| "/uploads/question-images".to_string());
    Ok(format!(
        "{}/{}/{}",
        base.trim_end_matches('/'),
        tenant_folder,
        file_name
    ))
}

async fn save_to_s3(key: &str, detected_mime: &str, bytes: &[u8]) -> Result<String, ApiError> {
    let endpoint = std::env::var("S3_ENDPOINT").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "UPLOAD_FAILED",
            "S3_ENDPOINT is required for s3 upload mode",
        )
    })?;
    let bucket = std::env::var("S3_BUCKET").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "UPLOAD_FAILED",
            "S3_BUCKET is required for s3 upload mode",
        )
    })?;
    let access_key = std::env::var("S3_ACCESS_KEY").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "UPLOAD_FAILED",
            "S3_ACCESS_KEY is required for s3 upload mode",
        )
    })?;
    let secret_key = std::env::var("S3_SECRET_KEY").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "UPLOAD_FAILED",
            "S3_SECRET_KEY is required for s3 upload mode",
        )
    })?;
    let region = std::env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string());

    let credentials = Credentials::new(access_key, secret_key, None, None, "xamina-upload");
    let conf = aws_sdk_s3::config::Builder::new()
        .endpoint_url(endpoint.trim_end_matches('/'))
        .region(aws_sdk_s3::config::Region::new(region))
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();

    let client = Client::from_conf(conf);
    client
        .put_object()
        .bucket(&bucket)
        .key(key)
        .body(ByteStream::from(bytes.to_vec()))
        .content_type(detected_mime)
        .send()
        .await
        .map_err(|err| {
            warn!(code = "S3_UPLOAD_FAILED", error = %err, "Question image upload to s3 failed");
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "UPLOAD_FAILED",
                "Failed to upload image to s3",
            )
        })?;

    let public_base = std::env::var("S3_PUBLIC_BASE_URL")
        .unwrap_or_else(|_| format!("{}/{}", endpoint.trim_end_matches('/'), bucket));
    Ok(format!("{}/{}", public_base.trim_end_matches('/'), key))
}

fn upload_max_bytes() -> usize {
    let env_value = std::env::var("UPLOAD_MAX_BYTES").ok();
    parse_upload_max_bytes(env_value.as_deref())
}

fn parse_upload_max_bytes(value: Option<&str>) -> usize {
    value
        .and_then(|raw| raw.parse::<usize>().ok())
        .filter(|bytes| *bytes > 0)
        .unwrap_or(DEFAULT_MAX_UPLOAD_BYTES)
}

fn normalize_content_type(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .map(|raw| raw.trim().to_ascii_lowercase())
        .unwrap_or_default()
}

fn is_allowed_mime(content_type: &str) -> bool {
    ALLOWED_MIME_TYPES.contains(&content_type)
}

fn is_allowed_extension(ext: &str) -> bool {
    ALLOWED_EXTENSIONS.contains(&ext)
}

fn detect_magic_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return Some("image/jpeg");
    }
    if bytes.len() >= 8
        && bytes[0] == 0x89
        && bytes[1] == 0x50
        && bytes[2] == 0x4E
        && bytes[3] == 0x47
        && bytes[4] == 0x0D
        && bytes[5] == 0x0A
        && bytes[6] == 0x1A
        && bytes[7] == 0x0A
    {
        return Some("image/png");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.len() >= 6 && (&bytes[0..6] == b"GIF87a" || &bytes[0..6] == b"GIF89a") {
        return Some("image/gif");
    }
    None
}

fn extension_matches_mime(ext: &str, mime: &str) -> bool {
    match mime {
        "image/jpeg" => ext == "jpg" || ext == "jpeg",
        "image/png" => ext == "png",
        "image/webp" => ext == "webp",
        "image/gif" => ext == "gif",
        _ => false,
    }
}

fn mime_matches(content_type: &str, detected_mime: &str) -> bool {
    content_type == detected_mime
}

#[cfg(test)]
mod tests {
    use super::{
        detect_magic_mime, extension_matches_mime, mime_matches, normalize_content_type,
        parse_upload_max_bytes, DEFAULT_MAX_UPLOAD_BYTES,
    };

    #[test]
    fn parse_upload_max_bytes_should_use_default_for_invalid_values() {
        assert_eq!(parse_upload_max_bytes(None), DEFAULT_MAX_UPLOAD_BYTES);
        assert_eq!(parse_upload_max_bytes(Some("0")), DEFAULT_MAX_UPLOAD_BYTES);
        assert_eq!(parse_upload_max_bytes(Some("-1")), DEFAULT_MAX_UPLOAD_BYTES);
        assert_eq!(
            parse_upload_max_bytes(Some("abc")),
            DEFAULT_MAX_UPLOAD_BYTES
        );
    }

    #[test]
    fn parse_upload_max_bytes_should_accept_positive_integer() {
        assert_eq!(parse_upload_max_bytes(Some("5242880")), 5_242_880);
    }

    #[test]
    fn detect_magic_mime_should_detect_supported_formats() {
        assert_eq!(
            detect_magic_mime(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some("image/jpeg")
        );
        assert_eq!(
            detect_magic_mime(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
            Some("image/png")
        );
        assert_eq!(
            detect_magic_mime(&[
                0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
            ]),
            Some("image/webp")
        );
        assert_eq!(detect_magic_mime(b"GIF89ahello"), Some("image/gif"));
    }

    #[test]
    fn detect_magic_mime_should_reject_unknown_bytes() {
        assert_eq!(detect_magic_mime(b"not-an-image"), None);
    }

    #[test]
    fn extension_matches_mime_should_validate_pairs() {
        assert!(extension_matches_mime("jpg", "image/jpeg"));
        assert!(extension_matches_mime("jpeg", "image/jpeg"));
        assert!(extension_matches_mime("png", "image/png"));
        assert!(extension_matches_mime("webp", "image/webp"));
        assert!(extension_matches_mime("gif", "image/gif"));
        assert!(!extension_matches_mime("png", "image/jpeg"));
    }

    #[test]
    fn normalize_content_type_should_strip_parameters() {
        assert_eq!(
            normalize_content_type("image/png; charset=binary"),
            "image/png".to_string()
        );
        assert_eq!(
            normalize_content_type(" IMAGE/JPEG "),
            "image/jpeg".to_string()
        );
    }

    #[test]
    fn mime_matches_should_require_exact_match() {
        assert!(mime_matches("image/png", "image/png"));
        assert!(!mime_matches("image/png", "image/jpeg"));
    }
}
