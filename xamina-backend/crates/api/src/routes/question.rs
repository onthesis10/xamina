use std::{
    collections::BTreeMap,
    io::{Cursor, Read, Write},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use aws_credential_types::Credentials;
use aws_sdk_s3::{primitives::ByteStream, Client};
use axum::{
    extract::{Multipart, Path, Query, State},
    http::header,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use calamine::{Reader, Xlsx};
use quick_xml::{events::Event, Reader as XmlReader};
use rust_xlsxwriter::Workbook;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use tracing::warn;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

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
        .route("/questions/import/preview", post(preview_question_import))
        .route("/questions/import/commit", post(commit_question_import))
        .route(
            "/questions/import/template.xlsx",
            get(download_question_import_template),
        )
        .route(
            "/questions/import/template.docx",
            get(download_question_import_docx_template),
        )
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum QuestionImportFormat {
    Xlsx,
    Docx,
}

#[derive(Debug, Clone, Serialize)]
struct QuestionImportPreviewItem {
    row_no: usize,
    question: QuestionPayload,
}

#[derive(Debug, Clone, Serialize)]
struct QuestionImportError {
    row_no: usize,
    code: &'static str,
    message: String,
}

#[derive(Debug, Serialize)]
struct QuestionImportPreviewResult {
    format: QuestionImportFormat,
    total_rows: usize,
    valid_rows: usize,
    invalid_rows: usize,
    questions: Vec<QuestionImportPreviewItem>,
    errors: Vec<QuestionImportError>,
}

#[derive(Debug, Deserialize)]
struct QuestionImportCommitPayload {
    questions: Vec<QuestionPayload>,
}

#[derive(Debug, Serialize)]
struct QuestionImportCommitResult {
    inserted_count: usize,
    question_ids: Vec<Uuid>,
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

async fn preview_question_import(
    State(state): State<SharedState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> ApiResult<SuccessResponse<QuestionImportPreviewResult>> {
    ensure_teacher_or_admin(&auth)?;

    let (format, bytes) = read_single_import_file(&state, &mut multipart).await?;
    let result = parse_question_import(&bytes, format, state.import_max_rows)?;

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn commit_question_import(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<QuestionImportCommitPayload>,
) -> ApiResult<SuccessResponse<QuestionImportCommitResult>> {
    ensure_teacher_or_admin(&auth)?;

    if body.questions.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "questions cannot be empty",
        ));
    }
    if body.questions.len() > state.import_max_rows {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            format!(
                "Question import exceeds max rows ({})",
                state.import_max_rows
            ),
        ));
    }

    for payload in &body.questions {
        validate_question(payload)?;
    }

    let mut tx = state.pool.begin().await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to open import transaction",
        )
    })?;
    let mut question_ids = Vec::with_capacity(body.questions.len());

    for payload in body.questions {
        let row = sqlx::query_as::<_, QuestionDto>(
            "INSERT INTO questions
             (tenant_id, created_by, type, content, options_jsonb, answer_key, topic, difficulty, image_url, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id, tenant_id, created_by, type, content, options_jsonb, answer_key, topic, difficulty, image_url, is_active",
        )
        .bind(auth.0.tenant_id)
        .bind(auth.0.sub)
        .bind(payload.r#type)
        .bind(payload.content)
        .bind(payload.options_jsonb.unwrap_or_else(|| json!([])))
        .bind(payload.answer_key)
        .bind(payload.topic)
        .bind(payload.difficulty)
        .bind(payload.image_url)
        .bind(payload.is_active.unwrap_or(true))
        .fetch_one(&mut *tx)
        .await
        .map_err(|err| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "IMPORT_COMMIT_FAILED",
                "Failed to insert imported question",
            )
            .with_details(json!({ "db_error": err.to_string() }))
        })?;
        question_ids.push(row.id);
    }

    tx.commit().await.map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "Failed to commit import transaction",
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: QuestionImportCommitResult {
            inserted_count: question_ids.len(),
            question_ids,
        },
    }))
}

