use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{StudentProfileDto, UpsertProfilePayload},
    repository::StudentProfileRepository,
};

#[derive(Debug, Clone)]
pub struct StudentProfileService {
    repo: StudentProfileRepository,
}

impl StudentProfileService {
    pub fn new(repo: StudentProfileRepository) -> Self {
        Self { repo }
    }

    pub async fn get_profile(&self, user_id: Uuid) -> Result<StudentProfileDto, CoreError> {
        self.repo
            .get_profile(user_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Student profile not found"))
    }

    pub async fn upsert_profile(
        &self,
        user_id: Uuid,
        body: UpsertProfilePayload,
    ) -> Result<StudentProfileDto, CoreError> {
        self.repo
            .upsert_profile(user_id, body.nisn.as_deref())
            .await
    }

    pub async fn ensure_profile(&self, user_id: Uuid) -> Result<(), CoreError> {
        self.repo.ensure_profile(user_id).await
    }
}
