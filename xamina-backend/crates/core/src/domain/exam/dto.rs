use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ExamDto {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub created_by: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub duration_minutes: i32,
    pub pass_score: i32,
    pub status: String,
    pub shuffle_questions: bool,
    pub shuffle_options: bool,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ExamQuestionDto {
    pub exam_id: Uuid,
    pub question_id: Uuid,
    pub order_no: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExamPayload {
    pub title: String,
    pub description: Option<String>,
    pub duration_minutes: i32,
    pub pass_score: Option<i32>,
    pub shuffle_questions: Option<bool>,
    pub shuffle_options: Option<bool>,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListExamsQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub status: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttachQuestionsPayload {
    pub question_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReorderQuestionsPayload {
    pub question_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ReorderQuestionItem {
    pub question_id: Uuid,
    pub order_no: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct PublishPrecheckIssue {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PublishConflictExam {
    pub id: Uuid,
    pub title: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PublishPrecheckResult {
    pub exam_id: Uuid,
    pub publishable: bool,
    pub status: String,
    pub question_count: i64,
    pub issues: Vec<PublishPrecheckIssue>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExamDetailDto {
    pub exam: ExamDto,
    pub questions: Vec<ExamQuestionDto>,
}
