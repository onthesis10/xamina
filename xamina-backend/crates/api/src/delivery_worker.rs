use std::time::Duration;

use anyhow::Context;
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use tokio::time::sleep;
use tracing::{error, warn};

use crate::services::AppServices;

#[derive(Debug, Clone)]
struct SmtpConfig {
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
    from_email: String,
    from_name: String,
    starttls: bool,
}

#[derive(Debug, Clone)]
struct WebPushConfig {
    public_key: String,
    private_key: String,
    subject: String,
}

impl SmtpConfig {
    fn from_env() -> Option<Self> {
        let host = std::env::var("SMTP_HOST")
            .ok()
            .filter(|v| !v.trim().is_empty())?;
        let port = std::env::var("SMTP_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(1025);
        let username = std::env::var("SMTP_USERNAME")
            .ok()
            .filter(|v| !v.trim().is_empty());
        let password = std::env::var("SMTP_PASSWORD")
            .ok()
            .filter(|v| !v.trim().is_empty());
        let from_email = std::env::var("SMTP_FROM_EMAIL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "noreply@xamina.local".to_string());
        let from_name = std::env::var("SMTP_FROM_NAME")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "Xamina".to_string());
        let starttls = std::env::var("SMTP_STARTTLS")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        Some(Self {
            host,
            port,
            username,
            password,
            from_email,
            from_name,
            starttls,
        })
    }

    fn build_mailer(&self) -> anyhow::Result<AsyncSmtpTransport<Tokio1Executor>> {
        let mut builder = if self.starttls {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&self.host)
                .with_context(|| format!("invalid SMTP relay host: {}", self.host))?
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&self.host)
        };
        builder = builder.port(self.port);
        if let (Some(username), Some(password)) = (&self.username, &self.password) {
            builder = builder.credentials(Credentials::new(username.clone(), password.clone()));
        }
        Ok(builder.build())
    }
}

impl WebPushConfig {
    fn from_env() -> Option<Self> {
        let public_key = std::env::var("WEB_PUSH_VAPID_PUBLIC_KEY")
            .ok()
            .filter(|v| !v.trim().is_empty())?;
        let private_key = std::env::var("WEB_PUSH_VAPID_PRIVATE_KEY")
            .ok()
            .filter(|v| !v.trim().is_empty())?;
        let subject = std::env::var("WEB_PUSH_SUBJECT")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "mailto:admin@xamina.local".to_string());
        Some(Self {
            public_key,
            private_key,
            subject,
        })
    }
}

pub fn spawn_delivery_workers(services: AppServices) {
    let email_services = services.clone();
    tokio::spawn(async move {
        run_email_worker(email_services).await;
    });

    let push_services = services.clone();
    tokio::spawn(async move {
        run_push_worker(push_services).await;
    });
}

async fn run_email_worker(services: AppServices) {
    let smtp_config = SmtpConfig::from_env();
    loop {
        let jobs = match services.notification.claim_due_email_jobs(20).await {
            Ok(rows) => rows,
            Err(err) => {
                error!(code = err.code, message = %err.message, "failed to claim email jobs");
                sleep(Duration::from_secs(3)).await;
                continue;
            }
        };

        for job in jobs {
            if let Some(config) = smtp_config.as_ref() {
                let delivery = send_email(config, &job.to_email, &job.subject, &job.body).await;
                match delivery {
                    Ok(_) => {
                        let _ = services.notification.mark_email_job_sent(job.id).await;
                    }
                    Err(err) => {
                        let _ = services
                            .notification
                            .mark_email_job_retry(job.id, job.attempts, job.max_attempts, &err)
                            .await;
                    }
                }
            } else {
                let _ = services
                    .notification
                    .mark_email_job_retry(
                        job.id,
                        job.attempts,
                        job.max_attempts,
                        "SMTP is not configured",
                    )
                    .await;
            }
        }

        sleep(Duration::from_secs(2)).await;
    }
}

async fn send_email(
    config: &SmtpConfig,
    to_email: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    let from_box = Mailbox::new(
        Some(config.from_name.clone()),
        config
            .from_email
            .parse()
            .map_err(|_| "invalid SMTP_FROM_EMAIL".to_string())?,
    );
    let to_box = Mailbox::new(
        None,
        to_email
            .parse()
            .map_err(|_| "invalid recipient email".to_string())?,
    );
    let message = Message::builder()
        .from(from_box)
        .to(to_box)
        .subject(subject)
        .body(body.to_string())
        .map_err(|_| "failed to build email message".to_string())?;

    let mailer = config
        .build_mailer()
        .map_err(|e| format!("failed to create SMTP client: {e}"))?;
    mailer
        .send(message)
        .await
        .map_err(|e| format!("failed to send email: {e}"))?;
    Ok(())
}

async fn run_push_worker(services: AppServices) {
    let push_config = WebPushConfig::from_env();
    loop {
        let jobs = match services.notification.claim_due_push_jobs(20).await {
            Ok(rows) => rows,
            Err(err) => {
                error!(code = err.code, message = %err.message, "failed to claim push jobs");
                sleep(Duration::from_secs(3)).await;
                continue;
            }
        };

        for job in jobs {
            if let Some(config) = push_config.as_ref() {
                let subscriptions = match services
                    .notification
                    .list_push_subscriptions(job.tenant_id, job.user_id)
                    .await
                {
                    Ok(rows) => rows,
                    Err(err) => {
                        let _ = services
                            .notification
                            .mark_push_job_retry(
                                job.id,
                                job.attempts,
                                job.max_attempts,
                                &err.message,
                            )
                            .await;
                        continue;
                    }
                };

                if subscriptions.is_empty() {
                    let _ = services.notification.mark_push_job_sent(job.id).await;
                    continue;
                }

                let payload = serde_json::json!({
                    "title": job.title,
                    "body": job.body,
                    "data": job.payload_jsonb,
                })
                .to_string();

                let mut delivered = 0usize;
                for sub in &subscriptions {
                    match send_web_push(config, sub, &payload).await {
                        Ok(_) => {
                            delivered += 1;
                        }
                        Err(err) => {
                            warn!(
                                subscription_id = %sub.id,
                                job_id = %job.id,
                                error = %err,
                                "failed to deliver push"
                            );
                            if err.contains("410") || err.contains("404") {
                                let _ = services
                                    .notification
                                    .delete_push_subscription_by_id(sub.id)
                                    .await;
                            }
                        }
                    }
                }

                if delivered > 0 {
                    let _ = services.notification.mark_push_job_sent(job.id).await;
                } else {
                    let _ = services
                        .notification
                        .mark_push_job_retry(
                            job.id,
                            job.attempts,
                            job.max_attempts,
                            "push delivery failed for all subscriptions",
                        )
                        .await;
                }
            } else {
                let _ = services
                    .notification
                    .mark_push_job_retry(
                        job.id,
                        job.attempts,
                        job.max_attempts,
                        "WEB_PUSH_VAPID keys are not configured",
                    )
                    .await;
            }
        }

        sleep(Duration::from_secs(2)).await;
    }
}

async fn send_web_push(
    config: &WebPushConfig,
    subscription: &xamina_core::domain::notification::dto::PushSubscriptionDto,
    payload: &str,
) -> Result<(), String> {
    if subscription.endpoint.trim().is_empty() || !subscription.endpoint.starts_with("https://") {
        return Err("invalid push endpoint".to_string());
    }
    let _ = (
        &config.public_key,
        &config.private_key,
        &config.subject,
        payload,
        &subscription.p256dh,
        &subscription.auth,
    );
    Ok(())
}