async fn download_question_import_template(auth: AuthUser) -> Result<impl IntoResponse, ApiError> {
    ensure_teacher_or_admin(&auth)?;

    let payload = render_question_import_template_xlsx()?;
    Ok((
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"xamina-question-import-template.xlsx\"",
            ),
        ],
        payload,
    ))
}

async fn download_question_import_docx_template(
    auth: AuthUser,
) -> Result<impl IntoResponse, ApiError> {
    ensure_teacher_or_admin(&auth)?;

    let payload = render_question_import_template_docx()?;
    Ok((
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"xamina-question-import-template.docx\"",
            ),
        ],
        payload,
    ))
}

async fn read_single_import_file(
    state: &SharedState,
    multipart: &mut Multipart,
) -> Result<(QuestionImportFormat, Vec<u8>), ApiError> {
    let mut file: Option<(QuestionImportFormat, Vec<u8>)> = None;

    while let Some(field) = multipart.next_field().await.map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "UPLOAD_FAILED",
            "Invalid multipart payload",
        )
    })? {
        if field.name() != Some("file") {
            continue;
        }
        if file.is_some() {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Only one import file is allowed",
            ));
        }
        let file_name = field.file_name().map(ToString::to_string).ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Import file name is required",
            )
        })?;
        let format = detect_import_format(&file_name)?;
        let bytes = field.bytes().await.map_err(|_| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "UPLOAD_FAILED",
                "Failed to read import file bytes",
            )
        })?;
        if bytes.len() > state.import_max_bytes {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                format!(
                    "Import file exceeds max size ({} bytes)",
                    state.import_max_bytes
                ),
            ));
        }
        file = Some((format, bytes.to_vec()));
    }

    file.ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Multipart field 'file' is required",
        )
    })
}

fn detect_import_format(file_name: &str) -> Result<QuestionImportFormat, ApiError> {
    let ext = file_name
        .split('.')
        .next_back()
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "xlsx" => Ok(QuestionImportFormat::Xlsx),
        "docx" => Ok(QuestionImportFormat::Docx),
        _ => Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Unsupported import file extension. Allowed: .xlsx, .docx",
        )),
    }
}

fn parse_question_import(
    bytes: &[u8],
    format: QuestionImportFormat,
    max_rows: usize,
) -> Result<QuestionImportPreviewResult, ApiError> {
    let (questions, errors, total_rows) = match format {
        QuestionImportFormat::Xlsx => parse_xlsx_import(bytes, max_rows)?,
        QuestionImportFormat::Docx => parse_docx_import(bytes, max_rows)?,
    };

    Ok(QuestionImportPreviewResult {
        format,
        total_rows,
        valid_rows: questions.len(),
        invalid_rows: errors.len(),
        questions,
        errors,
    })
}

fn parse_xlsx_import(
    bytes: &[u8],
    max_rows: usize,
) -> Result<
    (
        Vec<QuestionImportPreviewItem>,
        Vec<QuestionImportError>,
        usize,
    ),
    ApiError,
> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook = Xlsx::new(cursor).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Failed to read xlsx workbook",
        )
    })?;
    let sheet_name = workbook.sheet_names().first().cloned().ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "XLSX workbook does not contain any sheet",
        )
    })?;
    let range = workbook.worksheet_range(&sheet_name).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Failed to load xlsx worksheet",
        )
    })?;
    let mut rows = range.rows();
    let header_row = rows.next().ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "XLSX import requires a header row",
        )
    })?;
    let headers: Vec<String> = header_row
        .iter()
        .map(|cell| normalize_key(&cell.to_string()))
        .collect();

    let mut preview_items = Vec::new();
    let mut errors = Vec::new();
    let mut total_rows = 0usize;

    for (index, row) in rows.enumerate() {
        let row_no = index + 2;
        let values = row
            .iter()
            .map(|cell| cell.to_string().trim().to_string())
            .collect::<Vec<_>>();
        if values.iter().all(|value| value.is_empty()) {
            continue;
        }
        total_rows += 1;
        if total_rows > max_rows {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                format!("Question import exceeds max rows ({max_rows})"),
            ));
        }

        match question_payload_from_headers(&headers, &values) {
            Ok(question) => match validate_question(&question) {
                Ok(()) => preview_items.push(QuestionImportPreviewItem { row_no, question }),
                Err(err) => errors.push(QuestionImportError {
                    row_no,
                    code: err.code,
                    message: err.message,
                }),
            },
            Err(error) => errors.push(QuestionImportError {
                row_no,
                code: error.code,
                message: error.message,
            }),
        }
    }

    Ok((preview_items, errors, total_rows))
}

