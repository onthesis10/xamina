use api::middleware::auth::Claims;
use axum::http::Request;
use chrono::{Duration as ChronoDuration, Utc};
use common::{setup_test_ctx, TestCtx};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

mod common;

#[tokio::test]
async fn test_tenant_isolation_reads() {
    let Some(ctx) = setup_test_ctx().await.expect("setup") else {
        return;
    };

    // 1. Setup Tenant B
    let tenant_b_id = Uuid::new_v4();
    sqlx::query("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant B', 'tenant-b')")
        .bind(tenant_b_id)
        .execute(&ctx.pool)
        .await
        .expect("insert tenant b");

    // Seed User for Tenant B
    let user_b_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, tenant_id, email, password_hash, name, role) 
         VALUES ($1, $2, 'userb@test.local', 'pass', 'User B', 'guru')",
    )
    .bind(user_b_id)
    .bind(tenant_b_id)
    .execute(&ctx.pool)
    .await
    .expect("insert user b");

    // Seed Class for Tenant B
    let class_b_id: Uuid = Uuid::new_v4(); // we don't strictly need to know id, just insert
    sqlx::query(
        "INSERT INTO classes (id, tenant_id, name, level, academic_year)
         VALUES ($1, $2, 'Kelas Tenant B', '10', '2023/2024') RETURNING id",
    )
    .bind(class_b_id)
    .bind(tenant_b_id)
    .fetch_one(&ctx.pool)
    .await
    .expect("insert class b");

    // 2. Setup Tenant A (Main Context)
    let token_a = ctx.bearer_for(ctx.admin_id, "admin");

    // 3. User Tenant A reads classes
    let req = Request::builder()
        .uri("/api/v1/classes")
        .header("Authorization", &token_a)
        .body(axum::body::Body::empty())
        .unwrap();

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, 200, "Get classes should succeed for A");

    let classes = body["data"].as_array().expect("data array");
    // Ensure "Kelas Tenant B" is NOT in the response
    for c in classes {
        assert_ne!(
            c["name"].as_str().unwrap_or(""),
            "Kelas Tenant B",
            "Tenant A should not see Tenant B classes"
        );
    }
}

#[tokio::test]
async fn test_tenant_quota_enforcement() {
    let Some(ctx) = setup_test_ctx().await.expect("setup") else {
        return;
    };

    // 1. Limit Tenant A quota to 3 (currently has 3 users initially in setup_test_ctx)
    sqlx::query("UPDATE tenants SET users_quota = 3 WHERE id = $1")
        .bind(ctx.tenant_id)
        .execute(&ctx.pool)
        .await
        .expect("update quota");

    let token_a = ctx.bearer_for(ctx.admin_id, "admin");

    // 2. Try to create 4th user via API, should fail
    let req = Request::builder()
        .uri("/api/v1/users")
        .method("POST")
        .header("Authorization", &token_a)
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(
            json!({
                "name": "User 4",
                "email": "user4@test.local",
                "password": "Password123!",
                "role": "siswa"
            })
            .to_string(),
        ))
        .unwrap();

    let (status, body) = ctx.request_json(req).await;
    assert_eq!(
        status, 403,
        "Creating user above quota should return 400/403: {}",
        body
    );

    // Verify error message roughly matches quota
    let err_msg = body["error"].as_str().unwrap_or("");
    assert!(
        err_msg.to_lowercase().contains("quota") || err_msg.to_lowercase().contains("limit"),
        "Error should mention quota"
    );
}

#[tokio::test]
async fn test_superadmin_tenant_switcher_guard() {
    let Some(ctx) = setup_test_ctx().await.expect("setup") else {
        return;
    };

    // Setup Tenant C
    let tenant_c_id = Uuid::new_v4();
    sqlx::query("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Tenant C', 'tenant-c')")
        .bind(tenant_c_id)
        .execute(&ctx.pool)
        .await
        .expect("insert tenant c");

    sqlx::query(
        "INSERT INTO classes (tenant_id, name, level, academic_year)
         VALUES ($1, 'SClass', '10', '2023/2024')",
    )
    .bind(tenant_c_id)
    .execute(&ctx.pool)
    .await
    .expect("insert class c");

    // Scenario 1: Non-SuperAdmin tries to switch -> Should be ignored / fail to see Tenant C class
    let token_admin_a = ctx.bearer_for(ctx.admin_id, "admin");
    let req1 = Request::builder()
        .uri("/api/v1/classes")
        .header("Authorization", &token_admin_a)
        .header("X-Tenant-Id", tenant_c_id.to_string())
        .body(axum::body::Body::empty())
        .unwrap();

    let (status1, body1) = ctx.request_json(req1).await;
    assert_eq!(status1, 200);

    let classes1 = body1["data"].as_array().expect("data array");
    let found_c = classes1
        .iter()
        .any(|c| c["name"].as_str().unwrap_or("") == "SClass");
    assert!(
        !found_c,
        "Normal admin should NOT be able to switch to Tenant C via header"
    );

    // Scenario 2: SuperAdmin tries to switch -> Should succeed
    // We haven't created superadmin in TestCtx defaults, let's create one dynamically
    let sa_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, tenant_id, email, password_hash, name, role) 
         VALUES ($1, $2, 'sa@test.local', 'pass', 'SA', 'super_admin')",
    )
    .bind(sa_id)
    .bind(ctx.tenant_id) // SA still technically belongs to default tenant initially
    .execute(&ctx.pool)
    .await
    .expect("insert sa");

    let mut sa_claims = Claims {
        sub: sa_id,
        tenant_id: ctx.tenant_id,
        role: "super_admin".to_string(),
        exp: (Utc::now() + ChronoDuration::hours(1)).timestamp() as usize,
    };
    let token_sa = format!(
        "Bearer {}",
        encode(
            &Header::default(),
            &sa_claims,
            &EncodingKey::from_secret(ctx.jwt_secret.as_bytes())
        )
        .unwrap()
    );

    let req2 = Request::builder()
        .uri("/api/v1/classes")
        .header("Authorization", &token_sa)
        .header("X-Tenant-Id", tenant_c_id.to_string())
        .body(axum::body::Body::empty())
        .unwrap();

    let (status2, body2) = ctx.request_json(req2).await;
    assert_eq!(status2, 200, "SuperAdmin reads classes: {}", body2);

    let classes2 = body2["data"].as_array().expect("data array");
    let found_c_as_sa = classes2
        .iter()
        .any(|c| c["name"].as_str().unwrap_or("") == "SClass");
    assert!(
        found_c_as_sa,
        "SuperAdmin should see SClass after switching tenant context"
    );
}
