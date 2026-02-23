// Service — business logic murni
#[derive(Clone)]
pub struct ExamService {
    repo: Arc<ExamRepository>,
    redis: Arc<RedisPool>,
    ai: Arc<AiService>,
}

impl ExamService {
    pub async fn create_exam(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        dto: CreateExamDto,
    ) -> Result<Exam> {
        // Validasi business rule
        self.repo
            .check_quota(tenant_id)
            .await?;

        let exam = self.repo
            .insert(tenant_id, user_id, dto)
            .await?;

        // Invalidate cache list
        self.redis
            .del(format!("exams:{tenant_id}"))
            .await?;

        Ok(exam)
    }

    pub async fn publish_exam(
        &self, exam_id: Uuid,
    ) -> Result<()> {
        self.repo
            .set_status(exam_id, ExamStatus::Published)
            .await?;
        Ok(())
    }
}
