mod common;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use redis::AsyncCommands;
use serde_json::json;
use uuid::Uuid;

use api::middleware::auth::Claims;
use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn siswa_can_start_resume_and_single_attempt_is_enforced() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_three_types(&ctx).await?;

    let start_req_1 = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (start_status_1, start_body_1) = ctx.request_json(start_req_1).await;
    assert_eq!(start_status_1, StatusCode::OK);
    assert_eq!(start_body_1["data"]["resumed"], false);
    let submission_id = start_body_1["data"]["submission_id"]
        .as_str()
        .expect("submission_id")
        .to_string();

    let start_req_2 = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (start_status_2, start_body_2) = ctx.request_json(start_req_2).await;
    assert_eq!(start_status_2, StatusCode::OK);
    assert_eq!(start_body_2["data"]["resumed"], true);
    assert_eq!(start_body_2["data"]["submission_id"], submission_id);

    finish_submission_with_correct_answers(&ctx, &submission_id).await?;

    let start_req_3 = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (start_status_3, start_body_3) = ctx.request_json(start_req_3).await;
    assert_eq!(start_status_3, StatusCode::BAD_REQUEST);
    assert_eq!(start_body_3["error"]["code"], "ATTEMPT_FINALIZED");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn non_siswa_role_must_not_access_student_session_endpoints() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_three_types(&ctx).await?;

    let start_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (status, body) = ctx.request_json(start_req).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["error"]["code"], "FORBIDDEN");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn answers_and_finish_should_score_mc_tf_sa_exact() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_three_types(&ctx).await?;
    let submission_id = start_submission(&ctx, &exam_id).await?;

    finish_submission_with_correct_answers(&ctx, &submission_id).await?;

    let result_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/submissions/{submission_id}/result"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (result_status, result_body) = ctx.request_json(result_req).await;
    assert_eq!(result_status, StatusCode::OK);
    assert_eq!(result_body["data"]["correct_count"], 3);
    assert_eq!(result_body["data"]["total_questions"], 3);
    assert_eq!(result_body["data"]["score"], 100.0);

    let post_finish_answer_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/answers"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::from(
            json!({
                "question_id": Uuid::new_v4(),
                "answer": "X"
            })
            .to_string(),
        ))?;
    let (post_finish_status, post_finish_body) = ctx.request_json(post_finish_answer_req).await;
    assert_eq!(post_finish_status, StatusCode::BAD_REQUEST);
    assert_eq!(post_finish_body["error"]["code"], "SUBMISSION_FINISHED");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn draft_or_outside_schedule_exam_cannot_be_started() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let question_id = create_question(
        &ctx,
        "multiple_choice",
        "Q draft?",
        json!("A"),
        json!([{"id":"A","label":"A"},{"id":"B","label":"B"}]),
    )
    .await?;
    let now = Utc::now();
    let draft_exam_id = create_exam(
        &ctx,
        "Draft Exam",
        (now - Duration::hours(1)).to_rfc3339(),
        (now + Duration::hours(1)).to_rfc3339(),
    )
    .await?;
    attach_question(&ctx, &draft_exam_id, &question_id).await?;

    let draft_start_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{draft_exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (draft_status, draft_body) = ctx.request_json(draft_start_req).await;
    assert_eq!(draft_status, StatusCode::BAD_REQUEST);
    assert_eq!(draft_body["error"]["code"], "EXAM_NOT_AVAILABLE");

    let question_id_2 = create_question(
        &ctx,
        "multiple_choice",
        "Q time?",
        json!("A"),
        json!([{"id":"A","label":"A"},{"id":"B","label":"B"}]),
    )
    .await?;
    let past_exam_id = create_exam(
        &ctx,
        "Past Published Exam",
        (now - Duration::hours(3)).to_rfc3339(),
        (now - Duration::hours(2)).to_rfc3339(),
    )
    .await?;
    attach_question(&ctx, &past_exam_id, &question_id_2).await?;
    publish_exam(&ctx, &past_exam_id).await?;

    let past_start_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{past_exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (past_status, past_body) = ctx.request_json(past_start_req).await;
    assert_eq!(past_status, StatusCode::BAD_REQUEST);
    assert_eq!(past_body["error"]["code"], "EXAM_NOT_AVAILABLE");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn anomaly_should_be_logged_and_submission_must_be_tenant_isolated() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_three_types(&ctx).await?;
    let submission_id = start_submission(&ctx, &exam_id).await?;

    let anomaly_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/anomalies"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::from(
            json!({
                "event_type": "tab_hidden",
                "payload_jsonb": { "count": 1 }
            })
            .to_string(),
        ))?;
    let (anomaly_status, _) = ctx.request_json(anomaly_req).await;
    assert_eq!(anomaly_status, StatusCode::OK);

    let anomaly_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM submission_anomalies WHERE submission_id = $1",
    )
    .bind(Uuid::parse_str(&submission_id)?)
    .fetch_one(&ctx.pool)
    .await?;
    assert_eq!(anomaly_count, 1);

    let other_tenant = Uuid::new_v4();
    let other_student = Uuid::new_v4();
    sqlx::query("INSERT INTO tenants (id, name, slug, plan, is_active) VALUES ($1, 'Other Tenant', $2, 'starter', TRUE)")
        .bind(other_tenant)
        .bind(format!("other-{}", Uuid::new_v4()))
        .execute(&ctx.pool)
        .await?;
    sqlx::query(
        "INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
         VALUES ($1, $2, $3, 'pw', 'Other Student', 'siswa', TRUE)",
    )
    .bind(other_student)
    .bind(other_tenant)
    .bind(format!("siswa-{}@other.test", Uuid::new_v4()))
    .execute(&ctx.pool)
    .await?;

    let other_bearer = bearer_for(other_student, other_tenant, "siswa", &ctx.jwt_secret)?;
    let isolate_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/submissions/{submission_id}"))
        .header("authorization", other_bearer)
        .body(Body::empty())?;
    let (isolate_status, isolate_body) = ctx.request_json(isolate_req).await;
    assert_eq!(isolate_status, StatusCode::NOT_FOUND);
    assert_eq!(isolate_body["error"]["code"], "NOT_FOUND");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn timer_expiry_should_auto_finish_submission() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_three_types(&ctx).await?;
    let submission_id = start_submission(&ctx, &exam_id).await?;
    let submission_uuid = Uuid::parse_str(&submission_id)?;

    sqlx::query("UPDATE submissions SET deadline_at = NOW() - INTERVAL '1 second' WHERE id = $1")
        .bind(submission_uuid)
        .execute(&ctx.pool)
        .await?;

    let mut redis_conn = redis::Client::open("redis://localhost:56379")?
        .get_multiplexed_async_connection()
        .await?;
    let _: i32 = redis_conn
        .del(vec![
            format!("submission:timer:{submission_id}"),
            format!("submission:timer:{}:{submission_id}", ctx.tenant_id),
        ])
        .await?;

    let get_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/submissions/{submission_id}"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (get_status, get_body) = ctx.request_json(get_req).await;
    assert_eq!(get_status, StatusCode::OK);
    assert_eq!(get_body["data"]["status"], "auto_finished");

    let result_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/submissions/{submission_id}/result"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (result_status, result_body) = ctx.request_json(result_req).await;
    assert_eq!(result_status, StatusCode::OK);
    assert_eq!(result_body["data"]["status"], "auto_finished");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn teacher_can_force_finish_submission_via_rest_fallback() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let exam_id = create_published_exam_with_three_types(&ctx).await?;
    let submission_id = start_submission(&ctx, &exam_id).await?;

    let force_finish_req = Request::builder()
        .method(Method::POST)
        .uri(format!(
            "/api/v1/exams/{exam_id}/submissions/{}/force-finish",
            ctx.siswa_id
        ))
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let (force_status, force_body) = ctx.request_json(force_finish_req).await;
    assert_eq!(force_status, StatusCode::OK);
    assert!(
        force_body["data"]["status"] == "finished"
            || force_body["data"]["status"] == "auto_finished"
    );
    assert_eq!(force_body["data"]["submission_id"], submission_id);

    let result_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/submissions/{submission_id}/result"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (result_status, result_body) = ctx.request_json(result_req).await;
    assert_eq!(result_status, StatusCode::OK);
    assert!(
        result_body["data"]["status"] == "finished"
            || result_body["data"]["status"] == "auto_finished"
    );

    Ok(())
}

