mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serde_json::json;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn platform_endpoints_should_require_super_admin() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let guarded_endpoints = [
        "/api/v1/platform/analytics/overview",
        "/api/v1/platform/system/health",
        "/api/v1/platform/ai-config",
        "/api/v1/platform/audit-logs",
    ];

    for endpoint in guarded_endpoints {
        let req = Request::builder()
            .method(Method::GET)
            .uri(endpoint)
            .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
            .body(Body::empty())?;
        let (status, body) = ctx.request_json(req).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "FORBIDDEN");
    }

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn platform_analytics_health_and_ai_config_should_be_available() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let analytics_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/platform/analytics/overview")
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .body(Body::empty())?;
    let (analytics_status, analytics_body) = ctx.request_json(analytics_req).await;
    assert_eq!(analytics_status, StatusCode::OK);
    assert!(
        analytics_body["data"]["totals"]["tenants_total"]
            .as_i64()
            .unwrap_or(0)
            >= 1
    );

    let health_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/platform/system/health")
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .body(Body::empty())?;
    let (health_status, health_body) = ctx.request_json(health_req).await;
    assert_eq!(health_status, StatusCode::OK);
    assert!(health_body["data"]["queue_backlog"]["email_jobs"].is_number());

    let get_ai_config_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/platform/ai-config")
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .body(Body::empty())?;
    let (get_ai_config_status, get_ai_config_body) = ctx.request_json(get_ai_config_req).await;
    assert_eq!(get_ai_config_status, StatusCode::OK);
    assert_eq!(get_ai_config_body["data"]["preferred_provider"], "auto");

    let patch_ai_config_req = Request::builder()
        .method(Method::PATCH)
        .uri("/api/v1/platform/ai-config")
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "preferred_provider": "openai",
                "openai_model": "gpt-4o-mini",
                "generate_rate_limit_per_min": 25
            })
            .to_string(),
        ))?;
    let (patch_status, patch_body) = ctx.request_json(patch_ai_config_req).await;
    assert_eq!(patch_status, StatusCode::OK);
    assert_eq!(patch_body["data"]["preferred_provider"], "openai");
    assert_eq!(patch_body["data"]["generate_rate_limit_per_min"], 25);

    let ai_config_audit_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM platform_audit_logs WHERE action = 'platform.ai_config.updated'",
    )
    .fetch_one(&ctx.pool)
    .await?;
    assert_eq!(ai_config_audit_count, 1);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn platform_mutations_should_write_audit_logs() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_tenant_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/platform/tenants")
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "Tenant Audit",
                "slug": "tenant-audit",
                "plan": "starter"
            })
            .to_string(),
        ))?;
    let (create_status, create_body) = ctx.request_json(create_tenant_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let new_tenant_id = create_body["data"]["id"].as_str().unwrap_or_default();

    let update_tenant_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/platform/tenants/{new_tenant_id}"))
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "plan": "professional",
                "users_quota": 1200
            })
            .to_string(),
        ))?;
    let (update_status, _) = ctx.request_json(update_tenant_req).await;
    assert_eq!(update_status, StatusCode::OK);

    let checkout_req = Request::builder()
        .method(Method::POST)
        .uri(format!(
            "/api/v1/platform/tenants/{}/billing/checkout",
            ctx.tenant_id
        ))
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .header("content-type", "application/json")
        .body(Body::from(json!({ "plan_code": "starter" }).to_string()))?;
    let (checkout_status, _) = ctx.request_json(checkout_req).await;
    assert_eq!(checkout_status, StatusCode::OK);

    let logs_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/platform/audit-logs?page=1&page_size=20")
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .body(Body::empty())?;
    let (logs_status, logs_body) = ctx.request_json(logs_req).await;
    assert_eq!(logs_status, StatusCode::OK);
    assert!(logs_body["meta"]["total"].as_i64().unwrap_or(0) >= 3);

    let create_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM platform_audit_logs WHERE action = 'platform.tenant.created'",
    )
    .fetch_one(&ctx.pool)
    .await?;
    let update_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM platform_audit_logs WHERE action = 'platform.tenant.updated'",
    )
    .fetch_one(&ctx.pool)
    .await?;
    let checkout_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM platform_audit_logs WHERE action = 'platform.billing.checkout.created'",
    )
    .fetch_one(&ctx.pool)
    .await?;

    assert_eq!(create_count, 1);
    assert_eq!(update_count, 1);
    assert_eq!(checkout_count, 1);

    Ok(())
}
