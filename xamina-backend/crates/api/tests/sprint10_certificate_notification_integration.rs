mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use chrono::{Duration, Utc};
use serde_json::json;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn certificate_should_be_issued_once_for_passed_submission() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let question_id = create_question(&ctx).await?;
    let now = Utc::now();
    let exam_id = create_exam(
        &ctx,
        "Sprint 10 Cert Exam",
        (now - Duration::minutes(10)).to_rfc3339(),
        (now + Duration::hours(1)).to_rfc3339(),
    )
    .await?;
    attach_question(&ctx, &exam_id, &question_id).await?;
    publish_exam(&ctx, &exam_id).await?;

    let start_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (start_status, start_body) = ctx.request_json(start_req).await;
    assert_eq!(start_status, StatusCode::OK);
    let submission_id = start_body["data"]["submission_id"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    let answer_req = Request::builder()
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
    let (answer_status, _) = ctx.request_json(answer_req).await;
    assert_eq!(answer_status, StatusCode::OK);

    let finish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/finish"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (finish_status, finish_body) = ctx.request_json(finish_req).await;
    assert_eq!(finish_status, StatusCode::OK);
    assert_eq!(finish_body["data"]["passed"], true);

    // Idempotency check: finishing twice must not duplicate certificate.
    let finish_req_2 = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/finish"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (finish_status_2, _) = ctx.request_json(finish_req_2).await;
    assert_eq!(finish_status_2, StatusCode::OK);

    let cert_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/submissions/{submission_id}/certificate"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (cert_status, cert_body) = ctx.request_json(cert_req).await;
    assert_eq!(cert_status, StatusCode::OK);
    assert!(cert_body["data"]["certificate_no"].is_string());

    let cert_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM certificates WHERE submission_id = $1")
            .bind(uuid::Uuid::parse_str(&submission_id).expect("submission id must be valid uuid"))
            .fetch_one(&ctx.pool)
            .await?;
    assert_eq!(cert_count, 1);

    let email_job_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM email_jobs WHERE tenant_id = $1")
            .bind(ctx.tenant_id)
            .fetch_one(&ctx.pool)
            .await?;
    assert!(email_job_count >= 1);

    let push_job_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM push_jobs WHERE tenant_id = $1")
            .bind(ctx.tenant_id)
            .fetch_one(&ctx.pool)
            .await?;
    assert!(push_job_count >= 1);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn broadcast_should_support_role_filter_and_forbid_student_sender() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let broadcast_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/notifications/broadcast")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "Info Sprint 10",
                "message": "Broadcast ke siswa saja",
                "target_roles": ["siswa"],
                "send_push": true
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(broadcast_req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["targeted_users"], 1);

    let siswa_notif_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications WHERE tenant_id = $1 AND user_id = $2 AND type = 'broadcast'",
    )
    .bind(ctx.tenant_id)
    .bind(ctx.siswa_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert_eq!(siswa_notif_count, 1);

    let admin_notif_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications WHERE tenant_id = $1 AND user_id = $2 AND type = 'broadcast'",
    )
    .bind(ctx.tenant_id)
    .bind(ctx.admin_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert_eq!(admin_notif_count, 0);

    let forbidden_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/notifications/broadcast")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "title": "x",
                "message": "x"
            })
            .to_string(),
        ))?;
    let (forbidden_status, forbidden_body) = ctx.request_json(forbidden_req).await;
    assert_eq!(forbidden_status, StatusCode::FORBIDDEN);
    assert_eq!(forbidden_body["error"]["code"], "FORBIDDEN");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn push_subscription_endpoints_should_subscribe_and_unsubscribe() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    std::env::set_var(
        "WEB_PUSH_VAPID_PUBLIC_KEY",
        "BElocal-test-vapid-public-key-placeholder",
    );

    let key_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/notifications/push/public-key")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (key_status, key_body) = ctx.request_json(key_req).await;
    assert_eq!(key_status, StatusCode::OK);
    assert!(key_body["data"]["public_key"].is_string());

    let endpoint = "https://push.example.invalid/subscription-1";
    let subscribe_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/notifications/push/subscribe")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "endpoint": endpoint,
                "keys": {
                    "p256dh": "abc123",
                    "auth": "xyz789"
                },
                "user_agent": "playwright-test"
            })
            .to_string(),
        ))?;
    let (subscribe_status, _) = ctx.request_json(subscribe_req).await;
    assert_eq!(subscribe_status, StatusCode::OK);

    let sub_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM push_subscriptions WHERE tenant_id = $1 AND user_id = $2",
    )
    .bind(ctx.tenant_id)
    .bind(ctx.siswa_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert_eq!(sub_count, 1);

    let unsubscribe_req = Request::builder()
        .method(Method::DELETE)
        .uri("/api/v1/notifications/push/subscribe")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "endpoint": endpoint
            })
            .to_string(),
        ))?;
    let (unsubscribe_status, unsubscribe_body) = ctx.request_json(unsubscribe_req).await;
    assert_eq!(unsubscribe_status, StatusCode::OK);
    assert_eq!(unsubscribe_body["data"]["deleted"], 1);

    Ok(())
}

async fn create_question(ctx: &common::TestCtx) -> anyhow::Result<String> {
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "type": "multiple_choice",
                "content": "Sprint 10 Question?",
                "options_jsonb": [{ "id": "A", "label": "A" }, { "id": "B", "label": "B" }],
                "answer_key": "A",
                "topic": "integration",
                "difficulty": "easy"
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(request).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"].as_str().unwrap_or_default().to_string())
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
                "pass_score": 70,
                "start_at": start_at,
                "end_at": end_at
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(request).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"].as_str().unwrap_or_default().to_string())
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
