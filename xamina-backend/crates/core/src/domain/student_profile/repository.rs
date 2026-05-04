use sqlx::PgPool;
use uuid::Uuid;

use crate::error::CoreError;
use super::dto::StudentProfileDto;

#[derive(Debug, Clone)]
pub struct StudentProfileRepository {
    pool: PgPool,
}

impl StudentProfileRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_profile(&self, user_id: Uuid) -> Result<Option<StudentProfileDto>, CoreError> {
        sqlx::query_as::<_, StudentProfileDto>(
            "SELECT id, user_id, nisn, created_at
             FROM student_profiles
             WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load student profile"))
    }

    pub async fn upsert_profile(
        &self,
        user_id: Uuid,
        nisn: Option<&str>,
    ) -> Result<StudentProfileDto, CoreError> {
        sqlx::query_as::<_, StudentProfileDto>(
            "INSERT INTO student_profiles (user_id, nisn)
             VALUES ($1, $2)
             ON CONFLICT (user_id)
             DO UPDATE SET nisn = EXCLUDED.nisn, updated_at = NOW()
             RETURNING id, user_id, nisn, created_at",
        )
        .bind(user_id)
        .bind(nisn)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            CoreError::bad_request("UPSERT_PROFILE_FAILED", "Failed to upsert student profile")
                .with_details(serde_json::json!({ "db_error": e.to_string() }))
        })
    }

    /// Create an empty profile for a new student (called during user creation)
    pub async fn ensure_profile(&self, user_id: Uuid) -> Result<(), CoreError> {
        sqlx::query(
            "INSERT INTO student_profiles (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to ensure student profile"))
    }
}
