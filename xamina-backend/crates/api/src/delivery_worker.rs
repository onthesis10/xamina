use std::time::Duration;

use anyhow::Context;
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use tokio::time::sleep;
use tracing::{error, info, warn};
#[cfg(feature = "real_web_push")]
use web_push::{
    ContentEncoding, HyperWebPushClient, SubscriptionInfo, VapidSignatureBuilder, WebPushClient,
    WebPushError, WebPushMessageBuilder, URL_SAFE_NO_PAD,
};

use crate::services::AppServices;

#[cfg(feature = "real_web_push")]
type PushClient = HyperWebPushClient;
#[cfg(not(feature = "real_web_push"))]
struct PushClient;

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
#[cfg_attr(not(feature = "real_web_push"), allow(dead_code))]
struct WebPushConfig {
    public_key: String,
    private_key: String,
    subject: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PushDeliveryClassification {
    InvalidSubscription,
    Retryable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PushJobOutcome {
    Sent,
    Retry(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(not(feature = "real_web_push"), allow(dead_code))]
enum PushSendError {
    InvalidSubscription(String),
    Retryable(String),
}

impl PushSendError {
    fn classification(&self) -> PushDeliveryClassification {
        match self {
            PushSendError::InvalidSubscription(_) => {
                PushDeliveryClassification::InvalidSubscription
            }
            PushSendError::Retryable(_) => PushDeliveryClassification::Retryable,
        }
    }

    fn message(&self) -> &str {
        match self {
            PushSendError::InvalidSubscription(message) | PushSendError::Retryable(message) => {
                message
            }
        }
    }
}

impl std::fmt::Display for PushSendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message())
    }
}

