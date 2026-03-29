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
pub mod report;
pub mod submission;
pub mod superadmin;
pub mod tenant;
pub mod user;
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
}