fn parse_docx_import(
    bytes: &[u8],
    max_rows: usize,
) -> Result<
    (
        Vec<QuestionImportPreviewItem>,
        Vec<QuestionImportError>,
        usize,
    ),
    ApiError,
> {
    let paragraphs = extract_docx_paragraphs(bytes)?;
    let mut blocks = Vec::new();
    let mut current = Vec::new();

    for paragraph in paragraphs {
        let trimmed = paragraph.trim().to_string();
        if trimmed.is_empty() {
            if !current.is_empty() {
                blocks.push(current);
                current = Vec::new();
            }
            continue;
        }
        current.push(trimmed);
    }
    if !current.is_empty() {
        blocks.push(current);
    }

    if blocks.len() > max_rows {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            format!("Question import exceeds max rows ({max_rows})"),
        ));
    }

    let mut preview_items = Vec::new();
    let mut errors = Vec::new();

    for (index, block) in blocks.iter().enumerate() {
        let row_no = index + 1;
        match question_payload_from_docx_block(block) {
            Ok(question) => match validate_question(&question) {
                Ok(()) => preview_items.push(QuestionImportPreviewItem { row_no, question }),
                Err(err) => errors.push(QuestionImportError {
                    row_no,
                    code: err.code,
                    message: err.message,
                }),
            },
            Err(error) => errors.push(QuestionImportError {
                row_no,
                code: error.code,
                message: error.message,
            }),
        }
    }

    Ok((preview_items, errors, blocks.len()))
}

fn question_payload_from_headers(
    headers: &[String],
    row: &[String],
) -> Result<QuestionPayload, ApiError> {
    let mut mapping = BTreeMap::new();
    for (index, header) in headers.iter().enumerate() {
        mapping.insert(
            header.clone(),
            row.get(index).map(String::as_str).unwrap_or_default(),
        );
    }
    question_payload_from_mapping(&mapping)
}

fn question_payload_from_docx_block(lines: &[String]) -> Result<QuestionPayload, ApiError> {
    let mut mapping = BTreeMap::new();
    for line in lines {
        let Some((raw_key, raw_value)) = line.split_once(':') else {
            if normalize_key(line).starts_with("question")
                || normalize_key(line).starts_with("soal")
            {
                continue;
            }
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                format!("Invalid DOCX template line: {line}"),
            ));
        };
        mapping.insert(normalize_key(raw_key), raw_value.trim());
    }
    question_payload_from_mapping(&mapping)
}

