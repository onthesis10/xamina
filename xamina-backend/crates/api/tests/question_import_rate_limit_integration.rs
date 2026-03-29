mod common;

use std::io::Write;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use rust_xlsxwriter::Workbook;
use serde_json::json;
use tower::ServiceExt;
use zip::write::SimpleFileOptions;
use zip::ZipArchive;

use common::setup_test_ctx;

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn question_import_preview_and_commit_should_support_xlsx_and_invalid_rows(
) -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let workbook = build_question_import_xlsx(&[
        [
            "multiple_choice",
            "Ibu kota Indonesia adalah?",
            "Jakarta",
            "Bandung",
            "Surabaya",
            "Medan",
            "A",
            "Geografi",
            "easy",
            "true",
            "",
        ],
        [
            "multiple_choice",
            "Baris invalid tanpa answer",
            "Opsional A",
            "Opsional B",
            "",
            "",
            "",
            "Geografi",
            "easy",
            "true",
            "",
        ],
    ])?;

    let preview_req = multipart_request(
        "/api/v1/questions/import/preview",
        ctx.bearer_for(ctx.guru_id, "guru"),
        "questions.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        workbook,
    )?;
    let (preview_status, preview_body) = ctx.request_json(preview_req).await;
    assert_eq!(preview_status, StatusCode::OK);
    assert_eq!(preview_body["data"]["format"], "xlsx");
    assert_eq!(preview_body["data"]["total_rows"], 2);
    assert_eq!(preview_body["data"]["valid_rows"], 1);
    assert_eq!(preview_body["data"]["invalid_rows"], 1);

    let questions = preview_body["data"]["questions"].clone();
    let commit_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions/import/commit")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "questions": questions.as_array().unwrap().iter().map(|row| row["question"].clone()).collect::<Vec<_>>() }).to_string()))?;
    let (commit_status, commit_body) = ctx.request_json(commit_req).await;
    assert_eq!(commit_status, StatusCode::OK);
    assert_eq!(commit_body["data"]["inserted_count"], 1);

    let inserted_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM questions WHERE tenant_id = $1")
            .bind(ctx.tenant_id)
            .fetch_one(&ctx.pool)
            .await?;
    assert_eq!(inserted_count, 1);

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn question_import_should_support_docx_and_forbid_student_commit() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let docx = build_question_import_docx(
        "Question 1\nType: short_answer\nContent: Sebutkan bilangan prima terkecil\nAnswer_Key: 2\nTopic: Matematika\nDifficulty: easy\nIs_Active: true\n",
    )?;

    let preview_req = multipart_request(
        "/api/v1/questions/import/preview",
        ctx.bearer_for(ctx.guru_id, "guru"),
        "questions.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        docx,
    )?;
    let (preview_status, preview_body) = ctx.request_json(preview_req).await;
    assert_eq!(preview_status, StatusCode::OK);
    assert_eq!(preview_body["data"]["format"], "docx");
    assert_eq!(preview_body["data"]["valid_rows"], 1);

    let commit_req = Request::builder()
        .method(Method::POST)
        .uri("/api/v1/questions/import/commit")
        .header("authorization", ctx.bearer_for(ctx.siswa_id, "siswa"))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "questions": [
                    {
                        "type": "short_answer",
                        "content": "Sebutkan bilangan prima terkecil",
                        "options_jsonb": [],
                        "answer_key": "2",
                        "topic": "Matematika",
                        "difficulty": "easy",
                        "is_active": true
                    }
                ]
            })
            .to_string(),
        ))?;
    let (commit_status, commit_body) = ctx.request_json(commit_req).await;
    assert_eq!(commit_status, StatusCode::FORBIDDEN);
    assert_eq!(commit_body["error"]["code"], "FORBIDDEN");

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn question_import_rate_limit_and_response_compression_should_work() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let workbook = build_question_import_xlsx(&[[
        "true_false",
        "2 + 2 = 4",
        "",
        "",
        "",
        "",
        "true",
        "Matematika",
        "easy",
        "true",
        "",
    ]])?;

    for attempt in 0..8 {
        let req = multipart_request(
            "/api/v1/questions/import/preview",
            ctx.bearer_for(ctx.guru_id, "guru"),
            "questions.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            workbook.clone(),
        )?;
        let (status, _) = ctx.request_json(req).await;
        assert_eq!(status, StatusCode::OK, "attempt {attempt} should pass");
    }

    let limited_req = multipart_request(
        "/api/v1/questions/import/preview",
        ctx.bearer_for(ctx.guru_id, "guru"),
        "questions.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        workbook,
    )?;
    let (limited_status, limited_body) = ctx.request_json(limited_req).await;
    assert_eq!(limited_status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(limited_body["error"]["code"], "RATE_LIMITED");

    let list_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/questions?page=1&page_size=20")
        .header("authorization", ctx.bearer_for(ctx.admin_id, "admin"))
        .header("accept-encoding", "gzip")
        .body(Body::empty())?;
    let list_res = ctx.app.clone().oneshot(list_req).await?;
    assert_eq!(list_res.status(), StatusCode::OK);
    assert_eq!(
        list_res
            .headers()
            .get("content-encoding")
            .and_then(|v| v.to_str().ok()),
        Some("gzip")
    );

    Ok(())
}

