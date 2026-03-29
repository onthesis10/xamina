mod common;

use axum::{
    body::{to_bytes, Body},
    http::{header, Method, Request, StatusCode},
};
use chrono::{Duration, Utc};
use serde_json::json;
use tower::ServiceExt;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn dashboard_summary_should_be_role_aware() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let admin_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/dashboard/summary")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (admin_status, admin_body) = ctx.request_json(admin_req).await;
    assert_eq!(admin_status, StatusCode::OK);
    assert_eq!(admin_body["data"]["role"], "admin");
    assert!(admin_body["data"]["users_total"].is_number());

    let guru_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/dashboard/summary")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (guru_status, guru_body) = ctx.request_json(guru_req).await;
    assert_eq!(guru_status, StatusCode::OK);
    assert_eq!(guru_body["data"]["role"], "guru");
    assert!(guru_body["data"]["exams_total"].is_number());

    let siswa_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/dashboard/summary")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (siswa_status, siswa_body) = ctx.request_json(siswa_req).await;
    assert_eq!(siswa_status, StatusCode::OK);
    assert_eq!(siswa_body["data"]["role"], "siswa");
    assert!(siswa_body["data"]["recent_results"].is_array());

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn report_should_enforce_access_and_support_csv_export() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_submission(&ctx).await?;

    let admin_report_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/reports/class-results?exam_id={exam_id}"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (admin_report_status, admin_report_body) = ctx.request_json(admin_report_req).await;
    assert_eq!(admin_report_status, StatusCode::OK);
    assert!(admin_report_body["data"].as_array().is_some());

    let guru_report_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/reports/class-results?exam_id={exam_id}"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (guru_report_status, _) = ctx.request_json(guru_report_req).await;
    assert_eq!(guru_report_status, StatusCode::OK);

    let siswa_report_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/reports/class-results")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (siswa_report_status, siswa_report_body) = ctx.request_json(siswa_report_req).await;
    assert_eq!(siswa_report_status, StatusCode::FORBIDDEN);
    assert_eq!(siswa_report_body["error"]["code"], "FORBIDDEN");

    let csv_req = Request::builder()
        .method(Method::GET)
        .uri(format!(
            "/api/v1/reports/class-results/export.csv?exam_id={exam_id}"
        ))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let csv_res = ctx.app.clone().oneshot(csv_req).await?;
    assert_eq!(csv_res.status(), StatusCode::OK);
    let content_type = csv_res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|x| x.to_str().ok())
        .unwrap_or_default();
    assert!(content_type.contains("text/csv"));
    let csv_bytes = to_bytes(csv_res.into_body(), 1024 * 1024).await?;
    let csv_body = String::from_utf8_lossy(&csv_bytes);
    assert!(csv_body.contains("class_id,class_name,grade,major,exam_id,exam_title"));

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn exam_insights_should_enforce_access_and_support_xlsx_export() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_submission(&ctx).await?;

    let missing_exam_id_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/reports/exam-insights")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (missing_status, missing_body) = ctx.request_json(missing_exam_id_req).await;
    assert_eq!(missing_status, StatusCode::BAD_REQUEST);
    assert_eq!(missing_body["error"]["code"], "VALIDATION_ERROR");

    let admin_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/reports/exam-insights?exam_id={exam_id}"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (admin_status, admin_body) = ctx.request_json(admin_req).await;
    assert_eq!(admin_status, StatusCode::OK);
    assert_eq!(
        admin_body["data"]["summary"]["exam_id"]
            .as_str()
            .unwrap_or_default(),
        exam_id
    );
    assert!(admin_body["data"]["distribution"].is_array());
    assert!(admin_body["data"]["time_series"].is_array());
    assert!(admin_body["data"]["item_analysis"].is_array());

    let guru_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/reports/exam-insights?exam_id={exam_id}"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (guru_status, _) = ctx.request_json(guru_req).await;
    assert_eq!(guru_status, StatusCode::OK);

    let siswa_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/reports/exam-insights?exam_id={exam_id}"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (siswa_status, siswa_body) = ctx.request_json(siswa_req).await;
    assert_eq!(siswa_status, StatusCode::FORBIDDEN);
    assert_eq!(siswa_body["error"]["code"], "FORBIDDEN");

    let xlsx_req = Request::builder()
        .method(Method::GET)
        .uri(format!(
            "/api/v1/reports/exam-insights/export.xlsx?exam_id={exam_id}"
        ))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let xlsx_res = ctx.app.clone().oneshot(xlsx_req).await?;
    assert_eq!(xlsx_res.status(), StatusCode::OK);
    let content_type = xlsx_res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|x| x.to_str().ok())
        .unwrap_or_default();
    assert!(content_type.contains("spreadsheetml.sheet"));
    let xlsx_bytes = to_bytes(xlsx_res.into_body(), 5 * 1024 * 1024).await?;
    assert!(xlsx_bytes.len() > 200);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn notification_should_be_created_from_publish_and_finish_flow() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let question_id = create_question(
        &ctx,
        "multiple_choice",
        "Notif Q?",
        json!("A"),
        json!([{ "id": "A", "label": "A" }, { "id": "B", "label": "B" }]),
    )
    .await?;
    let now = Utc::now();
    let exam_id = create_exam(
        &ctx,
        "Notif Exam",
        (now - Duration::minutes(30)).to_rfc3339(),
        (now + Duration::hours(2)).to_rfc3339(),
    )
    .await?;
    attach_question(&ctx, &exam_id, &question_id).await?;
    publish_exam(&ctx, &exam_id).await?;

    let list_after_publish_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/notifications")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (notif_status_1, notif_body_1) = ctx.request_json(list_after_publish_req).await;
    assert_eq!(notif_status_1, StatusCode::OK);
    let notif_rows_1 = notif_body_1["data"].as_array().cloned().unwrap_or_default();
    assert!(!notif_rows_1.is_empty());
    assert!(notif_rows_1
        .iter()
        .any(|item| item["type"] == "exam_published"));

    let start_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (start_status, start_body) = ctx.request_json(start_req).await;
    assert_eq!(start_status, StatusCode::OK);
    let submission_id = start_body["data"]["submission_id"]
        .as_str()
        .unwrap_or_default();

    let answers_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/answers"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "answers": [{
                    "question_id": question_id,
                    "answer": "A",
                    "is_bookmarked": false
                }]
            })
            .to_string(),
        ))?;
    let (answers_status, _) = ctx.request_json(answers_req).await;
    assert_eq!(answers_status, StatusCode::OK);

    let finish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/finish"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (finish_status, _) = ctx.request_json(finish_req).await;
    assert_eq!(finish_status, StatusCode::OK);

    let list_after_finish_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/notifications?unread_only=true")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (notif_status_2, notif_body_2) = ctx.request_json(list_after_finish_req).await;
    assert_eq!(notif_status_2, StatusCode::OK);
    let notif_rows_2 = notif_body_2["data"].as_array().cloned().unwrap_or_default();
    assert!(notif_rows_2
        .iter()
        .any(|item| item["type"] == "submission_finished"));

    let notif_id = notif_rows_2
        .first()
        .and_then(|item| item["id"].as_str())
        .unwrap_or_default();
    let mark_read_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/notifications/{notif_id}/read"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (mark_status, _) = ctx.request_json(mark_read_req).await;
    assert_eq!(mark_status, StatusCode::OK);

    let read_all_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/notifications/read-all")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (read_all_status, _) = ctx.request_json(read_all_req).await;
    assert_eq!(read_all_status, StatusCode::OK);

    let unread_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/notifications?unread_only=true")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (unread_status, unread_body) = ctx.request_json(unread_req).await;
    assert_eq!(unread_status, StatusCode::OK);
    assert_eq!(
        unread_body["meta"]["unread_count"]
            .as_i64()
            .unwrap_or_default(),
        0
    );

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn metrics_endpoint_should_be_available() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
        .method(Method::GET)
        .uri("/metrics")
        .body(Body::empty())?;
    let res = ctx.app.clone().oneshot(req).await?;
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = to_bytes(res.into_body(), 1024 * 1024).await?;
    let body = String::from_utf8_lossy(&bytes);
    assert!(body.contains("http") || body.contains("axum"));

    Ok(())
}

