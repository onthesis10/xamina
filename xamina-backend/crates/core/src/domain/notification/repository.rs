use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;

use super::dto::{
    CreateNotificationInput, EmailJobDto, PushJobDto, PushSubscriptionDto, PushSubscriptionKeys,
};

#[derive(Debug, Clone)]
pub struct NotificationRepository {
    pool: PgPool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct TenantUserRow {
    id: Uuid,
    role: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct NotificationRecipientRow {
    pub id: Uuid,
    pub email: String,
    pub name: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct PushReceiptTargetRow {
    id: Uuid,
    tenant_id: Uuid,
    user_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct EmailJobCreateInput {
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub certificate_id: Option<Uuid>,
    pub to_email: String,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Clone)]
pub struct PushJobCreateInput {
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub certificate_id: Option<Uuid>,
    pub title: String,
    pub body: String,
    pub payload_jsonb: Value,
}

impl NotificationRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        unread_only: bool,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM notifications
             WHERE tenant_id = $1
               AND user_id = $2
               AND ($3::bool = FALSE OR is_read = FALSE)",
        )
        .bind(tenant_id)
        .bind(user_id)
        .bind(unread_only)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count notifications"))
    }

    pub async fn unread_count(&self, tenant_id: Uuid, user_id: Uuid) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM notifications
             WHERE tenant_id = $1
               AND user_id = $2
               AND is_read = FALSE",
        )
        .bind(tenant_id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count unread notifications"))
    }

    pub async fn list(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        unread_only: bool,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<super::dto::NotificationDto>, CoreError> {
        sqlx::query_as::<_, super::dto::NotificationDto>(
            "SELECT id, tenant_id, user_id, type, title, message, payload_jsonb, is_read, created_at, read_at
             FROM notifications
             WHERE tenant_id = $1
               AND user_id = $2
               AND ($3::bool = FALSE OR is_read = FALSE)
             ORDER BY created_at DESC
             LIMIT $4 OFFSET $5",
        )
        .bind(tenant_id)
        .bind(user_id)
        .bind(unread_only)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load notifications"))
    }

    pub async fn mark_read(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        notification_id: Uuid,
    ) -> Result<u64, CoreError> {
        sqlx::query(
            "UPDATE notifications
             SET is_read = TRUE, read_at = NOW()
             WHERE id = $1
               AND tenant_id = $2
               AND user_id = $3
               AND is_read = FALSE",
        )
        .bind(notification_id)
        .bind(tenant_id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update notification"))
    }

    pub async fn mark_all_read(&self, tenant_id: Uuid, user_id: Uuid) -> Result<u64, CoreError> {
        sqlx::query(
            "UPDATE notifications
             SET is_read = TRUE, read_at = NOW()
             WHERE tenant_id = $1
               AND user_id = $2
               AND is_read = FALSE",
        )
        .bind(tenant_id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update notifications"))
    }

    pub async fn insert_many(&self, payloads: &[CreateNotificationInput]) -> Result<(), CoreError> {
        let mut tx = self.pool.begin().await.map_err(|_| {
            CoreError::internal("DB_ERROR", "Failed to start notification transaction")
        })?;
        for payload in payloads {
            sqlx::query(
                "INSERT INTO notifications
                 (tenant_id, user_id, type, title, message, payload_jsonb)
                 VALUES ($1, $2, $3, $4, $5, $6)",
            )
            .bind(payload.tenant_id)
            .bind(payload.user_id)
            .bind(payload.r#type.as_str())
            .bind(payload.title.as_str())
            .bind(payload.message.as_str())
            .bind(payload.payload_jsonb.clone())
            .execute(&mut *tx)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to insert notification"))?;
        }
        tx.commit()
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to commit notifications"))?;
        Ok(())
    }

    pub async fn tenant_student_ids(&self, tenant_id: Uuid) -> Result<Vec<Uuid>, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM users WHERE tenant_id = $1 AND role = 'siswa' AND is_active = TRUE",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load student users"))
    }

    pub async fn tenant_target_user_ids(
        &self,
        tenant_id: Uuid,
        target_roles: Option<&[String]>,
        target_user_ids: Option<&[Uuid]>,
    ) -> Result<Vec<Uuid>, CoreError> {
        let users = sqlx::query_as::<_, TenantUserRow>(
            "SELECT id, role
             FROM users
             WHERE tenant_id = $1
               AND is_active = TRUE",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load target users"))?;

        let roles = target_roles.map(|v| {
            v.iter()
                .map(|it| it.trim().to_ascii_lowercase())
                .collect::<std::collections::HashSet<_>>()
        });
        let ids =
            target_user_ids.map(|v| v.iter().copied().collect::<std::collections::HashSet<_>>());

        Ok(users
            .into_iter()
            .filter(|u| {
                let role_ok = roles
                    .as_ref()
                    .map(|set| set.contains(&u.role.to_ascii_lowercase()))
                    .unwrap_or(true);
                let id_ok = ids.as_ref().map(|set| set.contains(&u.id)).unwrap_or(true);
                role_ok && id_ok
            })
            .map(|u| u.id)
            .collect())
    }

    pub async fn tenant_admin_recipients(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<NotificationRecipientRow>, CoreError> {
        sqlx::query_as::<_, NotificationRecipientRow>(
            "SELECT id, email, name
             FROM users
             WHERE tenant_id = $1
               AND role = 'admin'
               AND is_active = TRUE
             ORDER BY created_at ASC",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load notification recipients"))
    }

    pub async fn upsert_push_subscription(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        keys: &PushSubscriptionKeys,
        user_agent: Option<&str>,
    ) -> Result<PushSubscriptionDto, CoreError> {
        sqlx::query_as::<_, PushSubscriptionDto>(
            "INSERT INTO push_subscriptions
                (tenant_id, user_id, endpoint, p256dh, auth, user_agent, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (user_id, endpoint)
             DO UPDATE SET
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent,
                updated_at = NOW()
             RETURNING id, tenant_id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at",
        )
        .bind(tenant_id)
        .bind(user_id)
        .bind(endpoint)
        .bind(&keys.p256dh)
        .bind(&keys.auth)
        .bind(user_agent)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to upsert push subscription"))
    }

    pub async fn delete_push_subscription(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
    ) -> Result<u64, CoreError> {
        sqlx::query(
            "DELETE FROM push_subscriptions
             WHERE tenant_id = $1
               AND user_id = $2
               AND endpoint = $3",
        )
        .bind(tenant_id)
        .bind(user_id)
        .bind(endpoint)
        .execute(&self.pool)
        .await
        .map(|x| x.rows_affected())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to delete push subscription"))
    }

    pub async fn list_push_subscriptions_for_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<PushSubscriptionDto>, CoreError> {
        sqlx::query_as::<_, PushSubscriptionDto>(
            "SELECT id, tenant_id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at
             FROM push_subscriptions
             WHERE tenant_id = $1
               AND user_id = $2
             ORDER BY created_at DESC",
        )
        .bind(tenant_id)
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load push subscriptions"))
    }

    pub async fn delete_push_subscription_by_id(
        &self,
        subscription_id: Uuid,
    ) -> Result<(), CoreError> {
        sqlx::query("DELETE FROM push_subscriptions WHERE id = $1")
            .bind(subscription_id)
            .execute(&self.pool)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to delete push subscription"))?;
        Ok(())
    }

    pub async fn enqueue_email_job(&self, input: EmailJobCreateInput) -> Result<Uuid, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO email_jobs
                (tenant_id, user_id, certificate_id, to_email, subject, body)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id",
        )
        .bind(input.tenant_id)
        .bind(input.user_id)
        .bind(input.certificate_id)
        .bind(input.to_email)
        .bind(input.subject)
        .bind(input.body)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to enqueue email job"))
    }

    pub async fn enqueue_push_job(&self, input: PushJobCreateInput) -> Result<Uuid, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO push_jobs
                (tenant_id, user_id, certificate_id, title, body, payload_jsonb)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id",
        )
        .bind(input.tenant_id)
        .bind(input.user_id)
        .bind(input.certificate_id)
        .bind(input.title)
        .bind(input.body)
        .bind(input.payload_jsonb)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to enqueue push job"))
    }

    pub async fn claim_due_email_jobs(&self, limit: i64) -> Result<Vec<EmailJobDto>, CoreError> {
        let mut tx = self.pool.begin().await.map_err(|_| {
            CoreError::internal("DB_ERROR", "Failed to start email-claim transaction")
        })?;

        sqlx::query(
            "SELECT set_config('app.role', 'super_admin', true),
                    set_config('app.tenant_id', '', true)",
        )
        .execute(&mut *tx)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to set email-claim context"))?;

        let rows = sqlx::query_as::<_, EmailJobDto>(
            "WITH picked AS (
                SELECT id
                FROM email_jobs
                WHERE status IN ('queued', 'retry')
                  AND next_attempt_at <= NOW()
                ORDER BY next_attempt_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
             )
             UPDATE email_jobs j
             SET status = 'processing',
                 attempts = j.attempts + 1,
                 updated_at = NOW()
             FROM picked
             WHERE j.id = picked.id
             RETURNING
                j.id, j.tenant_id, j.user_id, j.certificate_id, j.to_email, j.subject, j.body,
                j.status, j.attempts, j.max_attempts, j.next_attempt_at, j.last_error, j.sent_at",
        )
        .bind(limit.max(1))
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to claim email jobs"))?;

        tx.commit().await.map_err(|_| {
            CoreError::internal("DB_ERROR", "Failed to commit email-claim transaction")
        })?;

        Ok(rows)
    }

    pub async fn mark_email_job_sent(&self, job_id: Uuid) -> Result<(), CoreError> {
        sqlx::query(
            "UPDATE email_jobs
             SET status = 'sent',
                 sent_at = NOW(),
                 updated_at = NOW(),
                 last_error = NULL
             WHERE id = $1",
        )
        .bind(job_id)
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to mark email job sent"))?;
        Ok(())
    }

    pub async fn mark_email_job_retry(
        &self,
        job_id: Uuid,
        next_attempt_at: DateTime<Utc>,
        error: &str,
        failed: bool,
    ) -> Result<(), CoreError> {
        let status = if failed { "failed" } else { "retry" };
        sqlx::query(
            "UPDATE email_jobs
             SET status = $2,
                 next_attempt_at = $3,
                 last_error = $4,
                 updated_at = NOW()
             WHERE id = $1",
        )
        .bind(job_id)
        .bind(status)
        .bind(next_attempt_at)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update email retry state"))?;
        Ok(())
    }

    pub async fn claim_due_push_jobs(&self, limit: i64) -> Result<Vec<PushJobDto>, CoreError> {
        let mut tx = self.pool.begin().await.map_err(|_| {
            CoreError::internal("DB_ERROR", "Failed to start push-claim transaction")
        })?;

        sqlx::query(
            "SELECT set_config('app.role', 'super_admin', true),
                    set_config('app.tenant_id', '', true)",
        )
        .execute(&mut *tx)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to set push-claim context"))?;

        let rows = sqlx::query_as::<_, PushJobDto>(
            "WITH picked AS (
                SELECT id
                FROM push_jobs
                WHERE status IN ('queued', 'retry')
                  AND next_attempt_at <= NOW()
                ORDER BY next_attempt_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
             )
             UPDATE push_jobs j
             SET status = 'processing',
                 attempts = j.attempts + 1,
                 updated_at = NOW()
             FROM picked
             WHERE j.id = picked.id
             RETURNING
                j.id, j.tenant_id, j.user_id, j.certificate_id, j.title, j.body, j.payload_jsonb,
                j.status, j.attempts, j.max_attempts, j.next_attempt_at, j.last_error, j.sent_at,
                j.receipt_token, j.receipt_received_at, j.receipt_clicked_at",
        )
        .bind(limit.max(1))
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to claim push jobs"))?;

        tx.commit().await.map_err(|_| {
            CoreError::internal("DB_ERROR", "Failed to commit push-claim transaction")
        })?;

        Ok(rows)
    }

    pub async fn mark_push_job_sent(&self, job_id: Uuid) -> Result<(), CoreError> {
        sqlx::query(
            "UPDATE push_jobs
             SET status = 'sent',
                 sent_at = NOW(),
                 updated_at = NOW(),
                 last_error = NULL
             WHERE id = $1",
        )
        .bind(job_id)
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to mark push job sent"))?;
        Ok(())
    }

    pub async fn mark_push_job_retry(
        &self,
        job_id: Uuid,
        next_attempt_at: DateTime<Utc>,
        error: &str,
        failed: bool,
    ) -> Result<(), CoreError> {
        let status = if failed { "failed" } else { "retry" };
        sqlx::query(
            "UPDATE push_jobs
             SET status = $2,
                 next_attempt_at = $3,
                 last_error = $4,
                 updated_at = NOW()
             WHERE id = $1",
        )
        .bind(job_id)
        .bind(status)
        .bind(next_attempt_at)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update push retry state"))?;
        Ok(())
    }

    pub async fn record_push_receipt(
        &self,
        receipt_token: Uuid,
        event_type: &str,
        event_at: DateTime<Utc>,
        metadata_jsonb: Value,
    ) -> Result<Option<(Uuid, bool)>, CoreError> {
        let mut tx =
            self.pool.begin().await.map_err(|_| {
                CoreError::internal("DB_ERROR", "Failed to start receipt transaction")
            })?;

        sqlx::query("SELECT set_config('app.role', 'super_admin', true)")
            .execute(&mut *tx)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to set receipt context"))?;

        let target = sqlx::query_as::<_, PushReceiptTargetRow>(
            "SELECT id, tenant_id, user_id
             FROM push_jobs
             WHERE receipt_token = $1
             FOR UPDATE",
        )
        .bind(receipt_token)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to resolve push receipt token"))?;

        let Some(target) = target else {
            tx.rollback().await.map_err(|_| {
                CoreError::internal("DB_ERROR", "Failed to rollback receipt transaction")
            })?;
            return Ok(None);
        };

        let inserted = sqlx::query(
            "INSERT INTO push_delivery_receipts
                (tenant_id, user_id, push_job_id, event_type, event_at, metadata_jsonb)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (push_job_id, event_type) DO NOTHING",
        )
        .bind(target.tenant_id)
        .bind(target.user_id)
        .bind(target.id)
        .bind(event_type)
        .bind(event_at)
        .bind(metadata_jsonb)
        .execute(&mut *tx)
        .await
        .map(|x| x.rows_affected() > 0)
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to insert push receipt"))?;

        let marker_sql = if event_type == "clicked" {
            "UPDATE push_jobs
             SET receipt_clicked_at = COALESCE(receipt_clicked_at, $2),
                 updated_at = NOW()
             WHERE id = $1"
        } else {
            "UPDATE push_jobs
             SET receipt_received_at = COALESCE(receipt_received_at, $2),
                 updated_at = NOW()
             WHERE id = $1"
        };

        sqlx::query(marker_sql)
            .bind(target.id)
            .bind(event_at)
            .execute(&mut *tx)
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to update push receipt marker"))?;

        tx.commit()
            .await
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to commit receipt transaction"))?;

        Ok(Some((target.id, inserted)))
    }
}