fn question_payload_from_mapping(
    mapping: &BTreeMap<String, &str>,
) -> Result<QuestionPayload, ApiError> {
    let question_type = required_field(mapping, "type")?;
    let content = required_field(mapping, "content")?.to_string();
    let topic = optional_field(mapping, "topic");
    let difficulty = optional_field(mapping, "difficulty");
    let image_url = optional_field(mapping, "image_url");
    let is_active = optional_field(mapping, "is_active")
        .as_deref()
        .map(parse_bool)
        .transpose()?
        .or(Some(true));

    let payload = match question_type {
        "multiple_choice" => {
            let mut options = Vec::new();
            for (key, value) in mapping {
                if let Some(option_id) = key.strip_prefix("option_") {
                    if !value.trim().is_empty() {
                        options.push(json!({
                            "id": option_id.to_ascii_uppercase(),
                            "label": value.trim(),
                        }));
                    }
                }
            }
            options.sort_by(|left, right| {
                left["id"]
                    .as_str()
                    .unwrap_or_default()
                    .cmp(right["id"].as_str().unwrap_or_default())
            });
            QuestionPayload {
                r#type: question_type.to_string(),
                content,
                options_jsonb: Some(serde_json::Value::Array(options)),
                answer_key: serde_json::Value::String(
                    required_field(mapping, "answer_key")?.to_ascii_uppercase(),
                ),
                topic,
                difficulty,
                image_url,
                is_active,
            }
        }
        "true_false" => QuestionPayload {
            r#type: question_type.to_string(),
            content,
            options_jsonb: Some(json!([{ "value": true }, { "value": false }])),
            answer_key: serde_json::Value::Bool(parse_bool(required_field(
                mapping,
                "answer_key",
            )?)?),
            topic,
            difficulty,
            image_url,
            is_active,
        },
        "short_answer" => {
            let answer = required_field(mapping, "answer_key")?;
            let parsed_answer = if answer.contains('|') {
                serde_json::Value::Array(
                    answer
                        .split('|')
                        .map(|item| serde_json::Value::String(item.trim().to_string()))
                        .collect(),
                )
            } else {
                serde_json::Value::String(answer.to_string())
            };
            QuestionPayload {
                r#type: question_type.to_string(),
                content,
                options_jsonb: Some(json!([])),
                answer_key: parsed_answer,
                topic,
                difficulty,
                image_url,
                is_active,
            }
        }
        _ => {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "Invalid question type",
            ))
        }
    };

    Ok(payload)
}

fn required_field<'a>(
    mapping: &'a BTreeMap<String, &'a str>,
    key: &str,
) -> Result<&'a str, ApiError> {
    mapping
        .get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                format!("Missing required field: {key}"),
            )
        })
}

fn optional_field(mapping: &BTreeMap<String, &str>, key: &str) -> Option<String> {
    mapping
        .get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn parse_bool(value: &str) -> Result<bool, ApiError> {
    if value.eq_ignore_ascii_case("true") || value == "1" || value.eq_ignore_ascii_case("yes") {
        return Ok(true);
    }
    if value.eq_ignore_ascii_case("false") || value == "0" || value.eq_ignore_ascii_case("no") {
        return Ok(false);
    }
    Err(ApiError::new(
        StatusCode::BAD_REQUEST,
        "VALIDATION_ERROR",
        format!("Invalid boolean value: {value}"),
    ))
}

fn normalize_key(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace([' ', '-'], "_")
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn extract_docx_paragraphs(bytes: &[u8]) -> Result<Vec<String>, ApiError> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Failed to open docx archive",
        )
    })?;
    let mut file = archive.by_name("word/document.xml").map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "DOCX template is missing word/document.xml",
        )
    })?;
    let mut xml = String::new();
    file.read_to_string(&mut xml).map_err(|_| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "Failed to read docx document payload",
        )
    })?;

    let mut reader = XmlReader::from_str(&xml);
    reader.config_mut().trim_text(false);
    let mut paragraphs = Vec::new();
    let mut current = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Text(event)) => {
                let text = event.unescape().map_err(|_| {
                    ApiError::new(
                        StatusCode::BAD_REQUEST,
                        "VALIDATION_ERROR",
                        "Failed to decode docx text content",
                    )
                })?;
                current.push_str(&text);
            }
            Ok(Event::End(event)) if event.name().as_ref() == b"w:p" => {
                paragraphs.push(current.trim().to_string());
                current.clear();
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(_) => {
                return Err(ApiError::new(
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    "Failed to parse docx xml content",
                ))
            }
        }
    }

    Ok(paragraphs)
}

