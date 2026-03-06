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
async fn question_exam_crud_and_unpublish_flow() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_question_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::from(
            json!({
                "type": "multiple_choice",
                "content": "2 + 2 = ?",
                "options_jsonb": [{"id":"A","label":"3"}, {"id":"B","label":"4"}],
                "answer_key": "B",
                "topic": "Math",
                "difficulty": "easy"
            })
            .to_string(),
        ))?;

    let (q_status, q_body) = ctx.request_json(create_question_req).await;
    assert_eq!(q_status, StatusCode::OK);
    let question_id = q_body["data"]["id"].as_str().expect("question id");

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::from(
            json!({
                "title": "Math Exam",
                "duration_minutes": 60,
                "start_at": "2026-06-01T08:00:00Z",
                "end_at": "2026-06-01T09:00:00Z"
            })
            .to_string(),
        ))?;

    let (e_status, e_body) = ctx.request_json(create_exam_req).await;
    assert_eq!(e_status, StatusCode::OK);
    let exam_id = e_body["data"]["id"].as_str().expect("exam id");

    let attach_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/questions"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::from(
            json!({ "question_ids": [question_id] }).to_string(),
        ))?;
    let (attach_status, _) = ctx.request_json(attach_req).await;
    assert_eq!(attach_status, StatusCode::OK);

    let publish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (publish_status, publish_body) = ctx.request_json(publish_req).await;
    assert_eq!(publish_status, StatusCode::OK);
    assert_eq!(publish_body["data"]["status"], "published");

    let update_while_published_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/exams/{exam_id}"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::from(
            json!({
                "title": "Math Exam Updated",
                "duration_minutes": 60,
                "start_at": "2026-06-01T08:00:00Z",
                "end_at": "2026-06-01T09:00:00Z"
            })
            .to_string(),
        ))?;
    let (update_status, _) = ctx.request_json(update_while_published_req).await;
    assert_eq!(update_status, StatusCode::BAD_REQUEST);

    let unpublish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/unpublish"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (unpublish_status, unpublish_body) = ctx.request_json(unpublish_req).await;
    assert_eq!(unpublish_status, StatusCode::OK);
    assert_eq!(unpublish_body["data"]["status"], "draft");

    let detach_req = Request::builder()
        .method(Method::DELETE)
        .uri(format!("/api/v1/exams/{exam_id}/questions/{question_id}"))
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::empty())?;
    let (detach_status, _) = ctx.request_json(detach_req).await;
    assert_eq!(detach_status, StatusCode::OK);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn question_crud_filter_pagination_and_bulk_delete_partial() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let admin_auth = ctx.bearer_for(ctx.admin_id, "admin");

    let q1_id = create_question(
        &ctx,
        &admin_auth,
        json!({
            "type": "multiple_choice",
            "content": "Ibu kota Indonesia adalah?",
            "options_jsonb": [{"id":"A","label":"Bandung"}, {"id":"B","label":"Jakarta"}],
            "answer_key": "B",
            "topic": "Geography",
            "difficulty": "easy"
        }),
    )
    .await?;

    let q2_id = create_question(
        &ctx,
        &admin_auth,
        json!({
            "type": "true_false",
            "content": "Bumi datar.",
            "options_jsonb": [{"value": true}, {"value": false}],
            "answer_key": false,
            "topic": "Science",
            "difficulty": "easy"
        }),
    )
    .await?;

    let q3_id = create_question(
        &ctx,
        &admin_auth,
        json!({
            "type": "short_answer",
            "content": "Sebutkan bilangan prima terkecil",
            "options_jsonb": [],
            "answer_key": "2",
            "topic": "Math",
            "difficulty": "medium"
        }),
    )
    .await?;

    let list_page_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/questions?page=1&page_size=2")
        .header("authorization", &admin_auth)
        .body(Body::empty())?;
    let (list_page_status, list_page_body) = ctx.request_json(list_page_req).await;
    assert_eq!(list_page_status, StatusCode::OK);
    assert_eq!(list_page_body["meta"]["page"], 1);
    assert_eq!(list_page_body["meta"]["page_size"], 2);
    assert!(list_page_body["meta"]["total"].as_i64().unwrap_or(0) >= 3);
    assert!(
        list_page_body["data"]
            .as_array()
            .map(|v| v.len())
            .unwrap_or(0)
            <= 2
    );

    let filter_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/questions?type=multiple_choice&topic=Geography&difficulty=easy&search=Ibu%20kota")
        .header("authorization", &admin_auth)
        .body(Body::empty())?;
    let (filter_status, filter_body) = ctx.request_json(filter_req).await;
    assert_eq!(filter_status, StatusCode::OK);
    assert_eq!(filter_body["meta"]["total"], 1);
    assert_eq!(filter_body["data"][0]["id"], q1_id);

    let get_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/questions/{q3_id}"))
        .header("authorization", &admin_auth)
        .body(Body::empty())?;
    let (get_status, get_body) = ctx.request_json(get_req).await;
    assert_eq!(get_status, StatusCode::OK);
    assert_eq!(
        get_body["data"]["content"],
        "Sebutkan bilangan prima terkecil"
    );

    let update_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/questions/{q3_id}"))
        .header("content-type", "application/json")
        .header("authorization", &admin_auth)
        .body(Body::from(
            json!({
                "type": "short_answer",
                "content": "Sebutkan bilangan prima terkecil (updated)",
                "options_jsonb": [],
                "answer_key": "2",
                "topic": "Math",
                "difficulty": "easy",
                "is_active": true
            })
            .to_string(),
        ))?;
    let (update_status, update_body) = ctx.request_json(update_req).await;
    assert_eq!(update_status, StatusCode::OK);
    assert_eq!(update_body["data"]["difficulty"], "easy");
    assert_eq!(
        update_body["data"]["content"],
        "Sebutkan bilangan prima terkecil (updated)"
    );

    let bulk_delete_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions/bulk-delete")
        .header("content-type", "application/json")
        .header("authorization", &admin_auth)
        .body(Body::from(
            json!({
                "ids": [q1_id, Uuid::new_v4()]
            })
            .to_string(),
        ))?;
    let (bulk_status, bulk_body) = ctx.request_json(bulk_delete_req).await;
    assert_eq!(bulk_status, StatusCode::OK);
    assert_eq!(bulk_body["data"]["deleted_count"], 1);

    let delete_req = Request::builder()
        .method(Method::DELETE)
        .uri(format!("/api/v1/questions/{q2_id}"))
        .header("authorization", &admin_auth)
        .body(Body::empty())?;
    let (delete_status, _) = ctx.request_json(delete_req).await;
    assert_eq!(delete_status, StatusCode::OK);

    let get_deleted_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/questions/{q2_id}"))
        .header("authorization", &admin_auth)
        .body(Body::empty())?;
    let (get_deleted_status, get_deleted_body) = ctx.request_json(get_deleted_req).await;
    assert_eq!(get_deleted_status, StatusCode::NOT_FOUND);
    assert_eq!(get_deleted_body["error"]["code"], "NOT_FOUND");

    Ok(())
}

async fn create_question(
    ctx: &common::TestCtx,
    bearer: &str,
    payload: serde_json::Value,
) -> anyhow::Result<String> {
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("content-type", "application/json")
        .header("authorization", bearer)
        .body(Body::from(payload.to_string()))?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"]
        .as_str()
        .expect("question id should be present")
        .to_string())
}
