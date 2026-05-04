use sqlx::PgPool;

use xamina_core::domain::{
    ai::{repository::AiRepository, service::AiService},
    analytics::{repository::AnalyticsRepository, service::AnalyticsService},
    billing::{repository::BillingRepository, service::BillingService},
    certificate::{repository::CertificateRepository, service::CertificateService},
    exam::{repository::ExamRepository, service::ExamService},
    notification::{repository::NotificationRepository, service::NotificationService},
    student_class::{repository::StudentClassRepository, service::StudentClassService},
    student_profile::{repository::StudentProfileRepository, service::StudentProfileService},
    subject::{repository::SubjectRepository, service::SubjectService},
    submission::{repository::SubmissionRepository, service::SubmissionService},
    teacher_assignment::{
        repository::TeacherAssignmentRepository, service::TeacherAssignmentService,
    },
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
    pub subject: SubjectService,
    pub teacher_assignment: TeacherAssignmentService,
    pub student_class: StudentClassService,
    pub student_profile: StudentProfileService,
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
        let subject = SubjectService::new(SubjectRepository::new(pool.clone()));
        let teacher_assignment =
            TeacherAssignmentService::new(TeacherAssignmentRepository::new(pool.clone()));
        let student_class = StudentClassService::new(StudentClassRepository::new(pool.clone()));
        let student_profile =
            StudentProfileService::new(StudentProfileRepository::new(pool.clone()));

        Self {
            ai,
            exam,
            analytics,
            billing,
            certificate,
            notification,
            submission,
            user,
            subject,
            teacher_assignment,
            student_class,
            student_profile,
        }
    }
}
