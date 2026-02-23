// Handler — hanya terima req, panggil service
#[axum::debug_handler]
pub async fn create_exam(
    State(state): State<AppState>,
    Extension(claims): Extension<JwtClaims>,
    Json(dto): Json<CreateExamDto>,
) -> AppResult<Json<ExamResponse>> {
    dto.validate()?;

    let exam = state.exam_service
        .create_exam(claims.tenant_id, claims.user_id, dto)
        .await?;

    Ok(Json(exam.into()))
}

// Route registration di routes/exam.rs
pub fn exam_router() -> Router<AppState> {
    Router::new()
        .route("/exams",
            get(list_exams).post(create_exam))
        .route("/exams/:id",
            get(get_exam)
            .put(update_exam)
            .delete(delete_exam))
        .route("/exams/:id/publish",
            post(publish_exam))
        .route("/exams/:id/monitor",
            get(ws_monitor_exam)) // WebSocket
        .route_layer(require_role([Role::Guru]))
}
