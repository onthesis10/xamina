use sqlx::PgPool;

use xamina_core::domain::{
    ai::{repository::AiRepository, service::AiService},
    analytics::{repository::AnalyticsRepository, service::AnalyticsService},
    certificate::{repository::CertificateRepository, service::CertificateService},
    exam::{repository::ExamRepository, service::ExamService},
    notification::{repository::NotificationRepository, service::NotificationService},
    submission::{repository::SubmissionRepository, service::SubmissionService},
    tenant::repository::TenantRepository,
    user::{repository::UserRepository, service::UserService},
};

#[derive(Clone)]
pub struct AppServices {
    pub ai: AiService,
    pub exam: ExamService,
    pub analytics: AnalyticsService,
    pub certificate: CertificateService,
    pub notification: NotificationService,
    pub submission: SubmissionService,
    pub user: UserService,
}

impl AppServices {
    pub fn new(pool: &PgPool, redis: redis::Client) -> Self {
        let ai = AiService::new(
            TenantRepository::new(pool.clone()),
            AiRepository::new(pool.clone()),
        );
        let exam = ExamService::new(ExamRepository::new(pool.clone()));
        let analytics = AnalyticsService::new(AnalyticsRepository::new(pool.clone()));
        let certificate = CertificateService::new(CertificateRepository::new(pool.clone()));
        let notification = NotificationService::new(NotificationRepository::new(pool.clone()));
        let submission = SubmissionService::new(
            SubmissionRepository::new(pool.clone()),
            redis,
            notification.clone(),
            certificate.clone(),
        );
        let user = UserService::new(UserRepository::new(pool.clone()));
        Self {
            ai,
            exam,
            analytics,
            certificate,
            notification,
            submission,
            user,
        }
    }
}
