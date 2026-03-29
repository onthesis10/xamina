use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use rust_xlsxwriter::Workbook;
use xamina_core::domain::analytics::dto::{
    ClassResultQuery, ClassResultRow, ExamInsightsDto, ExamInsightsQuery, PageMeta,
};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/reports/class-results", get(class_results))
        .route("/reports/class-results/export.csv", get(class_results_csv))
        .route("/reports/exam-insights", get(exam_insights))
        .route(
            "/reports/exam-insights/export.xlsx",
            get(exam_insights_xlsx),
        )
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

async fn exam_insights(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ExamInsightsQuery>,
) -> ApiResult<crate::app::SuccessResponse<ExamInsightsDto>> {
    let insights = state
        .services
        .analytics
        .exam_insights(auth.0.tenant_id, auth.0.sub, &auth.0.role, query)
        .await?;
    Ok(Json(crate::app::SuccessResponse {
        success: true,
        data: insights,
    }))
}

async fn exam_insights_xlsx(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ExamInsightsQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let insights = state
        .services
        .analytics
        .exam_insights(auth.0.tenant_id, auth.0.sub, &auth.0.role, query)
        .await?;
    let payload = render_exam_insights_xlsx(&insights)?;
    Ok((
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"exam-insights.xlsx\"",
            ),
        ],
        payload,
    ))
}

fn render_exam_insights_xlsx(insights: &ExamInsightsDto) -> Result<Vec<u8>, ApiError> {
    let mut workbook = Workbook::new();

    let summary = workbook.add_worksheet();
    summary.set_name("Summary").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to build xlsx summary sheet",
        )
    })?;
    summary.write_string(0, 0, "Metric").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx summary",
        )
    })?;
    summary.write_string(0, 1, "Value").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx summary",
        )
    })?;
    summary.write_string(1, 0, "exam_id").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx summary",
        )
    })?;
    summary
        .write_string(1, 1, insights.summary.exam_id.to_string())
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx summary",
            )
        })?;
    summary.write_string(2, 0, "exam_title").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx summary",
        )
    })?;
    summary
        .write_string(2, 1, &insights.summary.exam_title)
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx summary",
            )
        })?;
    summary.write_string(3, 0, "pass_score").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx summary",
        )
    })?;
    summary
        .write_number(3, 1, insights.summary.pass_score as f64)
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx summary",
            )
        })?;
    summary
        .write_string(4, 0, "submission_count")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx summary",
            )
        })?;
    summary
        .write_number(4, 1, insights.summary.submission_count as f64)
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx summary",
            )
        })?;
    summary.write_string(5, 0, "avg_score").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx summary",
        )
    })?;
    summary
        .write_number(5, 1, insights.summary.avg_score)
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx summary",
            )
        })?;
    summary.write_string(6, 0, "pass_rate").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx summary",
        )
    })?;
    summary
        .write_number(6, 1, insights.summary.pass_rate)
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx summary",
            )
        })?;

    let distribution = workbook.add_worksheet();
    distribution.set_name("Distribution").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to build xlsx distribution sheet",
        )
    })?;
    distribution.write_string(0, 0, "label").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx distribution",
        )
    })?;
    distribution
        .write_string(0, 1, "lower_bound")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx distribution",
            )
        })?;
    distribution
        .write_string(0, 2, "upper_bound")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx distribution",
            )
        })?;
    distribution.write_string(0, 3, "count").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx distribution",
        )
    })?;
    for (index, row) in insights.distribution.iter().enumerate() {
        let target = (index + 1) as u32;
        distribution
            .write_string(target, 0, &row.label)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx distribution",
                )
            })?;
        distribution
            .write_number(target, 1, row.lower_bound as f64)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx distribution",
                )
            })?;
        distribution
            .write_number(target, 2, row.upper_bound as f64)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx distribution",
                )
            })?;
        distribution
            .write_number(target, 3, row.count as f64)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx distribution",
                )
            })?;
    }

    let item_analysis = workbook.add_worksheet();
    item_analysis.set_name("ItemAnalysis").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to build xlsx item analysis sheet",
        )
    })?;
    item_analysis
        .write_string(0, 0, "question_id")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx item analysis",
            )
        })?;
    item_analysis
        .write_string(0, 1, "question_type")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx item analysis",
            )
        })?;
    item_analysis
        .write_string(0, 2, "question_content")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx item analysis",
            )
        })?;
    item_analysis
        .write_string(0, 3, "total_attempts")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx item analysis",
            )
        })?;
    item_analysis
        .write_string(0, 4, "correct_attempts")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx item analysis",
            )
        })?;
    item_analysis.write_string(0, 5, "p_value").map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to write xlsx item analysis",
        )
    })?;
    item_analysis
        .write_string(0, 6, "point_biserial")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx item analysis",
            )
        })?;
    item_analysis
        .write_string(0, 7, "recommendations")
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EXPORT_FAILED",
                "Failed to write xlsx item analysis",
            )
        })?;

    for (index, row) in insights.item_analysis.iter().enumerate() {
        let target = (index + 1) as u32;
        item_analysis
            .write_string(target, 0, row.question_id.to_string())
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx item analysis",
                )
            })?;
        item_analysis
            .write_string(target, 1, &row.question_type)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx item analysis",
                )
            })?;
        item_analysis
            .write_string(target, 2, &row.question_content)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx item analysis",
                )
            })?;
        item_analysis
            .write_number(target, 3, row.total_attempts as f64)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx item analysis",
                )
            })?;
        item_analysis
            .write_number(target, 4, row.correct_attempts as f64)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx item analysis",
                )
            })?;
        item_analysis
            .write_number(target, 5, row.p_value)
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx item analysis",
                )
            })?;
        if let Some(point_biserial) = row.point_biserial {
            item_analysis
                .write_number(target, 6, point_biserial)
                .map_err(|_| {
                    ApiError::new(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "EXPORT_FAILED",
                        "Failed to write xlsx item analysis",
                    )
                })?;
        }
        item_analysis
            .write_string(target, 7, row.recommendations.join(","))
            .map_err(|_| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "EXPORT_FAILED",
                    "Failed to write xlsx item analysis",
                )
            })?;
    }

    workbook.save_to_buffer().map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EXPORT_FAILED",
            "Failed to build xlsx payload",
        )
    })
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
