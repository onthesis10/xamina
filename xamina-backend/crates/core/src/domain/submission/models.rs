use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct StudentExamRow {
    pub exam_id: Uuid,
    pub title: String,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub duration_minutes: i32,
    pub pass_score: i32,
    pub submission_id: Option<Uuid>,
    pub submission_status: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ExamStartRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub title: String,
    pub duration_minutes: i32,
    pub pass_score: i32,
    pub status: String,
    pub shuffle_questions: bool,
    pub shuffle_options: bool,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromRow, Clone)]
pub struct SubmissionRow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub exam_id: Uuid,
    pub student_id: Uuid,
    pub status: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub deadline_at: DateTime<Utc>,
    pub question_order_jsonb: Value,
    pub score: Option<f64>,
    pub correct_count: i32,
    pub total_questions: i32,
}

#[derive(Debug, FromRow)]
pub struct QuestionRow {
    pub id: Uuid,
    pub r#type: String,
    pub content: String,
    pub options_jsonb: Value,
    pub answer_key: Value,
    pub topic: Option<String>,
    pub difficulty: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SnapshotQuestion {
    pub question_id: Uuid,
    pub r#type: String,
    pub content: String,
    pub options_jsonb: Value,
    pub answer_key: Value,
    pub topic: Option<String>,
    pub difficulty: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SubmissionAnswerRow {
    pub question_id: Uuid,
    pub answer_jsonb: Value,
    pub is_bookmarked: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct InternalResult {
    pub score: f64,
    pub correct_count: i32,
    pub total_questions: i32,
    pub breakdown: Vec<crate::domain::submission::dto::SubmissionResultItem>,
}

#[derive(Debug, FromRow)]
pub struct ExamSubmissionRow {
    pub submission_id: Uuid,
    pub student_id: Uuid,
    pub student_name: String,
    pub status: String,
    pub answered_count: i64,
    pub anomaly_count: i64,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub score: Option<f64>,
}
