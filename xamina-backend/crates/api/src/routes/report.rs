use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use xamina_core::domain::analytics::dto::{ClassResultQuery, ClassResultRow, PageMeta};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/reports/class-results", get(class_results))
        .route("/reports/class-results/export.csv", get(class_results_csv))
}

async fn class_results(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ClassResultQuery>,
) -> ApiResult<SuccessWithMeta<Vec<ClassResultRow>, PageMeta>> {
    let result = state
        .services
        .analytics
        .class_results(auth.0.tenant_id, auth.0.sub, &auth.0.role, query)
        .await?;
    Ok(Json(SuccessWithMeta {
        success: true,
        data: result.rows,
        meta: result.meta,
    }))
}

async fn class_results_csv(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ClassResultQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let rows = state
        .services
        .analytics
        .class_results(
            auth.0.tenant_id,
            auth.0.sub,
            &auth.0.role,
            ClassResultQuery {
                page: Some(1),
                page_size: Some(10_000),
                class_id: query.class_id,
                exam_id: query.exam_id,
            },
        )
        .await?
        .rows;

    let mut csv = String::from(
        "class_id,class_name,grade,major,exam_id,exam_title,submission_count,avg_score,pass_rate,last_submission_at\n",
    );
    for row in rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{:.2},{:.2},{}\n",
            escape_csv_option_uuid(row.class_id),
            escape_csv_option_string(row.class_name.as_deref()),
            escape_csv_option_string(row.grade.as_deref()),
            escape_csv_option_string(row.major.as_deref()),
            row.exam_id,
            escape_csv(row.exam_title.as_str()),
            row.submission_count,
            row.avg_score,
            row.pass_rate,
            row.last_submission_at
                .map(|x| x.to_rfc3339())
                .unwrap_or_default(),
        ));
    }

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"class-results.csv\"",
            ),
        ],
        csv,
    ))
}

fn escape_csv(input: &str) -> String {
    let escaped = input.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

fn escape_csv_option_string(input: Option<&str>) -> String {
    input.map(escape_csv).unwrap_or_else(|| "\"\"".to_string())
}

fn escape_csv_option_uuid(input: Option<uuid::Uuid>) -> String {
    input
        .map(|x| x.to_string())
        .map(|s| escape_csv(&s))
        .unwrap_or_else(|| "\"\"".to_string())
}
