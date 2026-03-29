mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use pdf_extract::extract_text_from_mem;
use serde_json::json;
use sha2::{Digest, Sha512};
use tower::ServiceExt;

use common::setup_test_ctx;

fn sign_midtrans(
    order_id: &str,
    status_code: &str,
    gross_amount: &str,
    server_key: &str,
) -> String {
    let digest =
        Sha512::digest(format!("{order_id}{status_code}{gross_amount}{server_key}").as_bytes());
    format!("{digest:x}")
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_public_plans_should_be_accessible_without_auth() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/billing/plans")
        .body(Body::empty())?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"].as_array().map(|items| items.len()), Some(3));
    assert_eq!(body["data"][0]["code"], "starter");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_checkout_should_create_mock_session() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
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
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["gateway_mode"], "mock");
    assert_eq!(body["data"]["invoice"]["plan_code"], "starter");
    assert!(body["data"]["checkout_url"]
        .as_str()
        .unwrap_or_default()
        .contains("mock-billing.local"));

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_admin_scope_should_use_authenticated_tenant() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let summary_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/billing/summary")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (summary_status, summary_body) = ctx.request_json(summary_req).await;
    assert_eq!(summary_status, StatusCode::OK);
    assert_eq!(summary_body["data"]["tenant_id"], ctx.tenant_id.to_string());
    assert_eq!(
        summary_body["data"]["available_plans"]
            .as_array()
            .map(|items| items.len()),
        Some(3)
    );

    let create_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/billing/checkout")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "plan_code": "starter" }).to_string()))?;
    let (create_status, create_body) = ctx.request_json(create_req).await;
    assert_eq!(create_status, StatusCode::OK);
    assert_eq!(create_body["data"]["gateway_mode"], "mock");
    let invoice_id = create_body["data"]["invoice"]["id"]
        .as_str()
        .unwrap_or_default();

    let history_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/billing/history?page=1&page_size=10")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (history_status, history_body) = ctx.request_json(history_req).await;
    assert_eq!(history_status, StatusCode::OK);
    assert_eq!(history_body["meta"]["total"], 1);
    assert_eq!(history_body["data"][0]["id"], invoice_id);

    let pdf_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/billing/invoices/{invoice_id}/pdf"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let pdf_res = ctx.app.clone().oneshot(pdf_req).await?;
    assert_eq!(pdf_res.status(), StatusCode::OK);
    assert_eq!(
        pdf_res
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok()),
        Some("application/pdf")
    );
    assert!(
        pdf_res
            .headers()
            .get("content-disposition")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .contains("attachment;")
    );
    let pdf_bytes = axum::body::to_bytes(pdf_res.into_body(), 1024 * 1024).await?;
    assert!(pdf_bytes.len() > 100);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_scope_guards_should_reject_wrong_roles() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    for (user_id, role) in [
        (ctx.guru_id, "guru"),
        (ctx.siswa_id, "siswa"),
        (ctx.super_admin_id, "super_admin"),
    ] {
        let req = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/billing/summary")
            .header("authorization", ctx.bearer_for(user_id, role))
            .body(Body::empty())?;
        let (status, body) = ctx.request_json(req).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "FORBIDDEN");
    }

    let platform_req = Request::builder()
        .method(Method::GET)
        .uri(format!(
            "/api/v1/platform/tenants/{}/billing/summary",
            ctx.tenant_id
        ))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (platform_status, platform_body) = ctx.request_json(platform_req).await;
    assert_eq!(platform_status, StatusCode::FORBIDDEN);
    assert_eq!(platform_body["error"]["code"], "FORBIDDEN");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_webhook_should_reject_invalid_signature() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let order_id = "INV-TEST-INVALID";
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/billing/midtrans/webhook")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "order_id": order_id,
                "status_code": "200",
                "gross_amount": "299000",
                "transaction_status": "settlement",
                "signature_key": "bad-signature"
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["code"], "INVALID_SIGNATURE");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_webhook_should_be_idempotent() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_req = Request::builder()
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
    let (create_status, create_body) = ctx.request_json(create_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let order_id = create_body["data"]["invoice"]["provider_ref"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let gross_amount = create_body["data"]["invoice"]["amount"].to_string();
    let signature = sign_midtrans(&order_id, "200", &gross_amount, "test-midtrans-secret");
    let payload = json!({
        "order_id": order_id,
        "status_code": "200",
        "gross_amount": gross_amount,
        "transaction_status": "settlement",
        "fraud_status": "accept",
        "signature_key": signature,
    });

    let webhook_req_1 = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/billing/midtrans/webhook")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))?;
    let (status_1, body_1) = ctx.request_json(webhook_req_1).await;
    assert_eq!(status_1, StatusCode::OK);
    assert_eq!(body_1["data"]["already_processed"], false);

    let webhook_req_2 = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/billing/midtrans/webhook")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))?;
    let (status_2, body_2) = ctx.request_json(webhook_req_2).await;
    assert_eq!(status_2, StatusCode::OK);
    assert_eq!(body_2["data"]["already_processed"], true);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_invoice_pdf_endpoint_should_return_pdf() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_req = Request::builder()
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
    let (create_status, create_body) = ctx.request_json(create_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let invoice_id = create_body["data"]["invoice"]["id"]
        .as_str()
        .unwrap_or_default();

    let req = Request::builder()
        .method(Method::GET)
        .uri(format!(
            "/api/v1/platform/tenants/{}/billing/invoices/{}/pdf",
            ctx.tenant_id, invoice_id
        ))
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .body(Body::empty())?;
    let res = ctx.app.clone().oneshot(req).await?;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok()),
        Some("application/pdf")
    );
    let bytes = axum::body::to_bytes(res.into_body(), 2 * 1024 * 1024).await?;
    assert!(bytes.len() > 200);
    let text = extract_text_from_mem(bytes.as_ref())?;
    assert!(text.contains("Xamina Billing Invoice"));
    assert!(text.contains("Test School"));
    assert!(text.contains("Checkout URL:"));
    assert!(text.contains("Pending Payment"));
    assert!(text.contains("Invoice No:"));

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_invoice_pdf_should_refresh_after_webhook() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_req = Request::builder()
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
    let (create_status, create_body) = ctx.request_json(create_req).await;
    assert_eq!(create_status, StatusCode::OK);

    let invoice_id = create_body["data"]["invoice"]["id"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let order_id = create_body["data"]["invoice"]["provider_ref"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let gross_amount = create_body["data"]["invoice"]["amount"].to_string();
    let signature = sign_midtrans(&order_id, "200", &gross_amount, "test-midtrans-secret");

    let webhook_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/billing/midtrans/webhook")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "order_id": order_id,
                "status_code": "200",
                "gross_amount": gross_amount,
                "transaction_status": "settlement",
                "fraud_status": "accept",
                "signature_key": signature,
            })
            .to_string(),
        ))?;
    let (webhook_status, _) = ctx.request_json(webhook_req).await;
    assert_eq!(webhook_status, StatusCode::OK);

    let pdf_req = Request::builder()
        .method(Method::GET)
        .uri(format!(
            "/api/v1/platform/tenants/{}/billing/invoices/{}/pdf",
            ctx.tenant_id, invoice_id
        ))
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .body(Body::empty())?;
    let pdf_res = ctx.app.clone().oneshot(pdf_req).await?;
    assert_eq!(pdf_res.status(), StatusCode::OK);

    let pdf_bytes = axum::body::to_bytes(pdf_res.into_body(), 2 * 1024 * 1024).await?;
    let text = extract_text_from_mem(pdf_bytes.as_ref())?;
    assert!(text.contains("Paid"));
    assert!(text.contains("Paid At:"));
    assert!(text.contains("Payment has been confirmed"));

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_change_plan_should_not_break_active_subscription() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let starter_req = Request::builder()
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
    let (_, starter_body) = ctx.request_json(starter_req).await;
    let order_id = starter_body["data"]["invoice"]["provider_ref"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let gross_amount = starter_body["data"]["invoice"]["amount"].to_string();
    let signature = sign_midtrans(&order_id, "200", &gross_amount, "test-midtrans-secret");

    let webhook_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/billing/midtrans/webhook")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "order_id": order_id,
                "status_code": "200",
                "gross_amount": gross_amount,
                "transaction_status": "settlement",
                "fraud_status": "accept",
                "signature_key": signature,
            })
            .to_string(),
        ))?;
    let (webhook_status, _) = ctx.request_json(webhook_req).await;
    assert_eq!(webhook_status, StatusCode::OK);

    let change_req = Request::builder()
        .method(Method::POST)
        .uri(format!(
            "/api/v1/platform/tenants/{}/billing/change-plan",
            ctx.tenant_id
        ))
        .header(
            "authorization",
            ctx.bearer_for(ctx.super_admin_id, "super_admin"),
        )
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "plan_code": "professional" }).to_string(),
        ))?;
    let (change_status, change_body) = ctx.request_json(change_req).await;
    assert_eq!(change_status, StatusCode::OK);
    assert_eq!(change_body["data"]["invoice"]["plan_code"], "professional");
    assert_eq!(
        change_body["data"]["current_subscription"]["plan_code"],
        "starter"
    );
    assert_eq!(
        change_body["data"]["current_subscription"]["status"],
        "active"
    );

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn billing_dunning_cycle_should_increment_attempts_and_enqueue_notifications(
) -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_req = Request::builder()
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
    let (create_status, create_body) = ctx.request_json(create_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let invoice_id = create_body["data"]["invoice"]["id"]
        .as_str()
        .unwrap_or_default();

    sqlx::query(
        "UPDATE billing_invoices SET due_at = NOW() - INTERVAL '1 day', checkout_url = 'https://mock-billing.local/checkout/test' WHERE id = $1::uuid",
    )
    .bind(invoice_id)
    .execute(&ctx.pool)
    .await?;

    let processed = ctx
        .services
        .billing
        .process_dunning_cycle(3)
        .await
        .map_err(|err| anyhow::anyhow!(err.message))?;
    assert_eq!(processed, 1);

    let attempt_count: i32 =
        sqlx::query_scalar("SELECT attempt_count FROM billing_invoices WHERE id = $1::uuid")
            .bind(invoice_id)
            .fetch_one(&ctx.pool)
            .await?;
    assert_eq!(attempt_count, 1);

    let notifications: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications WHERE tenant_id = $1 AND type = 'billing_invoice_due'",
    )
    .bind(ctx.tenant_id)
    .fetch_one(&ctx.pool)
    .await?;
    assert!(notifications >= 1);

    let email_jobs: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM email_jobs WHERE tenant_id = $1")
            .bind(ctx.tenant_id)
            .fetch_one(&ctx.pool)
            .await?;
    assert!(email_jobs >= 1);

    Ok(())
}
