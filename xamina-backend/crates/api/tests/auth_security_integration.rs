mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn login_should_require_challenge_when_email_otp_enabled() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    sqlx::query(
        "INSERT INTO user_security_settings (tenant_id, user_id, email_otp_enabled)
         VALUES ($1, $2, TRUE)",
    )
    .bind(ctx.tenant_id)
    .bind(ctx.admin_id)
    .execute(&ctx.pool)
    .await?;

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .header("x-real-ip", "10.0.0.10")
        .header("user-agent", "integration-suite")
        .body(Body::from(
            json!({
                "tenant_slug": "test-school",
                "email": "admin@test.local",
                "password": "Admin123!"
            })
            .to_string(),
        ))?;

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["status"], "challenge_required");
    assert_eq!(body["data"]["delivery"], "email");
    assert_eq!(body["data"]["reason_codes"][0], "always_on_email_otp");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn login_should_require_challenge_after_recent_failed_password_attempts() -> anyhow::Result<()>
{
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    for _ in 0..3 {
        let wrong_req = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .header("content-type", "application/json")
            .header("x-real-ip", "10.0.0.25")
            .header("user-agent", "integration-suite")
            .body(Body::from(
                json!({
                    "tenant_slug": "test-school",
                    "email": "admin@test.local",
                    "password": "wrong-password"
                })
                .to_string(),
            ))?;
        let (wrong_status, _) = ctx.request_json(wrong_req).await;
        assert_eq!(wrong_status, StatusCode::UNAUTHORIZED);
    }

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .header("x-real-ip", "10.0.0.25")
        .header("user-agent", "integration-suite")
        .body(Body::from(
            json!({
                "tenant_slug": "test-school",
                "email": "admin@test.local",
                "password": "Admin123!"
            })
            .to_string(),
        ))?;

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["status"], "challenge_required");
    let reasons = body["data"]["reason_codes"].to_string();
    assert!(reasons.contains("recent_failed_logins"));

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn verify_otp_should_issue_session_and_resend_should_rotate_token() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    sqlx::query(
        "INSERT INTO user_security_settings (tenant_id, user_id, email_otp_enabled)
         VALUES ($1, $2, TRUE)",
    )
    .bind(ctx.tenant_id)
    .bind(ctx.admin_id)
    .execute(&ctx.pool)
    .await?;

    let login_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .header("x-real-ip", "10.0.0.11")
        .header("user-agent", "integration-suite")
        .body(Body::from(
            json!({
                "tenant_slug": "test-school",
                "email": "admin@test.local",
                "password": "Admin123!"
            })
            .to_string(),
        ))?;
    let (login_status, login_body) = ctx.request_json(login_req).await;
    assert_eq!(login_status, StatusCode::OK);
    let challenge_token = login_body["data"]["challenge_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    assert_ne!(challenge_token, "");

    sqlx::query("UPDATE auth_login_challenges SET resend_available_at = NOW() - INTERVAL '1 second' WHERE challenge_token = $1")
        .bind(&challenge_token)
        .execute(&ctx.pool)
        .await?;

    let resend_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login/resend-email-otp")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "challenge_token": challenge_token }).to_string(),
        ))?;
    let (resend_status, resend_body) = ctx.request_json(resend_req).await;
    assert_eq!(resend_status, StatusCode::OK);
    let rotated_token = resend_body["data"]["challenge_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    assert_ne!(rotated_token, "");

    let otp_hash: String = sqlx::query_scalar(
        "SELECT otp_code_hash FROM auth_login_challenges WHERE challenge_token = $1",
    )
    .bind(&rotated_token)
    .fetch_one(&ctx.pool)
    .await?;

    let otp_code = (0..1_000_000)
        .map(|candidate| format!("{candidate:06}"))
        .find(|candidate| {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(candidate.as_bytes());
            let digest = hasher.finalize();
            let hashed: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
            hashed == otp_hash
        })
        .expect("otp code should be recoverable in test");

    let verify_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login/verify-email-otp")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "challenge_token": rotated_token,
                "code": otp_code
            })
            .to_string(),
        ))?;
    let (verify_status, verify_body) = ctx.request_json(verify_req).await;
    assert_eq!(verify_status, StatusCode::OK);
    assert_eq!(verify_body["data"]["status"], "authenticated");
    assert!(
        verify_body["data"]["access_token"]
            .as_str()
            .unwrap_or_default()
            .len()
            > 20
    );

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn update_security_settings_should_require_current_password() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
        .method(Method::PATCH)
        .uri("/api/v1/auth/privacy/security-settings")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "email_otp_enabled": true,
                "current_password": "wrong-password"
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["code"], "INVALID_PASSWORD");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn security_headers_should_exist_on_health_and_auth_routes() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let health_response = ctx
        .app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/health")
                .body(Body::empty())?,
        )
        .await?;
    assert_eq!(health_response.headers()["x-frame-options"], "SAMEORIGIN");
    assert_eq!(
        health_response.headers()["x-content-type-options"],
        "nosniff"
    );

    let login_response = ctx
        .app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "tenant_slug": "test-school",
                        "email": "admin@test.local",
                        "password": "Admin123!"
                    })
                    .to_string(),
                ))?,
        )
        .await?;
    assert_eq!(
        login_response.headers()["permissions-policy"],
        "geolocation=(), microphone=(), camera=()"
    );

    Ok(())
}
