use crate::domain::ai::{
    dto::{
        ExtractPdfResponse, GenerateQuestionRequest, GenerateQuestionResponse, GradeEssayRequest,
        GradeEssayResponse,
    },
    models::AiUsageSummary,
    service::AiService,
};
use crate::error::CoreError;
use uuid::Uuid;

pub struct AiHandler;

impl AiHandler {
    pub async fn extract_pdf(
        service: &AiService,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        pdf_bytes: &[u8],
    ) -> Result<(ExtractPdfResponse, AiUsageSummary), CoreError> {
        service
            .extract_pdf_bytes(tenant_id, user_id, endpoint, pdf_bytes)
            .await
    }

    pub async fn generate_questions(
        service: &AiService,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        req: GenerateQuestionRequest,
    ) -> Result<(GenerateQuestionResponse, AiUsageSummary), CoreError> {
        service
            .generate_questions(tenant_id, user_id, endpoint, req)
            .await
    }

    pub async fn grade_essay(
        service: &AiService,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        req: GradeEssayRequest,
    ) -> Result<(GradeEssayResponse, AiUsageSummary), CoreError> {
        service.grade_essay(tenant_id, user_id, endpoint, req).await
    }

    pub async fn generate_questions_stream<F>(
        service: &AiService,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        req: GenerateQuestionRequest,
        on_chunk: F,
    ) -> Result<(GenerateQuestionResponse, AiUsageSummary), CoreError>
    where
        F: FnMut(&str),
    {
        service
            .generate_questions_stream(tenant_id, user_id, endpoint, req, on_chunk)
            .await
    }
}
