use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;

use super::dto::{
    ClassResultRow, StudentRecentResult, StudentUpcomingExam, TenantQuotaStatsDto, TrendPoint,
};
use super::models::{ExamInsightAnswerRow, ExamInsightExamRow, ExamInsightSubmissionRow};

#[derive(Debug, Clone)]
pub struct AnalyticsRepository {
    pool: PgPool,
}

impl AnalyticsRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn admin_totals(
        &self,
        tenant_id: Uuid,
    ) -> Result<(i64, i64, i64, i64, f64, f64), CoreError> {
        let users_total =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE tenant_id = $1")
                .bind(tenant_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count users"))?;

        let classes_total =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM classes WHERE tenant_id = $1")
                .bind(tenant_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count classes"))?;

        let exams_total =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM exams WHERE tenant_id = $1")
                .bind(tenant_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count exams"))?;

        let submissions_total =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM submissions WHERE tenant_id = $1")
                .bind(tenant_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count submissions"))?;

        let stats = sqlx::query_as::<_, (Option<f64>, Option<f64>)>(
            "SELECT
                AVG(score)::float8,
                CASE WHEN COUNT(*) = 0 THEN 0::float8
                     ELSE (SUM(CASE WHEN score >= e.pass_score THEN 1 ELSE 0 END)::float8 / COUNT(*)::float8) * 100
                END
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             WHERE s.tenant_id = $1
               AND s.status IN ('finished', 'auto_finished')",
        )
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to calculate stats"))?;

        Ok((
            users_total,
            classes_total,
            exams_total,
            submissions_total,
            stats.0.unwrap_or(0.0),
            stats.1.unwrap_or(0.0),
        ))
    }

    pub async fn guru_totals(
        &self,
        tenant_id: Uuid,
        guru_id: Uuid,
    ) -> Result<(i64, i64, i64, f64, f64), CoreError> {
        let exams_total = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM exams WHERE tenant_id = $1 AND created_by = $2",
        )
        .bind(tenant_id)
        .bind(guru_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count exams"))?;

        let published_exams_total = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM exams WHERE tenant_id = $1 AND created_by = $2 AND status = 'published'",
        )
        .bind(tenant_id)
        .bind(guru_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count published exams"))?;

        let submissions_total = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             WHERE s.tenant_id = $1
               AND e.created_by = $2",
        )
        .bind(tenant_id)
        .bind(guru_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count submissions"))?;

        let stats = sqlx::query_as::<_, (Option<f64>, Option<f64>)>(
            "SELECT
                AVG(s.score)::float8,
                CASE WHEN COUNT(*) = 0 THEN 0::float8
                     ELSE (SUM(CASE WHEN s.score >= e.pass_score THEN 1 ELSE 0 END)::float8 / COUNT(*)::float8) * 100
                END
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             WHERE s.tenant_id = $1
               AND e.created_by = $2
               AND s.status IN ('finished', 'auto_finished')",
        )
        .bind(tenant_id)
        .bind(guru_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to calculate stats"))?;

        Ok((
            exams_total,
            published_exams_total,
            submissions_total,
            stats.0.unwrap_or(0.0),
            stats.1.unwrap_or(0.0),
        ))
    }

    pub async fn trend_admin(&self, tenant_id: Uuid) -> Result<Vec<TrendPoint>, CoreError> {
        sqlx::query_as::<_, TrendPoint>(
            "SELECT
                DATE(s.finished_at) AS day,
                COUNT(*)::bigint AS submissions,
                COALESCE(AVG(s.score), 0)::float8 AS avg_score,
                CASE WHEN COUNT(*) = 0 THEN 0::float8
                     ELSE (SUM(CASE WHEN s.score >= e.pass_score THEN 1 ELSE 0 END)::float8 / COUNT(*)::float8) * 100
                END AS pass_rate
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             WHERE s.tenant_id = $1
               AND s.finished_at >= NOW() - INTERVAL '7 day'
               AND s.status IN ('finished', 'auto_finished')
             GROUP BY DATE(s.finished_at)
             ORDER BY DATE(s.finished_at) ASC",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to build trend"))
    }

    pub async fn trend_guru(
        &self,
        tenant_id: Uuid,
        guru_id: Uuid,
    ) -> Result<Vec<TrendPoint>, CoreError> {
        sqlx::query_as::<_, TrendPoint>(
            "SELECT
                DATE(s.finished_at) AS day,
                COUNT(*)::bigint AS submissions,
                COALESCE(AVG(s.score), 0)::float8 AS avg_score,
                CASE WHEN COUNT(*) = 0 THEN 0::float8
                     ELSE (SUM(CASE WHEN s.score >= e.pass_score THEN 1 ELSE 0 END)::float8 / COUNT(*)::float8) * 100
                END AS pass_rate
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             WHERE s.tenant_id = $1
               AND e.created_by = $2
               AND s.finished_at >= NOW() - INTERVAL '7 day'
               AND s.status IN ('finished', 'auto_finished')
             GROUP BY DATE(s.finished_at)
             ORDER BY DATE(s.finished_at) ASC",
        )
        .bind(tenant_id)
        .bind(guru_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to build trend"))
    }

    pub async fn student_summary(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<
        (
            i64,
            i64,
            f64,
            Vec<StudentRecentResult>,
            Vec<StudentUpcomingExam>,
        ),
        CoreError,
    > {
        let in_progress_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM submissions
             WHERE tenant_id = $1 AND student_id = $2 AND status = 'in_progress'",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count in-progress submissions"))?;

        let finished_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM submissions
             WHERE tenant_id = $1 AND student_id = $2 AND status IN ('finished', 'auto_finished')",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count finished submissions"))?;

        let avg_score = sqlx::query_scalar::<_, Option<f64>>(
            "SELECT AVG(score)::float8 FROM submissions
             WHERE tenant_id = $1 AND student_id = $2 AND status IN ('finished', 'auto_finished')",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to calculate average score"))?
        .unwrap_or(0.0);

        let recent_results = sqlx::query_as::<_, StudentRecentResult>(
            "SELECT
                s.exam_id,
                e.title AS exam_title,
                s.status,
                COALESCE(s.score, 0)::float8 AS score,
                s.finished_at
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             WHERE s.tenant_id = $1
               AND s.student_id = $2
               AND s.status IN ('finished', 'auto_finished')
             ORDER BY s.finished_at DESC
             LIMIT 5",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load recent results"))?;

        let upcoming_exams = sqlx::query_as::<_, StudentUpcomingExam>(
            "SELECT
                e.id AS exam_id,
                e.title,
                e.start_at,
                e.end_at
             FROM exams e
             WHERE e.tenant_id = $1
               AND e.status = 'published'
               AND (e.end_at IS NULL OR e.end_at >= NOW())
             ORDER BY e.start_at ASC NULLS LAST
             LIMIT 5",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load upcoming exams"))?;

        Ok((
            in_progress_count,
            finished_count,
            avg_score,
            recent_results,
            upcoming_exams,
        ))
    }

    pub async fn count_class_results(
        &self,
        tenant_id: Uuid,
        actor_role: &str,
        actor_id: Uuid,
        class_id: Option<Uuid>,
        exam_id: Option<Uuid>,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM (
                SELECT c.id AS class_id, e.id AS exam_id
                FROM submissions s
                JOIN exams e ON e.id = s.exam_id
                LEFT JOIN users u ON u.id = s.student_id
                LEFT JOIN classes c ON c.id = u.class_id
                WHERE s.tenant_id = $1
                  AND ($2::uuid IS NULL OR c.id = $2)
                  AND ($3::uuid IS NULL OR e.id = $3)
                  AND ($4::text <> 'guru' OR e.created_by = $5)
                GROUP BY c.id, e.id
             ) grouped",
        )
        .bind(tenant_id)
        .bind(class_id)
        .bind(exam_id)
        .bind(actor_role)
        .bind(actor_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count report rows"))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn class_results(
        &self,
        tenant_id: Uuid,
        actor_role: &str,
        actor_id: Uuid,
        class_id: Option<Uuid>,
        exam_id: Option<Uuid>,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<ClassResultRow>, CoreError> {
        sqlx::query_as::<_, ClassResultRow>(
            "SELECT
                c.id AS class_id,
                c.name AS class_name,
                c.grade,
                c.major,
                e.id AS exam_id,
                e.title AS exam_title,
                COUNT(*)::bigint AS submission_count,
                COALESCE(AVG(s.score), 0)::float8 AS avg_score,
                CASE WHEN COUNT(*) = 0 THEN 0::float8
                     ELSE (SUM(CASE WHEN s.score >= e.pass_score THEN 1 ELSE 0 END)::float8 / COUNT(*)::float8) * 100
                END AS pass_rate,
                MAX(s.finished_at) AS last_submission_at
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             LEFT JOIN users u ON u.id = s.student_id
             LEFT JOIN classes c ON c.id = u.class_id
             WHERE s.tenant_id = $1
               AND s.status IN ('finished', 'auto_finished')
               AND ($2::uuid IS NULL OR c.id = $2)
               AND ($3::uuid IS NULL OR e.id = $3)
               AND ($4::text <> 'guru' OR e.created_by = $5)
             GROUP BY c.id, c.name, c.grade, c.major, e.id, e.title
             ORDER BY MAX(s.finished_at) DESC NULLS LAST
             LIMIT $6 OFFSET $7",
        )
        .bind(tenant_id)
        .bind(class_id)
        .bind(exam_id)
        .bind(actor_role)
        .bind(actor_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load class report"))
    }

    pub async fn tenant_quota_stats(
        &self,
        tenant_id: Uuid,
    ) -> Result<TenantQuotaStatsDto, CoreError> {
        sqlx::query_as::<_, (i64, i32, i32, i32)>(
            "SELECT
                COALESCE(COUNT(u.id), 0)::bigint AS users_count,
                t.users_quota,
                t.ai_credits_used,
                t.ai_credits_quota
             FROM tenants t
             LEFT JOIN users u ON u.tenant_id = t.id
             WHERE t.id = $1
             GROUP BY t.id",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load tenant quota stats"))?
        .map(|row| TenantQuotaStatsDto {
            users_count: row.0,
            users_quota: row.1,
            ai_credits_used: row.2,
            ai_credits_quota: row.3,
        })
        .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Tenant not found"))
    }

    pub async fn find_exam_for_insights(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
    ) -> Result<Option<ExamInsightExamRow>, CoreError> {
        sqlx::query_as::<_, ExamInsightExamRow>(
            "SELECT
                id AS exam_id,
                title AS exam_title,
                pass_score,
                created_by
             FROM exams
             WHERE tenant_id = $1
               AND id = $2",
        )
        .bind(tenant_id)
        .bind(exam_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam for insights"))
    }

    pub async fn list_exam_submissions_for_insights(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        class_id: Option<Uuid>,
    ) -> Result<Vec<ExamInsightSubmissionRow>, CoreError> {
        sqlx::query_as::<_, ExamInsightSubmissionRow>(
            "SELECT
                s.id AS submission_id,
                s.score::float8 AS score,
                s.finished_at,
                s.question_order_jsonb
             FROM submissions s
             JOIN users u
               ON u.id = s.student_id
             WHERE s.tenant_id = $1
               AND s.exam_id = $2
               AND s.status IN ('finished', 'auto_finished')
               AND ($3::uuid IS NULL OR u.class_id = $3)
             ORDER BY s.finished_at ASC NULLS LAST, s.started_at ASC",
        )
        .bind(tenant_id)
        .bind(exam_id)
        .bind(class_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load exam submissions"))
    }

    pub async fn list_submission_answers_for_insights(
        &self,
        submission_ids: &[Uuid],
    ) -> Result<Vec<ExamInsightAnswerRow>, CoreError> {
        if submission_ids.is_empty() {
            return Ok(Vec::new());
        }

        sqlx::query_as::<_, ExamInsightAnswerRow>(
            "SELECT
                submission_id,
                question_id,
                answer_jsonb
             FROM submission_answers
             WHERE submission_id = ANY($1)",
        )
        .bind(submission_ids)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load submission answers"))
    }
}
