mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serde_json::json;
use uuid::Uuid;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn csv_file_import_endpoint_should_accept_multipart_file() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let boundary = "xaminaBoundary";
    let csv = "name,email,class_name,password\nSiswa Import,siswa-import@test.local,X IPA 1,Password123!\n";
    let body = format!(
        "--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"users.csv\"\r\nContent-Type: text/csv\r\n\r\n{csv}\r\n--{b}--\r\n",
        b = boundary,
        csv = csv
    );

    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/users/import-csv-file")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))?;

    let (status, payload) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(payload["success"], true);
    assert!(payload["data"]["inserted"].as_u64().unwrap_or(0) >= 1);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn class_delete_or_deactivate_should_fail_when_class_in_use() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let class_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO classes (id, tenant_id, name, grade, major, is_active)
         VALUES ($1, $2, 'X IPA 9', 'X', 'IPA', TRUE)",
    )
    .bind(class_id)
    .bind(ctx.tenant_id)
    .execute(&ctx.pool)
    .await?;

    sqlx::query(
        "INSERT INTO users (id, tenant_id, email, password_hash, name, role, class_id, is_active)
         VALUES ($1, $2, 'siswa-kelas@test.local', 'Password123!', 'Siswa Kelas', 'siswa', $3, TRUE)",
    )
    .bind(Uuid::new_v4())
    .bind(ctx.tenant_id)
    .bind(class_id)
    .execute(&ctx.pool)
    .await?;

    let patch_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/classes/{class_id}"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .header("content-type", "application/json")
        .body(Body::from(json!({"is_active": false}).to_string()))?;
    let (patch_status, patch_body) = ctx.request_json(patch_req).await;
    assert_eq!(patch_status, StatusCode::BAD_REQUEST);
    assert_eq!(patch_body["error"]["code"], "CLASS_IN_USE");

    let delete_req = Request::builder()
        .method(Method::DELETE)
        .uri(format!("/api/v1/classes/{class_id}"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (delete_status, delete_body) = ctx.request_json(delete_req).await;
    assert_eq!(delete_status, StatusCode::BAD_REQUEST);
    assert_eq!(delete_body["error"]["code"], "CLASS_IN_USE");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn csv_file_import_endpoint_should_reject_non_post_method() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/users/import-csv-file")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;

    let (status, _payload) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);

    Ok(())
}
