use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use super::dto::{ClassResultRow, PageMeta};

#[derive(Debug, Clone)]
pub struct ClassResultPage {
    pub rows: Vec<ClassResultRow>,
    pub meta: PageMeta,
}

#[derive(Debug, Clone, FromRow)]
pub struct ExamInsightExamRow {
    pub exam_id: Uuid,
    pub exam_title: String,
    pub pass_score: i32,
    pub created_by: Uuid,
}

#[derive(Debug, Clone, FromRow)]
pub struct ExamInsightSubmissionRow {
    pub submission_id: Uuid,
    pub score: Option<f64>,
    pub finished_at: Option<DateTime<Utc>>,
    pub question_order_jsonb: Value,
}

#[derive(Debug, Clone, FromRow)]
pub struct ExamInsightAnswerRow {
    pub submission_id: Uuid,
    pub question_id: Uuid,
    pub answer_jsonb: Value,
}