async fn create_published_exam_with_submission(ctx: &common::TestCtx) -> anyhow::Result<String> {
    let question_id = create_question(
        ctx,
        "multiple_choice",
        "Report Q?",
        json!("A"),
        json!([{ "id": "A", "label": "A" }, { "id": "B", "label": "B" }]),
    )
    .await?;
    let now = Utc::now();
    let exam_id = create_exam(
        ctx,
        "Report Exam",
        (now - Duration::hours(1)).to_rfc3339(),
        (now + Duration::hours(1)).to_rfc3339(),
    )
    .await?;
    attach_question(ctx, &exam_id, &question_id).await?;
    publish_exam(ctx, &exam_id).await?;

    let start_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (_, start_body) = ctx.request_json(start_req).await;
    let submission_id = start_body["data"]["submission_id"]
        .as_str()
        .unwrap_or_default();

    let answers_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/answers"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "answers": [{
                    "question_id": question_id,
                    "answer": "A",
                    "is_bookmarked": false
                }]
            })
            .to_string(),
        ))?;
    let (answers_status, _) = ctx.request_json(answers_req).await;
    assert_eq!(answers_status, StatusCode::OK);

    let finish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/finish"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (finish_status, _) = ctx.request_json(finish_req).await;
    assert_eq!(finish_status, StatusCode::OK);

    Ok(exam_id)
}

async fn create_question(
    ctx: &common::TestCtx,
    qtype: &str,
    content: &str,
    answer_key: serde_json::Value,
    options_jsonb: serde_json::Value,
) -> anyhow::Result<String> {
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "type": qtype,
                "content": content,
                "options_jsonb": options_jsonb,
                "answer_key": answer_key,
                "topic": "integration",
                "difficulty": "easy"
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(request).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"]
        .as_str()
        .expect("question id")
        .to_string())
}

async fn create_exam(
    ctx: &common::TestCtx,
    title: &str,
    start_at: String,
    end_at: String,
) -> anyhow::Result<String> {
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": title,
                "duration_minutes": 30,
                "start_at": start_at,
                "end_at": end_at
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(request).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"].as_str().expect("exam id").to_string())
}

async fn attach_question(
    ctx: &common::TestCtx,
    exam_id: &str,
    question_id: &str,
) -> anyhow::Result<()> {
    let request = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/questions"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "question_ids": [question_id] }).to_string(),
        ))?;
    let (status, _) = ctx.request_json(request).await;
    assert_eq!(status, StatusCode::OK);
    Ok(())
}

async fn publish_exam(ctx: &common::TestCtx, exam_id: &str) -> anyhow::Result<()> {
    let request = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (status, body) = ctx.request_json(request).await;
    assert_eq!(status, StatusCode::OK, "{body:?}");
    Ok(())
}
