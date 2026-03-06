use chrono::{Duration, Utc};
use serde_json::json;
use uuid::Uuid;

use crate::{domain::certificate::dto::CertificateDto, error::CoreError};

use super::{
    dto::{
        BroadcastNotificationRequest, BroadcastNotificationResult, CertificateDeliveryResult,
        CreateNotificationInput, EmailJobDto, ListNotificationsQuery, NotificationListMeta,
        PushJobDto, PushSubscribeRequest, PushSubscriptionDto,
    },
    models::NotificationListResult,
    repository::{EmailJobCreateInput, NotificationRepository, PushJobCreateInput},
};

#[derive(Debug, Clone)]
pub struct NotificationService {
    repo: NotificationRepository,
}

impl NotificationService {
    pub fn new(repo: NotificationRepository) -> Self {
        Self { repo }
    }

    pub async fn list(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        query: ListNotificationsQuery,
    ) -> Result<NotificationListResult, CoreError> {
        let (page, page_size) = normalize_page(query.page, query.page_size);
        let offset = (page - 1) * page_size;
        let unread_only = query.unread_only.unwrap_or(false);

        let total = self.repo.count(tenant_id, user_id, unread_only).await?;
        let unread_count = self.repo.unread_count(tenant_id, user_id).await?;
        let rows = self
            .repo
            .list(tenant_id, user_id, unread_only, page_size, offset)
            .await?;

        Ok(NotificationListResult {
            rows,
            meta: NotificationListMeta {
                page,
                page_size,
                total,
                unread_count,
            },
        })
    }

    pub async fn mark_read(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        notification_id: Uuid,
    ) -> Result<(), CoreError> {
        self.repo
            .mark_read(tenant_id, user_id, notification_id)
            .await?;
        Ok(())
    }

    pub async fn mark_all_read(&self, tenant_id: Uuid, user_id: Uuid) -> Result<u64, CoreError> {
        self.repo.mark_all_read(tenant_id, user_id).await
    }

    pub async fn notify_exam_published(
        &self,
        tenant_id: Uuid,
        exam_id: Uuid,
        exam_title: &str,
    ) -> Result<(), CoreError> {
        let student_ids = self.repo.tenant_student_ids(tenant_id).await?;
        if student_ids.is_empty() {
            return Ok(());
        }

        let payloads = student_ids
            .into_iter()
            .map(|user_id| CreateNotificationInput {
                tenant_id,
                user_id,
                r#type: "exam_published".to_string(),
                title: "Ujian Baru Dipublish".to_string(),
                message: format!("Ujian \"{exam_title}\" sudah tersedia untuk dikerjakan."),
                payload_jsonb: json!({
                    "exam_id": exam_id,
                    "created_at": Utc::now(),
                }),
            })
            .collect::<Vec<_>>();

        self.repo.insert_many(&payloads).await
    }

    pub async fn notify_submission_finished(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        exam_id: Uuid,
        score: f64,
        passed: bool,
    ) -> Result<(), CoreError> {
        let payload = CreateNotificationInput {
            tenant_id,
            user_id,
            r#type: "submission_finished".to_string(),
            title: "Hasil Ujian Tersedia".to_string(),
            message: if passed {
                format!("Ujian selesai. Skor Anda: {:.2} (LULUS).", score)
            } else {
                format!("Ujian selesai. Skor Anda: {:.2} (BELUM LULUS).", score)
            },
            payload_jsonb: json!({
                "exam_id": exam_id,
                "score": score,
                "passed": passed,
                "created_at": Utc::now(),
            }),
        };
        self.repo.insert_many(&[payload]).await
    }

    pub async fn notify_certificate_issued(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        certificate: &CertificateDto,
        exam_title: &str,
        recipient_email: &str,
    ) -> Result<CertificateDeliveryResult, CoreError> {
        self.repo
            .insert_many(&[CreateNotificationInput {
                tenant_id,
                user_id,
                r#type: "certificate_issued".to_string(),
                title: "Sertifikat Tersedia".to_string(),
                message: format!("Sertifikat untuk ujian \"{exam_title}\" sudah tersedia."),
                payload_jsonb: json!({
                    "certificate_id": certificate.id,
                    "submission_id": certificate.submission_id,
                    "exam_id": certificate.exam_id,
                    "issued_at": certificate.issued_at,
                }),
            }])
            .await?;

        let email_job_id = self
            .repo
            .enqueue_email_job(EmailJobCreateInput {
                tenant_id,
                user_id,
                certificate_id: Some(certificate.id),
                to_email: recipient_email.to_string(),
                subject: format!("Sertifikat Anda: {exam_title}"),
                body: format!(
                    "Sertifikat ujian Anda sudah terbit.\nNomor: {}\nSkor: {:.2}\nLink: {}",
                    certificate.certificate_no, certificate.score, certificate.file_url
                ),
            })
            .await
            .ok();

        let push_job_id = self
            .repo
            .enqueue_push_job(PushJobCreateInput {
                tenant_id,
                user_id,
                certificate_id: Some(certificate.id),
                title: "Sertifikat Tersedia".to_string(),
                body: format!("Sertifikat ujian \"{exam_title}\" sudah tersedia."),
                payload_jsonb: json!({
                    "type": "certificate_issued",
                    "certificate_id": certificate.id,
                    "certificate_url": certificate.file_url,
                }),
            })
            .await
            .ok();

        Ok(CertificateDeliveryResult {
            email_job_id,
            push_job_id,
        })
    }

