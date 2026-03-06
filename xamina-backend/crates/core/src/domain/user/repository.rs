use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;

use super::dto::{CreateUserPayload, UpdateUserPayload, UserDto};

#[derive(Debug, Clone)]
pub struct UserRepository {
    pool: PgPool,
}

impl UserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count_users(
        &self,
        tenant_id: Uuid,
        search: Option<String>,
        role: Option<String>,
        is_active: Option<bool>,
        class_id: Option<Uuid>,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM users
             WHERE tenant_id = $1
               AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
               AND ($3::text IS NULL OR role = $3)
               AND ($4::bool IS NULL OR is_active = $4)
               AND ($5::uuid IS NULL OR class_id = $5)",
        )
        .bind(tenant_id)
        .bind(search)
        .bind(role)
        .bind(is_active)
        .bind(class_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count users"))
    }

    pub async fn list_users(
        &self,
        tenant_id: Uuid,
        search: Option<String>,
        role: Option<String>,
        is_active: Option<bool>,
        class_id: Option<Uuid>,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<UserDto>, CoreError> {
        sqlx::query_as::<_, UserDto>(
            "SELECT id, tenant_id, email, name, role, class_id, is_active
             FROM users
             WHERE tenant_id = $1
               AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
               AND ($3::text IS NULL OR role = $3)
               AND ($4::bool IS NULL OR is_active = $4)
               AND ($5::uuid IS NULL OR class_id = $5)
             ORDER BY created_at DESC
             LIMIT $6 OFFSET $7",
        )
        .bind(tenant_id)
        .bind(search)
        .bind(role)
        .bind(is_active)
        .bind(class_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to list users"))
    }

    pub async fn create_user(
        &self,
        tenant_id: Uuid,
        body: &CreateUserPayload,
        password_hash: &str,
    ) -> Result<UserDto, CoreError> {
        sqlx::query_as::<_, UserDto>(
            "INSERT INTO users (tenant_id, email, password_hash, name, role, class_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, tenant_id, email, name, role, class_id, is_active",
        )
        .bind(tenant_id)
        .bind(body.email.to_lowercase())
        .bind(password_hash)
        .bind(body.name.clone())
        .bind(body.role.clone())
        .bind(body.class_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("CREATE_USER_FAILED", "Failed to create user")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn get_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<UserDto>, CoreError> {
        sqlx::query_as::<_, UserDto>(
            "SELECT id, tenant_id, email, name, role, class_id, is_active
             FROM users WHERE id = $1 AND tenant_id = $2",
        )
        .bind(user_id)
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load user"))
    }

    pub async fn update_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        body: &UpdateUserPayload,
        existing: &UserDto,
    ) -> Result<UserDto, CoreError> {
        sqlx::query_as::<_, UserDto>(
            "UPDATE users
             SET email = $1, name = $2, role = $3, class_id = $4, is_active = $5, updated_at = NOW()
             WHERE id = $6 AND tenant_id = $7
             RETURNING id, tenant_id, email, name, role, class_id, is_active",
        )
        .bind(
            body.email
                .clone()
                .unwrap_or_else(|| existing.email.clone())
                .to_lowercase(),
        )
        .bind(body.name.clone().unwrap_or_else(|| existing.name.clone()))
        .bind(body.role.clone().unwrap_or_else(|| existing.role.clone()))
        .bind(body.class_id.or(existing.class_id))
        .bind(body.is_active.unwrap_or(existing.is_active))
        .bind(user_id)
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("UPDATE_USER_FAILED", "Failed to update user")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    pub async fn delete_user(&self, tenant_id: Uuid, user_id: Uuid) -> Result<u64, CoreError> {
        sqlx::query("DELETE FROM users WHERE id = $1 AND tenant_id = $2")
            .bind(user_id)
            .bind(tenant_id)
            .execute(&self.pool)
            .await
            .map(|result| result.rows_affected())
            .map_err(|_| CoreError::internal("DB_ERROR", "Failed to delete user"))
    }

    pub async fn find_class_id_by_name(
        &self,
        tenant_id: Uuid,
        class_name: &str,
    ) -> Result<Option<Uuid>, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM classes
             WHERE tenant_id = $1
               AND name = $2
               AND grade IS NULL
               AND major IS NULL
             LIMIT 1",
        )
        .bind(tenant_id)
        .bind(class_name)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed class lookup"))
    }

    pub async fn create_class(&self, tenant_id: Uuid, class_name: &str) -> Result<Uuid, CoreError> {
        sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO classes (tenant_id, name) VALUES ($1, $2) RETURNING id",
        )
        .bind(tenant_id)
        .bind(class_name)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed class insert"))
    }

    pub async fn insert_student_from_csv(
        &self,
        tenant_id: Uuid,
        email: &str,
        password_hash: &str,
        name: &str,
        class_id: Uuid,
    ) -> Result<u64, CoreError> {
        sqlx::query(
            "INSERT INTO users (tenant_id, email, password_hash, name, role, class_id)
             VALUES ($1, $2, $3, $4, 'siswa', $5)
             ON CONFLICT (tenant_id, email) DO NOTHING",
        )
        .bind(tenant_id)
        .bind(email)
        .bind(password_hash)
        .bind(name)
        .bind(class_id)
        .execute(&self.pool)
        .await
        .map(|result| result.rows_affected())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed user insert"))
    }

    pub async fn get_user_quota_usage(&self, tenant_id: Uuid) -> Result<(i32, i64), CoreError> {
        sqlx::query_as::<_, (i32, i64)>(
            "SELECT
                t.users_quota,
                COALESCE(COUNT(u.id), 0)::bigint AS users_count
             FROM tenants t
             LEFT JOIN users u ON u.tenant_id = t.id
             WHERE t.id = $1
             GROUP BY t.id",
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to read user quota"))?
        .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Tenant not found"))
    }
}
