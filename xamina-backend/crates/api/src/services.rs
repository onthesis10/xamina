use sqlx::PgPool;

use xamina_core::domain::{
    ai::{repository::AiRepository, service::AiService},
    analytics::{repository::AnalyticsRepository, service::AnalyticsService},
    billing::{repository::BillingRepository, service::BillingService},
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
    pub billing: BillingService,
    pub certificate: CertificateService,
    pub notification: NotificationService,
    pub submission: SubmissionService,
    pub user: UserService,
}

impl AppServices {
    pub fn new(pool: &PgPool, redis: redis::Client, invoice_public_base_url: String) -> Self {
        let ai = AiService::new(
            TenantRepository::new(pool.clone()),
            AiRepository::new(pool.clone()),
        );
        let exam = ExamService::new(ExamRepository::new(pool.clone()));
        let analytics = AnalyticsService::new(AnalyticsRepository::new(pool.clone()));
        let notification = NotificationService::new(NotificationRepository::new(pool.clone()));
        let billing = BillingService::new(
            BillingRepository::new(pool.clone()),
            notification.clone(),
            invoice_public_base_url,
        );
        let certificate = CertificateService::new(CertificateRepository::new(pool.clone()));
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
            billing,
            certificate,
            notification,
            submission,
            user,
        }
    }
}
