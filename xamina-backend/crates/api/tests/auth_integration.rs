mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serde_json::json;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn login_should_succeed_with_valid_credentials() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
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
        ))?;

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], true);
    assert_eq!(body["data"]["user"]["role"], "admin");
    assert!(
        body["data"]["access_token"]
            .as_str()
            .unwrap_or_default()
            .len()
            > 20
    );
    assert!(
        body["data"]["refresh_token"]
            .as_str()
            .unwrap_or_default()
            .len()
            > 20
    );

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn login_should_fail_with_invalid_credentials() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tenant_slug": "test-school",
                "email": "admin@test.local",
                "password": "wrong-password"
            })
            .to_string(),
        ))?;

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["code"], "INVALID_LOGIN");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn refresh_should_rotate_token_and_reject_old_token() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let login_req = Request::builder()
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
        ))?;
    let (login_status, login_body) = ctx.request_json(login_req).await;
    assert_eq!(login_status, StatusCode::OK);
    let refresh_token_1 = login_body["data"]["refresh_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    let refresh_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/refresh")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "refresh_token": refresh_token_1 }).to_string(),
        ))?;
    let (refresh_status, refresh_body) = ctx.request_json(refresh_req).await;
    assert_eq!(refresh_status, StatusCode::OK);
    let refresh_token_2 = refresh_body["data"]["refresh_token"]
        .as_str()
        .unwrap_or_default();
    assert_ne!(refresh_token_2, "");
    assert_ne!(refresh_token_2, refresh_token_1);

    let reuse_old_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/refresh")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "refresh_token": refresh_token_1 }).to_string(),
        ))?;
    let (reuse_status, reuse_body) = ctx.request_json(reuse_old_req).await;
    assert_eq!(reuse_status, StatusCode::UNAUTHORIZED);
    assert_eq!(reuse_body["error"]["code"], "INVALID_REFRESH");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn me_should_return_profile_for_valid_bearer() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let login_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/login")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "tenant_slug": "test-school",
                "email": "guru@test.local",
                "password": "Guru123!"
            })
            .to_string(),
        ))?;
    let (login_status, login_body) = ctx.request_json(login_req).await;
    assert_eq!(login_status, StatusCode::OK);
    let access_token = login_body["data"]["access_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    let me_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/me")
        .header("authorization", format!("Bearer {access_token}"))
        .body(Body::empty())?;
    let (me_status, me_body) = ctx.request_json(me_req).await;
    assert_eq!(me_status, StatusCode::OK);
    assert_eq!(me_body["data"]["email"], "guru@test.local");
    assert_eq!(me_body["data"]["role"], "guru");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn logout_should_revoke_refresh_token() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let login_req = Request::builder()
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
        ))?;
    let (login_status, login_body) = ctx.request_json(login_req).await;
    assert_eq!(login_status, StatusCode::OK);
    let access_token = login_body["data"]["access_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let refresh_token = login_body["data"]["refresh_token"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    let logout_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/logout")
        .header("authorization", format!("Bearer {access_token}"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "refresh_token": refresh_token }).to_string(),
        ))?;
    let (logout_status, _) = ctx.request_json(logout_req).await;
    assert_eq!(logout_status, StatusCode::OK);

    let refresh_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/auth/refresh")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "refresh_token": refresh_token }).to_string(),
        ))?;
    let (refresh_status, refresh_body) = ctx.request_json(refresh_req).await;
    assert_eq!(refresh_status, StatusCode::UNAUTHORIZED);
    assert_eq!(refresh_body["error"]["code"], "INVALID_REFRESH");

    Ok(())
}