fn bearer_for(user_id: Uuid, tenant_id: Uuid, role: &str, secret: &str) -> anyhow::Result<String> {
    let claims = Claims {
        sub: user_id,
        tenant_id,
        role: role.to_string(),
        exp: (Utc::now() + Duration::hours(2)).timestamp() as usize,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(format!("Bearer {token}"))
}

async fn finish_submission_with_correct_answers(
    ctx: &common::TestCtx,
    submission_id: &str,
) -> anyhow::Result<()> {
    let session_req = Request::builder()
        .method(Method::GET)
        .uri(format!("/api/v1/submissions/{submission_id}"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (session_status, session_body) = ctx.request_json(session_req).await;
    assert_eq!(session_status, StatusCode::OK);

    let questions = session_body["data"]["questions"]
        .as_array()
        .expect("questions array");

    let mut payload_answers = Vec::new();
    for q in questions {
        let qid = q["question_id"].as_str().expect("question_id");
        let qtype = q["type"].as_str().expect("type");
        let answer = match qtype {
            "multiple_choice" => json!("B"),
            "true_false" => json!(true),
            "short_answer" => json!("jakarta"),
            _ => json!(null),
        };
        payload_answers.push(json!({
            "question_id": qid,
            "answer": answer,
            "is_bookmarked": false
        }));
    }

    let answer_req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/submissions/{submission_id}/answers"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::from(
            json!({ "answers": payload_answers }).to_string(),
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
    assert_eq!(finish_body["data"]["score"], 100.0);

    Ok(())
}

async fn start_submission(ctx: &common::TestCtx, exam_id: &str) -> anyhow::Result<String> {
    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/start"))
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .body(Body::empty())?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["submission_id"]
        .as_str()
        .expect("submission_id")
        .to_string())
}

async fn create_published_exam_with_three_types(ctx: &common::TestCtx) -> anyhow::Result<String> {
    let q_mc = create_question(
        ctx,
        "multiple_choice",
        "2+2?",
        json!("B"),
        json!([{"id":"A","label":"3"},{"id":"B","label":"4"}]),
    )
    .await?;
    let q_tf = create_question(
        ctx,
        "true_false",
        "Matahari terbit dari timur.",
        json!(true),
        json!([{"value": true}, {"value": false}]),
    )
    .await?;
    let q_sa = create_question(
        ctx,
        "short_answer",
        "Ibu kota Indonesia?",
        json!("Jakarta"),
        json!([]),
    )
    .await?;

    let now = Utc::now();
    let exam_id = create_exam(
        ctx,
        "Session Exam",
        (now - Duration::hours(1)).to_rfc3339(),
        (now + Duration::hours(2)).to_rfc3339(),
    )
    .await?;
    attach_question(ctx, &exam_id, &q_mc).await?;
    attach_question(ctx, &exam_id, &q_tf).await?;
    attach_question(ctx, &exam_id, &q_sa).await?;
    publish_exam(ctx, &exam_id).await?;
    Ok(exam_id)
}

async fn create_question(
    ctx: &common::TestCtx,
    q_type: &str,
    content: &str,
    answer_key: serde_json::Value,
    options_jsonb: serde_json::Value,
) -> anyhow::Result<String> {
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "type": q_type,
                "content": content,
                "options_jsonb": options_jsonb,
                "answer_key": answer_key,
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

async fn create_exam(
    ctx: &common::TestCtx,
    title: &str,
    start_at: String,
    end_at: String,
) -> anyhow::Result<String> {
    let req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/exams")
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({
                "title": title,
                "duration_minutes": 60,
                "start_at": start_at,
                "end_at": end_at,
                "shuffle_questions": true,
                "shuffle_options": true
            })
            .to_string(),
        ))?;
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK);
    Ok(body["data"]["id"].as_str().expect("exam id").to_string())
}

async fn attach_question(
    ctx: &common::TestCtx,
    exam_id: &str,
    question_id: &str,
) -> anyhow::Result<()> {
    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/v1/exams/{exam_id}/questions"))
        .header("content-type", "application/json")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::from(
            json!({ "question_ids": [question_id] }).to_string(),
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
    let (status, body) = ctx.request_json(req).await;
    assert_eq!(status, StatusCode::OK, "publish response: {body}");
    Ok(())
}