#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL"]
async fn question_import_template_downloads_should_work_for_xlsx_and_docx() -> anyhow::Result<()> {
    let Some(ctx) = setup_test_ctx().await? else {
        return Ok(());
    };

    let xlsx_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/questions/import/template.xlsx")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let xlsx_res = ctx.app.clone().oneshot(xlsx_req).await?;
    assert_eq!(xlsx_res.status(), StatusCode::OK);
    assert_eq!(
        xlsx_res
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok()),
        Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    );
    let xlsx_bytes = axum::body::to_bytes(xlsx_res.into_body(), 1024 * 1024).await?;
    assert!(xlsx_bytes.len() > 200);

    let docx_req = Request::builder()
        .method(Method::GET)
        .uri("/api/v1/questions/import/template.docx")
        .header("authorization", ctx.bearer_for(ctx.guru_id, "guru"))
        .body(Body::empty())?;
    let docx_res = ctx.app.clone().oneshot(docx_req).await?;
    assert_eq!(docx_res.status(), StatusCode::OK);
    assert_eq!(
        docx_res
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok()),
        Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    );
    let docx_bytes = axum::body::to_bytes(docx_res.into_body(), 1024 * 1024).await?;
    assert!(docx_bytes.len() > 200);
    let mut archive = ZipArchive::new(std::io::Cursor::new(docx_bytes.to_vec()))?;
    let mut document = archive.by_name("word/document.xml")?;
    let mut xml = String::new();
    use std::io::Read;
    document.read_to_string(&mut xml)?;
    assert!(xml.contains("Question 1"));
    assert!(xml.contains("Option_A: Jakarta"));

    Ok(())
}

fn build_question_import_xlsx(rows: &[[&str; 11]]) -> anyhow::Result<Vec<u8>> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    let headers = [
        "type",
        "content",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "answer_key",
        "topic",
        "difficulty",
        "is_active",
        "image_url",
    ];
    for (index, header_value) in headers.iter().enumerate() {
        sheet.write_string(0, index as u16, *header_value)?;
    }
    for (row_index, row) in rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            sheet.write_string((row_index + 1) as u32, column_index as u16, *value)?;
        }
    }
    Ok(workbook.save_to_buffer()?)
}

fn build_question_import_docx(body_text: &str) -> anyhow::Result<Vec<u8>> {
    let cursor = std::io::Cursor::new(Vec::<u8>::new());
    let mut writer = zip::ZipWriter::new(cursor);
    let options = SimpleFileOptions::default();

    writer.start_file("[Content_Types].xml", options)?;
    writer.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#)?;

    writer.add_directory("_rels/", options)?;
    writer.start_file("_rels/.rels", options)?;
    writer.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#)?;

    writer.add_directory("word/", options)?;
    writer.start_file("word/document.xml", options)?;
    let paragraphs = body_text
        .lines()
        .map(|line| format!("<w:p><w:r><w:t>{}</w:t></w:r></w:p>", xml_escape(line)))
        .collect::<Vec<_>>()
        .join("");
    writer.write_all(
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{paragraphs}</w:body>
</w:document>"#
        )
        .as_bytes(),
    )?;

    Ok(writer.finish()?.into_inner())
}

fn multipart_request(
    uri: &str,
    bearer: String,
    file_name: &str,
    content_type: &str,
    file_bytes: Vec<u8>,
) -> anyhow::Result<Request<Body>> {
    let boundary = "xaminaImportBoundary";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\n")
            .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {content_type}\r\n\r\n").as_bytes());
    body.extend_from_slice(&file_bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    Ok(Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("authorization", bearer)
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body))?)
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
