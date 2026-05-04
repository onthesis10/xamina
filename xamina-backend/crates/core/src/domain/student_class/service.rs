use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{
        ActiveClassDto, AssignClassPayload, PromoteError, PromoteResult,
        PromoteStudentsPayload, StudentClassHistoryDto, StudentClassHistoryRaw,
    },
    repository::StudentClassRepository,
};

#[derive(Debug, Clone)]
pub struct StudentClassService {
    repo: StudentClassRepository,
}

impl StudentClassService {
    pub fn new(repo: StudentClassRepository) -> Self {
        Self { repo }
    }

    pub async fn get_history(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<Vec<StudentClassHistoryDto>, CoreError> {
        self.repo.get_history(tenant_id, student_id).await
    }

    pub async fn get_active_class(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<Option<ActiveClassDto>, CoreError> {
        self.repo.get_active_class(tenant_id, student_id).await
    }

    pub async fn get_active_class_id(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<Option<Uuid>, CoreError> {
        self.repo.get_active_class_id(tenant_id, student_id).await
    }

    pub async fn assign_class(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        body: AssignClassPayload,
    ) -> Result<StudentClassHistoryRaw, CoreError> {
        if body.academic_year.trim().is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "academic_year is required",
            ));
        }
        self.repo
            .assign_class(tenant_id, student_id, body.class_id, &body.academic_year)
            .await
    }

    pub async fn promote_students(
        &self,
        tenant_id: Uuid,
        body: PromoteStudentsPayload,
    ) -> Result<PromoteResult, CoreError> {
        if body.student_ids.is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "student_ids cannot be empty",
            ));
        }
        if body.new_academic_year.trim().is_empty() {
            return Err(CoreError::bad_request(
                "VALIDATION_ERROR",
                "new_academic_year is required",
            ));
        }

        let mut promoted_count = 0usize;
        let mut errors = Vec::new();

        for student_id in &body.student_ids {
            // Deactivate old
            if let Err(e) = self.repo.deactivate_student(tenant_id, *student_id).await {
                errors.push(PromoteError {
                    student_id: *student_id,
                    reason: format!("Deactivate failed: {}", e.message),
                });
                continue;
            }

            // Assign new class
            match self
                .repo
                .assign_class(
                    tenant_id,
                    *student_id,
                    body.new_class_id,
                    &body.new_academic_year,
                )
                .await
            {
                Ok(_) => promoted_count += 1,
                Err(e) => {
                    errors.push(PromoteError {
                        student_id: *student_id,
                        reason: format!("Assign failed: {}", e.message),
                    });
                }
            }
        }

        Ok(PromoteResult {
            promoted_count,
            errors,
        })
    }

    pub async fn ensure_history(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        class_id: Uuid,
        academic_year: &str,
    ) -> Result<(), CoreError> {
        self.repo
            .ensure_history(tenant_id, student_id, class_id, academic_year)
            .await
    }
}
