mod common;

use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn ai_extract_pdf_should_require_file() -> anyhow::Result<()> {
    std::env::set_var("AI_MOCK_MODE", "1");
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let multipart = "--X\r\nContent-Disposition: form-data; name=\"note\"\r\n\r\nnoop\r\n--X--\r\n";
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/extract-pdf")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .header("content-type", "multipart/form-data; boundary=X")
        .body(Body::from(multipart.to_string()))?;

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "MISSING_FILE");
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn ai_generate_should_require_auth() -> anyhow::Result<()> {
    std::env::set_var("AI_MOCK_MODE", "1");
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/generate")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "topic": "Auth test",
                "question_type": "multiple_choice",
                "difficulty": "medium",
                "count": 1
            })
            .to_string(),
        ))?;

    let (status, _) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn ai_generate_and_grade_should_log_usage_and_deduct_credits() -> anyhow::Result<()> {
    std::env::set_var("AI_MOCK_MODE", "1");
    std::env::set_var("AI_RATE_LIMIT_GENERATE_PER_MIN", "50");
    std::env::set_var("AI_RATE_LIMIT_GRADE_PER_MIN", "50");
    std::env::set_var("AI_RATE_LIMIT_EXTRACT_PER_MIN", "50");
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let token = ctx.bearer_for(ctx.guru_id, "guru");

    let generate_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/generate")
        .header("authorization", &token)
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "topic": "Biology",
                "context": "Cell structure",
                "question_type": "multiple_choice",
                "difficulty": "easy",
                "count": 2
            })
            .to_string(),
        ))?;
    let (generate_status, generate_body) = ctx.request_json(generate_req).await;
    assert_eq!(generate_status, StatusCode::OK);
    assert_eq!(generate_body["success"], true);
    assert_eq!(
        generate_body["data"]["questions"]
            .as_array()
            .map(|a| a.len()),
        Some(2)
    );

    let grade_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/grade")
        .header("authorization", &token)
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "question_text": "Explain mitochondria",
                "student_answer": "Mitochondria produce ATP for cells.",
                "rubric": "Accuracy and clarity"
            })
            .to_string(),
        ))?;
    let (grade_status, grade_body) = ctx.request_json(grade_req).await;
    assert_eq!(grade_status, StatusCode::OK);
    assert_eq!(grade_body["success"], true);

    let used: i32 = sqlx::query_scalar("SELECT ai_credits_used FROM tenants WHERE id = $1")
        .bind(ctx.tenant_id)
        .fetch_one(&ctx.pool)
        .await?;
    assert_eq!(used, 3);

    let usage_rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ai_usage_logs WHERE tenant_id = $1 AND status = 'success'",
    )
    .bind(ctx.tenant_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert!(usage_rows >= 2);
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn ai_quota_exceeded_should_return_error_and_log_error_status() -> anyhow::Result<()> {
    std::env::set_var("AI_MOCK_MODE", "1");
    std::env::set_var("AI_RATE_LIMIT_GENERATE_PER_MIN", "50");
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let token = ctx.bearer_for(ctx.guru_id, "guru");

    sqlx::query("UPDATE tenants SET ai_credits_quota = 1, ai_credits_used = 1 WHERE id = $1")
        .bind(ctx.tenant_id)
        .execute(&ctx.pool)
        .await?;

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/generate")
        .header("authorization", &token)
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "topic": "Physics",
                "question_type": "multiple_choice",
                "difficulty": "medium",
                "count": 1
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "QUOTA_EXCEEDED");

    let error_rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ai_usage_logs WHERE tenant_id = $1 AND status = 'error' AND error_code = 'QUOTA_EXCEEDED'",
    )
    .bind(ctx.tenant_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert!(error_rows >= 1);
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn ai_rate_limit_should_return_429_and_log_rate_limited() -> anyhow::Result<()> {
    std::env::set_var("AI_MOCK_MODE", "1");
    std::env::set_var("AI_RATE_LIMIT_GENERATE_PER_MIN", "1");
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let token = ctx.bearer_for(ctx.guru_id, "guru");

    let payload = json!({
        "topic": "Rate limit",
        "question_type": "multiple_choice",
        "difficulty": "easy",
        "count": 1
    })
    .to_string();

    let req1 = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/generate")
        .header("authorization", &token)
        .header("content-type", "application/json")
        .body(Body::from(payload.clone()))?;
    let (status1, _) = ctx.request_json(req1).await;
    assert_eq!(status1, StatusCode::OK);

    let req2 = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/generate")
        .header("authorization", &token)
        .header("content-type", "application/json")
        .body(Body::from(payload))?;
    let (status2, body2) = ctx.request_json(req2).await;
    assert_eq!(status2, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(body2["error"]["code"], "RATE_LIMITED");

    let rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ai_usage_logs WHERE tenant_id = $1 AND status = 'rate_limited' AND endpoint = '/ai/generate'",
    )
    .bind(ctx.tenant_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert!(rows >= 1);
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn ai_generate_stream_should_emit_chunk_and_final_events() -> anyhow::Result<()> {
    std::env::set_var("AI_MOCK_MODE", "1");
    std::env::set_var("AI_RATE_LIMIT_GENERATE_PER_MIN", "50");
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let token = ctx.bearer_for(ctx.guru_id, "guru");

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/ai/generate/stream")
        .header("authorization", &token)
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "topic": "Streaming",
                "question_type": "multiple_choice",
                "difficulty": "easy",
                "count": 2
            })
            .to_string(),
        ))?;

    let response = ctx.app.clone().oneshot(req).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers();
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(content_type.contains("text/event-stream"));

    let body = to_bytes(response.into_body(), 1024 * 1024).await?;
    let body_str = String::from_utf8_lossy(&body);
    assert!(body_str.contains("event: chunk"));
    assert!(body_str.contains("event: final"));

    let rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ai_usage_logs WHERE tenant_id = $1 AND status = 'success' AND endpoint = '/ai/generate/stream'",
    )
    .bind(ctx.tenant_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert!(rows >= 1);
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn dashboard_stats_should_return_tenant_quota_payload() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let token = ctx.bearer_for(ctx.admin_id, "admin");

    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/dashboard/stats")
        .header("authorization", token)
        .body(Body::empty())?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);
    assert!(body["data"]["tenant"]["users_quota"].is_number());
    assert!(body["data"]["tenant"]["ai_credits_quota"].is_number());
    Ok(())
}
