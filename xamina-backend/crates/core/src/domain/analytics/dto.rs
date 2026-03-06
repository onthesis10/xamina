use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TrendPoint {
    pub day: NaiveDate,
    pub submissions: i64,
    pub avg_score: f64,
    pub pass_rate: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AdminSummaryDto {
    pub users_total: i64,
    pub classes_total: i64,
    pub exams_total: i64,
    pub submissions_total: i64,
    pub avg_score: f64,
    pub pass_rate: f64,
    pub trend_7d: Vec<TrendPoint>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GuruSummaryDto {
    pub exams_total: i64,
    pub published_exams_total: i64,
    pub submissions_total: i64,
    pub avg_score: f64,
    pub pass_rate: f64,
    pub trend_7d: Vec<TrendPoint>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StudentRecentResult {
    pub exam_id: Uuid,
    pub exam_title: String,
    pub status: String,
    pub score: f64,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StudentUpcomingExam {
    pub exam_id: Uuid,
    pub title: String,
    pub start_at: Option<DateTime<Utc>>,
    pub end_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StudentSummaryDto {
    pub in_progress_count: i64,
    pub finished_count: i64,
    pub avg_score: f64,
    pub recent_results: Vec<StudentRecentResult>,
    pub upcoming_exams: Vec<StudentUpcomingExam>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TenantQuotaStatsDto {
    pub users_count: i64,
    pub users_quota: i32,
    pub ai_credits_used: i32,
    pub ai_credits_quota: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardStatsDto {
    pub tenant: TenantQuotaStatsDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "role", rename_all = "lowercase")]
pub enum DashboardSummaryDto {
    Admin(AdminSummaryDto),
    Guru(GuruSummaryDto),
    Siswa(StudentSummaryDto),
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClassResultQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub class_id: Option<Uuid>,
    pub exam_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PageMeta {
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ClassResultRow {
    pub class_id: Option<Uuid>,
    pub class_name: Option<String>,
    pub grade: Option<String>,
    pub major: Option<String>,
    pub exam_id: Uuid,
    pub exam_title: String,
    pub submission_count: i64,
    pub avg_score: f64,
    pub pass_rate: f64,
    pub last_submission_at: Option<DateTime<Utc>>,
}