    pub async fn broadcast(
        &self,
        tenant_id: Uuid,
        req: BroadcastNotificationRequest,
    ) -> Result<BroadcastNotificationResult, CoreError> {
        let title = req.title.trim();
        let message = req.message.trim();
        if title.is_empty() || message.is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "title and message are required",
            ));
        }
        if title.len() > 200 || message.len() > 5000 {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "title/message exceed allowed size",
            ));
        }

        let users = self
            .repo
            .tenant_target_user_ids(
                tenant_id,
                req.target_roles.as_deref(),
                req.target_user_ids.as_deref(),
            )
            .await?;
        if users.is_empty() {
            return Ok(BroadcastNotificationResult {
                targeted_users: 0,
                created_notifications: 0,
                enqueued_push_jobs: 0,
                push_job_ids: vec![],
            });
        }

        let payloads = users
            .iter()
            .map(|user_id| CreateNotificationInput {
                tenant_id,
                user_id: *user_id,
                r#type: "broadcast".to_string(),
                title: title.to_string(),
                message: message.to_string(),
                payload_jsonb: json!({
                    "broadcast": true,
                    "created_at": Utc::now(),
                }),
            })
            .collect::<Vec<_>>();
        self.repo.insert_many(&payloads).await?;

        let mut push_job_ids = Vec::new();
        if req.send_push.unwrap_or(true) {
            for user_id in &users {
                if let Ok(job_id) = self
                    .repo
                    .enqueue_push_job(PushJobCreateInput {
                        tenant_id,
                        user_id: *user_id,
                        certificate_id: None,
                        title: title.to_string(),
                        body: message.to_string(),
                        payload_jsonb: json!({
                            "type": "broadcast",
                            "created_at": Utc::now(),
                        }),
                    })
                    .await
                {
                    push_job_ids.push(job_id);
                }
            }
        }

        Ok(BroadcastNotificationResult {
            targeted_users: users.len(),
            created_notifications: payloads.len(),
            enqueued_push_jobs: push_job_ids.len(),
            push_job_ids,
        })
    }

    pub async fn subscribe_push(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        req: PushSubscribeRequest,
    ) -> Result<PushSubscriptionDto, CoreError> {
        if req.endpoint.trim().is_empty()
            || req.keys.p256dh.trim().is_empty()
            || req.keys.auth.trim().is_empty()
        {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "endpoint and keys are required",
            ));
        }
        self.repo
            .upsert_push_subscription(
                tenant_id,
                user_id,
                req.endpoint.trim(),
                &req.keys,
                req.user_agent.as_deref(),
            )
            .await
    }

    pub async fn unsubscribe_push(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
    ) -> Result<u64, CoreError> {
        self.repo
            .delete_push_subscription(tenant_id, user_id, endpoint)
            .await
    }

    pub async fn list_push_subscriptions(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<PushSubscriptionDto>, CoreError> {
        self.repo
            .list_push_subscriptions_for_user(tenant_id, user_id)
            .await
    }

    pub async fn claim_due_email_jobs(&self, limit: i64) -> Result<Vec<EmailJobDto>, CoreError> {
        self.repo.claim_due_email_jobs(limit).await
    }

    pub async fn mark_email_job_sent(&self, job_id: Uuid) -> Result<(), CoreError> {
        self.repo.mark_email_job_sent(job_id).await
    }

    pub async fn mark_email_job_retry(
        &self,
        job_id: Uuid,
        attempts: i32,
        max_attempts: i32,
        error: &str,
    ) -> Result<(), CoreError> {
        let failed = attempts >= max_attempts;
        let delay_minutes = 2_i64.pow((attempts.min(6) as u32).saturating_sub(1));
        let next_attempt_at = Utc::now() + Duration::minutes(delay_minutes.max(1));
        self.repo
            .mark_email_job_retry(job_id, next_attempt_at, error, failed)
            .await
    }

    pub async fn claim_due_push_jobs(&self, limit: i64) -> Result<Vec<PushJobDto>, CoreError> {
        self.repo.claim_due_push_jobs(limit).await
    }

    pub async fn mark_push_job_sent(&self, job_id: Uuid) -> Result<(), CoreError> {
        self.repo.mark_push_job_sent(job_id).await
    }

    pub async fn mark_push_job_retry(
        &self,
        job_id: Uuid,
        attempts: i32,
        max_attempts: i32,
        error: &str,
    ) -> Result<(), CoreError> {
        let failed = attempts >= max_attempts;
        let delay_minutes = 2_i64.pow((attempts.min(6) as u32).saturating_sub(1));
        let next_attempt_at = Utc::now() + Duration::minutes(delay_minutes.max(1));
        self.repo
            .mark_push_job_retry(job_id, next_attempt_at, error, failed)
            .await
    }

    pub async fn delete_push_subscription_by_id(
        &self,
        subscription_id: Uuid,
    ) -> Result<(), CoreError> {
        self.repo
            .delete_push_subscription_by_id(subscription_id)
            .await
    }
}

fn normalize_page(page: Option<i64>, page_size: Option<i64>) -> (i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).clamp(1, 100);
    (page, page_size)
}

#[cfg(test)]
mod tests {
    use super::normalize_page;

    #[test]
    fn normalize_page_should_apply_defaults() {
        let (page, page_size) = normalize_page(None, None);
        assert_eq!(page, 1);
        assert_eq!(page_size, 20);
    }

    #[test]
    fn normalize_page_should_clamp_values() {
        let (page, page_size) = normalize_page(Some(-10), Some(999));
        assert_eq!(page, 1);
        assert_eq!(page_size, 100);
    }
}
