mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use serde_json::json;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn publish_should_fail_when_exam_has_no_questions() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Exam No Questions",
                "description": "",
                "duration_minutes": 90,
                "pass_score": 70,
                "shuffle_questions": false,
                "shuffle_options": false,
                "start_at": "2026-03-01T09:00:00Z",
                "end_at": "2026-03-01T10:00:00Z"
            })
            .to_string(),
        ))?;

    let (status, created) = ctx.request_json(create_exam_req).await;
    assert_eq!(status, StatusCode::OK);
    let exam_id = created["data"]["id"].as_str().expect("exam id");

    let publish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;

    let (publish_status, publish_body) = ctx.request_json(publish_req).await;
    assert_eq!(publish_status, StatusCode::BAD_REQUEST);
    assert_eq!(publish_body["error"]["code"], "PUBLISH_FAILED");
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn create_exam_should_fail_when_start_at_greater_or_equal_end_at() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Invalid Schedule",
                "duration_minutes": 90,
                "start_at": "2026-03-01T10:00:00Z",
                "end_at": "2026-03-01T10:00:00Z"
            })
            .to_string(),
        ))?;

    let (status, body) = ctx.request_json(create_exam_req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn create_exam_should_fail_when_schedule_is_partial() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Partial Schedule",
                "duration_minutes": 90,
                "start_at": "2026-03-01T10:00:00Z"
            })
            .to_string(),
        ))?;

    let (status, body) = ctx.request_json(create_exam_req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");
    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn publish_should_fail_for_overlapping_schedule() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_question_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "type": "short_answer",
                "content": "Apa ibu kota Indonesia?",
                "options_jsonb": [],
                "answer_key": "Jakarta",
                "topic": "Geography",
                "difficulty": "easy"
            })
            .to_string(),
        ))?;

    let (q_status, q_body) = ctx.request_json(create_question_req).await;
    assert_eq!(q_status, StatusCode::OK);
    let question_id = q_body["data"]["id"].as_str().expect("question id");

    let exam1_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Exam 1",
                "duration_minutes": 60,
                "start_at": "2026-04-01T09:00:00Z",
                "end_at": "2026-04-01T10:00:00Z"
            })
            .to_string(),
        ))?;
    let (_, exam1_body) = ctx.request_json(exam1_req).await;
    let exam1_id = exam1_body["data"]["id"].as_str().expect("exam1 id");

    let attach1_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam1_id}/questions"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [question_id] }).to_string(),
        ))?;
    let (attach1_status, _) = ctx.request_json(attach1_req).await;
    assert_eq!(attach1_status, StatusCode::OK);

    let publish1_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam1_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (publish1_status, _) = ctx.request_json(publish1_req).await;
    assert_eq!(publish1_status, StatusCode::OK);

    let exam2_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Exam 2",
                "duration_minutes": 60,
                "start_at": "2026-04-01T09:30:00Z",
                "end_at": "2026-04-01T10:30:00Z"
            })
            .to_string(),
        ))?;
    let (_, exam2_body) = ctx.request_json(exam2_req).await;
    let exam2_id = exam2_body["data"]["id"].as_str().expect("exam2 id");

    let attach2_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam2_id}/questions"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [question_id] }).to_string(),
        ))?;
    let _ = ctx.request_json(attach2_req).await;

    let precheck_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/exams/{exam2_id}/publish-precheck"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (precheck_status, precheck_body) = ctx.request_json(precheck_req).await;
    assert_eq!(precheck_status, StatusCode::OK);
    assert_eq!(precheck_body["data"]["publishable"], false);
    assert!(precheck_body["data"]["issues"]
        .as_array()
        .expect("issues array")
        .iter()
        .any(|issue| {
            issue["code"] == "SCHEDULE_CONFLICT"
                && issue["details"]["conflicting_exams"]
                    .as_array()
                    .map(|items| !items.is_empty())
                    .unwrap_or(false)
        }));

    let publish2_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam2_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (publish2_status, publish2_body) = ctx.request_json(publish2_req).await;
    assert_eq!(publish2_status, StatusCode::BAD_REQUEST);
    assert_eq!(publish2_body["error"]["code"], "PUBLISH_FAILED");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn unpublish_should_move_exam_back_to_draft() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_question_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "type": "short_answer",
                "content": "Planet terbesar di tata surya?",
                "options_jsonb": [],
                "answer_key": "Jupiter",
                "topic": "Science",
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
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Exam Publish-Unpublish",
                "duration_minutes": 60,
                "start_at": "2026-07-01T09:00:00Z",
                "end_at": "2026-07-01T10:00:00Z"
            })
            .to_string(),
        ))?;
    let (create_status, create_body) = ctx.request_json(create_exam_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let exam_id = create_body["data"]["id"].as_str().expect("exam id");

    let attach_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/questions"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [question_id] }).to_string(),
        ))?;
    let (attach_status, _) = ctx.request_json(attach_req).await;
    assert_eq!(attach_status, StatusCode::OK);

    let publish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (publish_status, publish_body) = ctx.request_json(publish_req).await;
    assert_eq!(publish_status, StatusCode::OK);
    assert_eq!(publish_body["data"]["status"], "published");

    let unpublish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/unpublish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (unpublish_status, unpublish_body) = ctx.request_json(unpublish_req).await;
    assert_eq!(unpublish_status, StatusCode::OK);
    assert_eq!(unpublish_body["data"]["status"], "draft");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn publish_precheck_should_report_missing_questions() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Precheck Exam",
                "duration_minutes": 60,
                "start_at": "2026-08-01T09:00:00Z",
                "end_at": "2026-08-01T10:00:00Z"
            })
            .to_string(),
        ))?;
    let (create_status, create_body) = ctx.request_json(create_exam_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let exam_id = create_body["data"]["id"].as_str().expect("exam id");

    let precheck_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/exams/{exam_id}/publish-precheck"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (precheck_status, precheck_body) = ctx.request_json(precheck_req).await;
    assert_eq!(precheck_status, StatusCode::OK);
    assert_eq!(precheck_body["data"]["publishable"], false);
    assert_eq!(precheck_body["data"]["question_count"], 0);
    assert_eq!(precheck_body["data"]["issues"][0]["code"], "NO_QUESTIONS");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn publish_precheck_should_report_schedule_required_when_schedule_missing(
) -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Precheck Missing Schedule",
                "duration_minutes": 60
            })
            .to_string(),
        ))?;
    let (create_status, create_body) = ctx.request_json(create_exam_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let exam_id = create_body["data"]["id"].as_str().expect("exam id");

    let precheck_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/exams/{exam_id}/publish-precheck"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (precheck_status, precheck_body) = ctx.request_json(precheck_req).await;
    assert_eq!(precheck_status, StatusCode::OK);
    assert_eq!(precheck_body["data"]["publishable"], false);
    assert!(precheck_body["data"]["issues"]
        .as_array()
        .expect("issues array")
        .iter()
        .any(|issue| issue["code"] == "SCHEDULE_REQUIRED"));

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn publish_should_fail_when_schedule_missing() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let question_id = create_short_answer_question(&ctx, "Publish Missing Schedule").await?;

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": "Publish Missing Schedule",
                "duration_minutes": 60
            })
            .to_string(),
        ))?;
    let (create_status, create_body) = ctx.request_json(create_exam_req).await;
    assert_eq!(create_status, StatusCode::OK);
    let exam_id = create_body["data"]["id"].as_str().expect("exam id");

    let attach_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/questions"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [question_id] }).to_string(),
        ))?;
    let (attach_status, _) = ctx.request_json(attach_req).await;
    assert_eq!(attach_status, StatusCode::OK);

    let publish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (publish_status, publish_body) = ctx.request_json(publish_req).await;
    assert_eq!(publish_status, StatusCode::BAD_REQUEST);
    assert_eq!(publish_body["error"]["code"], "PUBLISH_FAILED");
    assert!(publish_body["error"]["details"]["precheck"]["issues"]
        .as_array()
        .expect("precheck issues array")
        .iter()
        .any(|issue| issue["code"] == "SCHEDULE_REQUIRED"));

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn reorder_questions_should_succeed_for_draft_exam() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let q1 = create_short_answer_question(&ctx, "Q1").await?;
    let q2 = create_short_answer_question(&ctx, "Q2").await?;
    let q3 = create_short_answer_question(&ctx, "Q3").await?;
    let exam_id = create_exam(&ctx, "Reorder Draft").await?;
    attach_questions(
        &ctx,
        exam_id.as_str(),
        &[q1.as_str(), q2.as_str(), q3.as_str()],
    )
    .await?;

    let reorder_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/exams/{exam_id}/questions/reorder"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [q3.clone(), q1.clone(), q2.clone()] }).to_string(),
        ))?;
    let (reorder_status, reorder_body) = ctx.request_json(reorder_req).await;
    assert_eq!(reorder_status, StatusCode::OK);
    assert_eq!(reorder_body["data"]["questions"][0]["order_no"], 1);
    assert_eq!(reorder_body["data"]["questions"][0]["question_id"], q3);

    let exam_detail_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/exams/{exam_id}"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (detail_status, detail_body) = ctx.request_json(exam_detail_req).await;
    assert_eq!(detail_status, StatusCode::OK);
    assert_eq!(detail_body["data"]["questions"][0]["question_id"], q3);
    assert_eq!(detail_body["data"]["questions"][1]["question_id"], q1);
    assert_eq!(detail_body["data"]["questions"][2]["question_id"], q2);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn reorder_questions_should_fail_for_published_exam() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let q1 = create_short_answer_question(&ctx, "P1").await?;
    let q2 = create_short_answer_question(&ctx, "P2").await?;
    let exam_id = create_exam(&ctx, "Reorder Published").await?;
    attach_questions(&ctx, exam_id.as_str(), &[q1.as_str(), q2.as_str()]).await?;
    publish_exam(&ctx, exam_id.as_str()).await?;

    let reorder_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/exams/{exam_id}/questions/reorder"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [q2.clone(), q1.clone()] }).to_string(),
        ))?;
    let (status, body) = ctx.request_json(reorder_req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn reorder_questions_should_fail_for_mismatched_set() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let q1 = create_short_answer_question(&ctx, "M1").await?;
    let q2 = create_short_answer_question(&ctx, "M2").await?;
    let exam_id = create_exam(&ctx, "Reorder Mismatch").await?;
    attach_questions(&ctx, exam_id.as_str(), &[q1.as_str(), q2.as_str()]).await?;

    let reorder_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/exams/{exam_id}/questions/reorder"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [q1.clone()] }).to_string(),
        ))?;
    let (status, body) = ctx.request_json(reorder_req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn reorder_questions_should_fail_for_duplicate_ids() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };
    let q1 = create_short_answer_question(&ctx, "D1").await?;
    let q2 = create_short_answer_question(&ctx, "D2").await?;
    let exam_id = create_exam(&ctx, "Reorder Duplicate").await?;
    attach_questions(&ctx, exam_id.as_str(), &[q1.as_str(), q2.as_str()]).await?;

    let reorder_req = Request::builder()
        .method(Method::PATCH)
        .uri(format!("/api/v1/exams/{exam_id}/questions/reorder"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [q1.clone(), q1.clone()] }).to_string(),
        ))?;
    let (status, body) = ctx.request_json(reorder_req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn siswa_role_must_not_publish_exam() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let create_exam_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .body(Body::from(
            json!({
                "title": "Role Check Exam",
                "duration_minutes": 45,
                "start_at": "2026-05-01T09:00:00Z",
                "end_at": "2026-05-01T09:45:00Z"
            })
            .to_string(),
        ))?;

    let (_, created) = ctx.request_json(create_exam_req).await;
    let exam_id = created["data"]["id"].as_str().expect("exam id");

    let publish_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;

    let (status, body) = ctx.request_json(publish_req).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["error"]["code"], "FORBIDDEN");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn detach_should_fail_for_published_exam() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let question_id = create_short_answer_question(&ctx, "Detach Published").await?;
    let exam_id = create_exam(&ctx, "Detach Published Exam").await?;
    attach_questions(&ctx, exam_id.as_str(), &[question_id.as_str()]).await?;
    publish_exam(&ctx, exam_id.as_str()).await?;

    let detach_req = Request::builder()
        .method(Method::DELETE)
        .uri(format!("/api/v1/exams/{exam_id}/questions/{question_id}"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (status, body) = ctx.request_json(detach_req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "ATTACH_FAILED");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn detach_should_fail_when_question_not_attached() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let question_id = create_short_answer_question(&ctx, "Detach Missing Attach").await?;
    let exam_id = create_exam(&ctx, "Detach Missing Attach Exam").await?;

    let detach_req = Request::builder()
        .method(Method::DELETE)
        .uri(format!("/api/v1/exams/{exam_id}/questions/{question_id}"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (status, body) = ctx.request_json(detach_req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"]["code"], "VALIDATION_ERROR");

    Ok(())
}

async fn create_short_answer_question(
    ctx: &common::TestCtx,
    content: &str,
) -> anyhow::Result<String> {
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "type": "short_answer",
                "content": content,
                "options_jsonb": [],
                "answer_key": "OK",
                "topic": "General",
                "difficulty": "easy"
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"]
        .as_str()
        .expect("question id")
        .to_string())
}

async fn create_exam(ctx: &common::TestCtx, title: &str) -> anyhow::Result<String> {
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": title,
                "duration_minutes": 60,
                "start_at": "2026-09-01T09:00:00Z",
                "end_at": "2026-09-01T10:00:00Z"
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"].as_str().expect("exam id").to_string())
}

async fn attach_questions(
    ctx: &common::TestCtx,
    exam_id: &str,
    question_ids: &[&str],
) -> anyhow::Result<()> {
    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/questions"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": question_ids }).to_string(),
        ))?;
    let (status, _) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    Ok(())
}

async fn publish_exam(ctx: &common::TestCtx, exam_id: &str) -> anyhow::Result<()> {
    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/publish"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (status, _) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    Ok(())
}
