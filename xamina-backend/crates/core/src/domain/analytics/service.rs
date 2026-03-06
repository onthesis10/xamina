use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{
        AdminSummaryDto, ClassResultQuery, DashboardStatsDto, DashboardSummaryDto, GuruSummaryDto,
        PageMeta, StudentSummaryDto,
    },
    models::ClassResultPage,
    repository::AnalyticsRepository,
};

#[derive(Debug, Clone)]
pub struct AnalyticsService {
    repo: AnalyticsRepository,
}

impl AnalyticsService {
    pub fn new(repo: AnalyticsRepository) -> Self {
        Self { repo }
    }

    pub async fn dashboard_summary(
        &self,
        tenant_id: Uuid,
        actor_id: Uuid,
        actor_role: &str,
    ) -> Result<DashboardSummaryDto, CoreError> {
        match actor_role {
            "admin" | "super_admin" => {
                let (
                    users_total,
                    classes_total,
                    exams_total,
                    submissions_total,
                    avg_score,
                    pass_rate,
                ) = self.repo.admin_totals(tenant_id).await?;
                let trend_7d = self.repo.trend_admin(tenant_id).await?;
                Ok(DashboardSummaryDto::Admin(AdminSummaryDto {
                    users_total,
                    classes_total,
                    exams_total,
                    submissions_total,
                    avg_score,
                    pass_rate,
                    trend_7d,
                }))
            }
            "guru" => {
                let (exams_total, published_exams_total, submissions_total, avg_score, pass_rate) =
                    self.repo.guru_totals(tenant_id, actor_id).await?;
                let trend_7d = self.repo.trend_guru(tenant_id, actor_id).await?;
                Ok(DashboardSummaryDto::Guru(GuruSummaryDto {
                    exams_total,
                    published_exams_total,
                    submissions_total,
                    avg_score,
                    pass_rate,
                    trend_7d,
                }))
            }
            "siswa" => {
                let (in_progress_count, finished_count, avg_score, recent_results, upcoming_exams) =
                    self.repo.student_summary(tenant_id, actor_id).await?;
                Ok(DashboardSummaryDto::Siswa(StudentSummaryDto {
                    in_progress_count,
                    finished_count,
                    avg_score,
                    recent_results,
                    upcoming_exams,
                }))
            }
            _ => Err(CoreError::forbidden("FORBIDDEN", "Unsupported role")),
        }
    }

    pub async fn class_results(
        &self,
        tenant_id: Uuid,
        actor_id: Uuid,
        actor_role: &str,
        query: ClassResultQuery,
    ) -> Result<ClassResultPage, CoreError> {
        if actor_role != "admin" && actor_role != "guru" && actor_role != "super_admin" {
            return Err(CoreError::forbidden(
                "FORBIDDEN",
                "Admin, guru, or super_admin role required",
            ));
        }
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * page_size;
        let total = self
            .repo
            .count_class_results(
                tenant_id,
                actor_role,
                actor_id,
                query.class_id,
                query.exam_id,
            )
            .await?;
        let rows = self
            .repo
            .class_results(
                tenant_id,
                actor_role,
                actor_id,
                query.class_id,
                query.exam_id,
                page_size,
                offset,
            )
            .await?;
        Ok(ClassResultPage {
            rows,
            meta: PageMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn dashboard_stats(&self, tenant_id: Uuid) -> Result<DashboardStatsDto, CoreError> {
        let tenant = self.repo.tenant_quota_stats(tenant_id).await?;
        Ok(DashboardStatsDto { tenant })
    }
}

#[cfg(test)]
mod tests {
    use sqlx::postgres::PgPoolOptions;
    use uuid::Uuid;

    use super::AnalyticsService;
    use crate::domain::analytics::{dto::ClassResultQuery, repository::AnalyticsRepository};

    fn new_service() -> AnalyticsService {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://postgres:postgres@localhost:5432/xamina")
            .expect("lazy pool");
        AnalyticsService::new(AnalyticsRepository::new(pool))
    }

    #[tokio::test]
    async fn dashboard_summary_should_reject_unsupported_role() {
        let service = new_service();
        let err = service
            .dashboard_summary(Uuid::new_v4(), Uuid::new_v4(), "ops")
            .await
            .expect_err("must fail");
        assert_eq!(err.code, "FORBIDDEN");
    }

    #[tokio::test]
    async fn class_results_should_require_admin_or_guru_role() {
        let service = new_service();
        let err = service
            .class_results(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "siswa",
                ClassResultQuery {
                    page: Some(1),
                    page_size: Some(20),
                    class_id: None,
                    exam_id: None,
                },
            )
            .await
            .expect_err("must fail");
        assert_eq!(err.code, "FORBIDDEN");
    }
}
