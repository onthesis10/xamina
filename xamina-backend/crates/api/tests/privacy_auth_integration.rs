mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use chrono::{Duration, Utc};
use serde_json::json;
use uuid::Uuid;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn privacy_export_should_return_self_service_snapshot() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = Uuid::new_v4();
    let submission_id = Uuid::new_v4();
    let certificate_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO exams (
            id, tenant_id, created_by, title, duration_minutes, pass_score, status
         )
         VALUES ($1, $2, $3, 'Sprint 15 Security Exam', 60, 75, 'published')",
    )
    .bind(exam_id)
    .bind(ctx.tenant_id)
    .bind(ctx.admin_id)
    .execute(&ctx.pool)
    .await?;

    sqlx::query(
        "INSERT INTO submissions (
            id, tenant_id, exam_id, student_id, status, deadline_at, score, correct_count, total_questions
         )
         VALUES ($1, $2, $3, $4, 'finished', $5, 88.5, 18, 20)",
    )
    .bind(submission_id)
    .bind(ctx.tenant_id)
    .bind(exam_id)
    .bind(ctx.siswa_id)
    .bind(Utc::now() + Duration::minutes(45))
    .execute(&ctx.pool)
    .await?;

    sqlx::query(
        "INSERT INTO notifications (tenant_id, user_id, type, title, message, is_read)
         VALUES ($1, $2, 'certificate_ready', 'Sertifikat tersedia', 'Silakan unduh sertifikat Anda.', TRUE)",
    )
    .bind(ctx.tenant_id)
    .bind(ctx.siswa_id)
    .execute(&ctx.pool)
    .await?;

    sqlx::query(
        "INSERT INTO certificates (
            id, tenant_id, submission_id, exam_id, student_id, certificate_no, score, file_path, file_url
         )
         VALUES ($1, $2, $3, $4, $5, 'CERT-S15-001', 88.5, '/uploads/certificates/cert-s15-001.pdf', '/uploads/certificates/cert-s15-001.pdf')",
    )
    .bind(certificate_id)
    .bind(ctx.tenant_id)
    .bind(submission_id)
    .bind(exam_id)
    .bind(ctx.siswa_id)
    .execute(&ctx.pool)
    .await?;

    sqlx::query(
        "INSERT INTO refresh_tokens (tenant_id, user_id, token, expires_at)
         VALUES ($1, $2, 'privacy-export-token', $3)",
    )
    .bind(ctx.tenant_id)
    .bind(ctx.siswa_id)
    .bind(Utc::now() + Duration::days(7))
    .execute(&ctx.pool)
    .await?;

    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/privacy/export")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["user"]["email"], "siswa@test.local");
    assert_eq!(body["data"]["submissions"].as_array().map(Vec::len), Some(1));
    assert_eq!(body["data"]["notifications"].as_array().map(Vec::len), Some(1));
    assert_eq!(body["data"]["certificates"].as_array().map(Vec::len), Some(1));
    assert_eq!(body["data"]["sessions"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        body["data"]["certificates"][0]["certificate_no"],
        json!("CERT-S15-001")
    );

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn privacy_delete_request_should_create_and_block_duplicate_pending() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/privacy/delete-request")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "reason": "Tenant sudah tidak aktif dan akun ingin ditutup permanen."
            })
            .to_string(),
        ))?;
    let (create_status, create_body) = ctx.request_json(create_req).await;
    assert_eq!(create_status, StatusCode::OK);
    assert_eq!(create_body["data"]["status"], "pending");

    let get_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/privacy/delete-request")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (get_status, get_body) = ctx.request_json(get_req).await;
    assert_eq!(get_status, StatusCode::OK);
    assert_eq!(get_body["data"]["status"], "pending");

    let duplicate_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/privacy/delete-request")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "reason": "Duplicate request"
            })
            .to_string(),
        ))?;
    let (duplicate_status, duplicate_body) = ctx.request_json(duplicate_req).await;
    assert_eq!(duplicate_status, StatusCode::CONFLICT);
    assert_eq!(duplicate_body["error"]["code"], "DELETE_REQUEST_EXISTS");

    Ok(())
}