impl SmtpConfig {
    fn from_env() -> Option<Self> {
        let host = env_non_empty("SMTP_HOST")?;
        let port = std::env::var("SMTP_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(1025);
        let username = env_non_empty("SMTP_USERNAME");
        let password = env_non_empty("SMTP_PASSWORD");
        let from_email =
            env_non_empty("SMTP_FROM_EMAIL").unwrap_or_else(|| "noreply@xamina.local".to_string());
        let from_name = env_non_empty("SMTP_FROM_NAME").unwrap_or_else(|| "Xamina".to_string());
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
        let public_key = env_non_empty("WEB_PUSH_VAPID_PUBLIC_KEY")?;
        let private_key = env_non_empty("WEB_PUSH_VAPID_PRIVATE_KEY")?;
        let subject = env_non_empty("WEB_PUSH_SUBJECT")
            .unwrap_or_else(|| "mailto:admin@xamina.local".to_string());
        Some(Self {
            public_key,
            private_key,
            subject,
        })
    }
}

pub fn validate_delivery_config() {
    validate_smtp_config();
    validate_web_push_config();
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
    if let Some(config) = push_config.as_ref() {
        info!(
            public_key_len = config.public_key.len(),
            "push worker enabled with configured VAPID keypair"
        );
    }
    let push_client = push_config.as_ref().map(|_| build_push_client());

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
                let Some(client) = push_client.as_ref() else {
                    let _ = services
                        .notification
                        .mark_push_job_retry(
                            job.id,
                            job.attempts,
                            job.max_attempts,
                            "Web push client is not configured",
                        )
                        .await;
                    continue;
                };

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

                let mut payload_data = job.payload_jsonb.clone();
                if let serde_json::Value::Object(ref mut map) = payload_data {
                    map.insert("push_job_id".to_string(), serde_json::json!(job.id));
                    map.insert(
                        "receipt_token".to_string(),
                        serde_json::json!(job.receipt_token),
                    );
                    if !map.contains_key("url") {
                        map.insert(
                            "url".to_string(),
                            serde_json::Value::String("/app/dashboard".to_string()),
                        );
                    }
                } else {
                    payload_data = serde_json::json!({
                        "push_job_id": job.id,
                        "receipt_token": job.receipt_token,
                        "url": "/app/dashboard",
                    });
                }

                let payload = serde_json::json!({
                    "title": job.title,
                    "body": job.body,
                    "data": payload_data,
                })
                .to_string();

                let mut delivered = 0usize;
                let mut invalid_subscriptions = 0usize;
                let mut retryable_errors = 0usize;
                let mut last_retryable_error =
                    String::from("push delivery failed for all subscriptions");
                for sub in &subscriptions {
                    match send_web_push(client, config, sub, &payload).await {
                        Ok(_) => {
                            delivered += 1;
                        }
                        Err(err) => {
                            let classification = err.classification();
                            let err_text = err.message().to_string();
                            warn!(
                                subscription_id = %sub.id,
                                job_id = %job.id,
                                classification = ?classification,
                                error = %err,
                                "failed to deliver push"
                            );
                            match classification {
                                PushDeliveryClassification::InvalidSubscription => {
                                    invalid_subscriptions += 1;
                                    let _ = services
                                        .notification
                                        .delete_push_subscription_by_id(sub.id)
                                        .await;
                                }
                                PushDeliveryClassification::Retryable => {
                                    retryable_errors += 1;
                                    last_retryable_error = err_text;
                                }
                            }
                        }
                    }
                }

                let outcome = decide_push_job_outcome(
                    delivered,
                    retryable_errors,
                    invalid_subscriptions,
                    last_retryable_error,
                );
                if let PushJobOutcome::Sent = outcome {
                    let _ = services.notification.mark_push_job_sent(job.id).await;
                } else {
                    let PushJobOutcome::Retry(retry_reason) = outcome else {
                        unreachable!();
                    };
                    let _ = services
                        .notification
                        .mark_push_job_retry(job.id, job.attempts, job.max_attempts, &retry_reason)
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

#[cfg(feature = "real_web_push")]
fn build_push_client() -> PushClient {
    PushClient::new()
}

#[cfg(not(feature = "real_web_push"))]
fn build_push_client() -> PushClient {
    PushClient
}

#[cfg(feature = "real_web_push")]
async fn send_web_push(
    client: &PushClient,
    config: &WebPushConfig,
    subscription: &xamina_core::domain::notification::dto::PushSubscriptionDto,
    payload: &str,
) -> Result<(), PushSendError> {
    if subscription.endpoint.trim().is_empty() || !subscription.endpoint.starts_with("https://") {
        return Err(PushSendError::InvalidSubscription(
            "invalid push endpoint".to_string(),
        ));
    }

    let info = SubscriptionInfo::new(
        &subscription.endpoint,
        &subscription.p256dh,
        &subscription.auth,
    );
    let mut vapid_builder =
        VapidSignatureBuilder::from_base64(&config.private_key, URL_SAFE_NO_PAD, &info)
            .map_err(map_web_push_error)?;
    vapid_builder.add_claim("sub", config.subject.as_str());
    let vapid_signature = vapid_builder.build().map_err(map_web_push_error)?;

    let mut message_builder = WebPushMessageBuilder::new(&info);
    message_builder.set_ttl(3600);
    message_builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
    message_builder.set_vapid_signature(vapid_signature);

    client
        .send(message_builder.build().map_err(map_web_push_error)?)
        .await
        .map_err(map_web_push_error)
}

#[cfg(not(feature = "real_web_push"))]
async fn send_web_push(
    _client: &PushClient,
    _config: &WebPushConfig,
    _subscription: &xamina_core::domain::notification::dto::PushSubscriptionDto,
    _payload: &str,
) -> Result<(), PushSendError> {
    Err(PushSendError::Retryable(
        "REAL_WEB_PUSH feature is disabled at compile time".to_string(),
    ))
}

#[cfg(feature = "real_web_push")]
fn map_web_push_error(err: WebPushError) -> PushSendError {
    match err {
        WebPushError::EndpointNotValid
        | WebPushError::EndpointNotFound
        | WebPushError::InvalidUri
        | WebPushError::InvalidCryptoKeys
        | WebPushError::MissingCryptoKeys
        | WebPushError::InvalidPackageName => PushSendError::InvalidSubscription(err.to_string()),
        _ => PushSendError::Retryable(err.to_string()),
    }
}

fn decide_push_job_outcome(
    delivered: usize,
    retryable_errors: usize,
    invalid_subscriptions: usize,
    retry_reason: String,
) -> PushJobOutcome {
    if delivered > 0 {
        return PushJobOutcome::Sent;
    }
    if retryable_errors > 0 {
        return PushJobOutcome::Retry(retry_reason);
    }
    if invalid_subscriptions > 0 {
        // Job is considered processed after all invalid subscriptions are cleaned up.
        return PushJobOutcome::Sent;
    }
    PushJobOutcome::Retry("push delivery failed for all subscriptions".to_string())
}

fn env_non_empty(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn validate_smtp_config() {
    let smtp_host = env_non_empty("SMTP_HOST");
    let smtp_related_set = [
        env_non_empty("SMTP_PORT"),
        env_non_empty("SMTP_USERNAME"),
        env_non_empty("SMTP_PASSWORD"),
        env_non_empty("SMTP_FROM_EMAIL"),
        env_non_empty("SMTP_FROM_NAME"),
    ]
    .iter()
    .any(Option::is_some);

    match smtp_host {
        Some(host) => {
            info!(smtp_host = %host, "smtp delivery configured");
        }
        None if smtp_related_set => {
            warn!(
                "SMTP variables are partially set but SMTP_HOST is missing; email jobs will retry"
            );
        }
        None => {
            warn!("SMTP is not configured; email jobs will stay in retry/failed states");
        }
    }
}

fn validate_web_push_config() {
    let public_key = env_non_empty("WEB_PUSH_VAPID_PUBLIC_KEY");
    let private_key = env_non_empty("WEB_PUSH_VAPID_PRIVATE_KEY");
    let subject = env_non_empty("WEB_PUSH_SUBJECT")
        .unwrap_or_else(|| "mailto:admin@xamina.local".to_string());

    match (public_key, private_key) {
        (Some(public), Some(private)) => {
            #[cfg(feature = "real_web_push")]
            {
                if VapidSignatureBuilder::from_base64_no_sub(&private, URL_SAFE_NO_PAD).is_err() {
                    warn!(
                        "WEB_PUSH_VAPID_PRIVATE_KEY is not a valid raw base64url private key; push jobs will retry"
                    );
                } else if !subject.starts_with("mailto:") && !subject.starts_with("https://") {
                    warn!(
                        "WEB_PUSH_SUBJECT should start with mailto: or https:// for VAPID compliance"
                    );
                } else {
                    info!(
                        web_push_enabled = true,
                        public_key_len = public.len(),
                        "web push VAPID configured"
                    );
                }
            }
            #[cfg(not(feature = "real_web_push"))]
            {
                let _ = (&private, &subject);
                warn!(
                    "WEB_PUSH_VAPID_* keys are set but REAL_WEB_PUSH feature is disabled at compile time"
                );
                info!(
                    web_push_enabled = false,
                    public_key_len = public.len(),
                    "web push runtime validation skipped"
                );
            }
        }
        (Some(_), None) | (None, Some(_)) => {
            warn!(
                "WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY must both be set; push jobs will retry"
            );
        }
        (None, None) => {
            warn!("Web push is not configured; push jobs will stay in retry/failed states");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        decide_push_job_outcome, PushDeliveryClassification, PushJobOutcome, PushSendError,
    };

    #[test]
    fn push_send_error_classification_invalid_subscription() {
        let class = PushSendError::InvalidSubscription("invalid".to_string()).classification();
        assert_eq!(class, PushDeliveryClassification::InvalidSubscription);
    }

    #[test]
    fn push_send_error_classification_retryable() {
        let class = PushSendError::Retryable("transient".to_string()).classification();
        assert_eq!(class, PushDeliveryClassification::Retryable);
    }

    #[test]
    fn decide_push_job_outcome_marks_sent_when_delivery_succeeds() {
        let outcome = decide_push_job_outcome(1, 0, 0, "x".to_string());
        assert_eq!(outcome, PushJobOutcome::Sent);
    }

    #[test]
    fn decide_push_job_outcome_marks_retry_on_transient_failure() {
        let outcome = decide_push_job_outcome(0, 1, 0, "transient".to_string());
        assert_eq!(outcome, PushJobOutcome::Retry("transient".to_string()));
    }

    #[test]
    fn decide_push_job_outcome_marks_sent_on_invalid_subscriptions_only() {
        let outcome = decide_push_job_outcome(0, 0, 2, "x".to_string());
        assert_eq!(outcome, PushJobOutcome::Sent);
    }
}
