use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{
        CreateAssignmentPayload, ListAssignmentsQuery, ListAssignmentsResult, PageMeta,
        TeacherAssignmentRaw, TeacherSubjectClassDto, TeacherSubjectDto,
    },
    repository::TeacherAssignmentRepository,
};

#[derive(Debug, Clone)]
pub struct TeacherAssignmentService {
    repo: TeacherAssignmentRepository,
}

impl TeacherAssignmentService {
    pub fn new(repo: TeacherAssignmentRepository) -> Self {
        Self { repo }
    }

    pub async fn list_assignments(
        &self,
        tenant_id: Uuid,
        query: ListAssignmentsQuery,
    ) -> Result<ListAssignmentsResult, CoreError> {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(50).clamp(1, 200);
        let offset = (page - 1) * page_size;

        let total = self
            .repo
            .count_assignments(tenant_id, query.teacher_id, query.subject_id, query.class_id)
            .await?;
        let rows = self
            .repo
            .list_assignments(
                tenant_id,
                query.teacher_id,
                query.subject_id,
                query.class_id,
                page_size,
                offset,
            )
            .await?;

        Ok(ListAssignmentsResult {
            rows,
            meta: PageMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn create_assignment(
        &self,
        tenant_id: Uuid,
        body: CreateAssignmentPayload,
    ) -> Result<TeacherAssignmentRaw, CoreError> {
        self.repo.create_assignment(tenant_id, &body).await
    }

    pub async fn delete_assignment(
        &self,
        tenant_id: Uuid,
        assignment_id: Uuid,
    ) -> Result<(), CoreError> {
        let affected = self.repo.delete_assignment(tenant_id, assignment_id).await?;
        if affected == 0 {
            return Err(CoreError::not_found(
                "NOT_FOUND",
                "Teacher assignment not found",
            ));
        }
        Ok(())
    }

    pub async fn teacher_subjects(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
    ) -> Result<Vec<TeacherSubjectDto>, CoreError> {
        self.repo.teacher_subjects(tenant_id, teacher_id).await
    }

    pub async fn teacher_classes_for_subject(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
        subject_id: Uuid,
    ) -> Result<Vec<TeacherSubjectClassDto>, CoreError> {
        self.repo
            .teacher_classes_for_subject(tenant_id, teacher_id, subject_id)
            .await
    }

    pub async fn teacher_has_assignment(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
        subject_id: Uuid,
        class_id: Uuid,
    ) -> Result<bool, CoreError> {
        self.repo
            .teacher_has_assignment(tenant_id, teacher_id, subject_id, class_id)
            .await
    }

    pub async fn teacher_class_ids(
        &self,
        tenant_id: Uuid,
        teacher_id: Uuid,
    ) -> Result<Vec<Uuid>, CoreError> {
        self.repo.teacher_class_ids(tenant_id, teacher_id).await
    }
}
