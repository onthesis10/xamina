use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct StudentExamListItem {
    pub exam_id: Uuid,
    pub title: String,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
    pub duration_minutes: i32,
    pub pass_score: i32,
    pub submission_id: Option<Uuid>,
    pub submission_status: String,
    pub can_start: bool,
}

#[derive(Debug, Serialize)]
pub struct SessionQuestionDto {
    pub question_id: Uuid,
    pub r#type: String,
    pub content: String,
    pub options_jsonb: Value,
    pub topic: Option<String>,
    pub difficulty: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SubmissionAnswerDto {
    pub question_id: Uuid,
    pub answer_jsonb: Value,
    pub is_bookmarked: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SubmissionSessionDto {
    pub submission_id: Uuid,
    pub exam_id: Uuid,
    pub exam_title: String,
    pub status: String,
    pub started_at: DateTime<Utc>,
    pub deadline_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub remaining_seconds: i64,
    pub questions: Vec<SessionQuestionDto>,
    pub answers: Vec<SubmissionAnswerDto>,
}

#[derive(Debug, Serialize)]
pub struct StartSubmissionDto {
    pub submission_id: Uuid,
    pub status: String,
    pub remaining_seconds: i64,
    pub resumed: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpsertAnswersPayload {
    pub answers: Option<Vec<AnswerInput>>,
    pub question_id: Option<Uuid>,
    pub answer: Option<Value>,
    pub is_bookmarked: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AnswerInput {
    pub question_id: Uuid,
    pub answer: Option<Value>,
    pub is_bookmarked: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct AnomalyPayload {
    pub event_type: String,
    pub payload_jsonb: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct UpsertAnswersResponse {
    pub submission_id: Uuid,
    pub saved_count: usize,
}

#[derive(Debug, Serialize)]
pub struct SubmissionResultItem {
    pub question_id: Uuid,
    pub question_type: String,
    pub is_correct: bool,
    pub submitted_answer: Value,
}

#[derive(Debug, Serialize)]
pub struct SubmissionResultDto {
    pub submission_id: Uuid,
    pub exam_id: Uuid,
    pub status: String,
    pub score: f64,
    pub correct_count: i32,
    pub total_questions: i32,
    pub pass_score: i32,
    pub passed: bool,
    pub finished_at: Option<DateTime<Utc>>,
    pub breakdown: Vec<SubmissionResultItem>,
}

#[derive(Debug, Serialize)]
pub struct LogAnomalyResponse {
    pub id: Uuid,
    pub submission_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct ExamSubmissionListItem {
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
