use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{
        CreateSubjectPayload, ListSubjectsQuery, ListSubjectsResult, PageMeta, SubjectDto,
        UpdateSubjectPayload,
    },
    repository::SubjectRepository,
};

#[derive(Debug, Clone)]
pub struct SubjectService {
    repo: SubjectRepository,
}

impl SubjectService {
    pub fn new(repo: SubjectRepository) -> Self {
        Self { repo }
    }

    pub async fn list_subjects(
        &self,
        tenant_id: Uuid,
        query: ListSubjectsQuery,
    ) -> Result<ListSubjectsResult, CoreError> {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(50).clamp(1, 200);
        let offset = (page - 1) * page_size;

        let total = self.repo.count_subjects(tenant_id, query.search.clone()).await?;
        let rows = self
            .repo
            .list_subjects(tenant_id, query.search, page_size, offset)
            .await?;

        Ok(ListSubjectsResult {
            rows,
            meta: PageMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn list_all_active(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<SubjectDto>, CoreError> {
        self.repo.list_all_active(tenant_id).await
    }

    pub async fn get_subject(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
    ) -> Result<SubjectDto, CoreError> {
        self.repo
            .get_subject(tenant_id, subject_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Subject not found"))
    }

    pub async fn create_subject(
        &self,
        tenant_id: Uuid,
        body: CreateSubjectPayload,
    ) -> Result<SubjectDto, CoreError> {
        if body.name.trim().is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "Subject name is required",
            ));
        }
        self.repo.create_subject(tenant_id, &body).await
    }

    pub async fn update_subject(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
        body: UpdateSubjectPayload,
    ) -> Result<SubjectDto, CoreError> {
        if let Some(name) = &body.name {
            if name.trim().is_empty() {
                return Err(CoreError::bad_request(
                    "VALIDATION_ERROR",
                    "Subject name cannot be empty",
                ));
            }
        }
        let existing = self
            .repo
            .get_subject(tenant_id, subject_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Subject not found"))?;
        self.repo
            .update_subject(tenant_id, subject_id, &body, &existing)
            .await
    }

    pub async fn delete_subject(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
    ) -> Result<(), CoreError> {
        let affected = self.repo.delete_subject(tenant_id, subject_id).await?;
        if affected == 0 {
            return Err(CoreError::not_found("NOT_FOUND", "Subject not found"));
        }
        Ok(())
    }

    pub async fn subject_exists(
        &self,
        tenant_id: Uuid,
        subject_id: Uuid,
    ) -> Result<bool, CoreError> {
        self.repo.subject_exists(tenant_id, subject_id).await
    }
}