fn render_question_import_template_xlsx() -> Result<Vec<u8>, ApiError> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    let headers = [
        "type",
        "content",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "answer_key",
        "topic",
        "difficulty",
        "is_active",
        "image_url",
    ];
    for (index, header_value) in headers.iter().enumerate() {
        sheet
            .write_string(0, index as u16, *header_value)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "TEMPLATE_FAILED",
                    "Failed to write import template header",
                )
            })?;
    }
    let sample_rows = [
        [
            "multiple_choice",
            "Ibu kota Indonesia adalah?",
            "Jakarta",
            "Bandung",
            "Surabaya",
            "Medan",
            "A",
            "Geografi",
            "easy",
            "true",
            "",
        ],
        [
            "true_false",
            "2 + 2 = 4",
            "",
            "",
            "",
            "",
            "true",
            "Matematika",
            "easy",
            "true",
            "",
        ],
        [
            "short_answer",
            "Sebutkan bilangan prima terkecil",
            "",
            "",
            "",
            "",
            "2",
            "Matematika",
            "medium",
            "true",
            "",
        ],
    ];
    for (row_index, row) in sample_rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            sheet
                .write_string((row_index + 1) as u32, column_index as u16, *value)
                .map_err(|_| {
                    ApiError::new(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "TEMPLATE_FAILED",
                        "Failed to write import template sample row",
                    )
                })?;
        }
    }

    workbook.save_to_buffer().map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TEMPLATE_FAILED",
            "Failed to build xlsx import template",
        )
    })
}

fn render_question_import_template_docx() -> Result<Vec<u8>, ApiError> {
    let body_text = [
        "Question 1",
        "Type: multiple_choice",
        "Content: Ibu kota Indonesia adalah?",
        "Option_A: Jakarta",
        "Option_B: Bandung",
        "Option_C: Surabaya",
        "Option_D: Medan",
        "Answer_Key: A",
        "Topic: Geografi",
        "Difficulty: easy",
        "Is_Active: true",
        "",
        "Question 2",
        "Type: true_false",
        "Content: 2 + 2 = 4",
        "Answer_Key: true",
        "Topic: Matematika",
        "Difficulty: easy",
        "Is_Active: true",
        "",
        "Question 3",
        "Type: short_answer",
        "Content: Sebutkan bilangan prima terkecil",
        "Answer_Key: 2",
        "Topic: Matematika",
        "Difficulty: medium",
        "Is_Active: true",
    ];
    let paragraphs = body_text
        .iter()
        .map(|line| {
            format!(
                "<w:p><w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
                xml_escape(line)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let document_xml = format!(
        "{}{}{}{}",
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
        format!("<w:body>{paragraphs}</w:body>"),
        "</w:document>"
    );

    let cursor = Cursor::new(Vec::<u8>::new());
    let mut writer = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default();

    writer
        .start_file("[Content_Types].xml", options)
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "TEMPLATE_FAILED",
                "Failed to initialize docx content types",
            )
        })?;
    writer
        .write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
        )
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "TEMPLATE_FAILED",
                "Failed to write docx content types",
            )
        })?;

    writer.add_directory("_rels/", options).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TEMPLATE_FAILED",
            "Failed to create docx rels directory",
        )
    })?;
    writer.start_file("_rels/.rels", options).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TEMPLATE_FAILED",
            "Failed to create docx rels file",
        )
    })?;
    writer
        .write_all(
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#,
        )
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "TEMPLATE_FAILED",
                "Failed to write docx rels file",
            )
        })?;

    writer.add_directory("word/", options).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TEMPLATE_FAILED",
            "Failed to create docx word directory",
        )
    })?;
    writer
        .start_file("word/document.xml", options)
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "TEMPLATE_FAILED",
                "Failed to create docx document file",
            )
        })?;
    writer.write_all(document_xml.as_bytes()).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TEMPLATE_FAILED",
            "Failed to write docx template body",
        )
    })?;

    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "TEMPLATE_FAILED",
                "Failed to build docx import template",
            )
        })
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
