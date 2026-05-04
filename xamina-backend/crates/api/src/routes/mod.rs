use axum::Router;

pub mod ai;
pub mod auth;
pub mod billing;
pub mod certificate;
pub mod dashboard;
pub mod exam;
pub mod notification;
pub mod platform;
pub mod privacy;
pub mod question;
pub mod registration;
pub mod report;
pub mod student_class;
pub mod student_profile;
pub mod subject;
pub mod submission;
pub mod superadmin;
pub mod teacher_assignment;
pub mod tenant;
pub mod user;
pub mod user_generate;
pub mod websocket;

pub fn router() -> Router<crate::app::SharedState> {
    Router::new()
        .merge(auth::routes())
        .merge(privacy::routes())
        .merge(billing::routes())
        .merge(certificate::routes())
        .merge(user::routes())
        .merge(tenant::routes())
        .merge(question::routes())
        .merge(exam::routes())
        .merge(submission::routes())
        .merge(superadmin::routes())
        .merge(dashboard::routes())
        .merge(report::routes())
        .merge(notification::routes())
        .merge(platform::routes())
        .merge(ai::routes())
        .merge(registration::routes())
        .merge(subject::routes())
        .merge(teacher_assignment::routes())
        .merge(student_class::routes())
        .merge(student_profile::routes())
        .merge(user_generate::routes())
}

