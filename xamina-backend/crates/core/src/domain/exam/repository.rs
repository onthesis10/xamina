// Repository — hanya akses DB via SQLx
pub struct ExamRepository {
    pool: PgPool,
}

impl ExamRepository {
    pub async fn insert(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        dto: CreateExamDto,
    ) -> Result<Exam> {
        let exam = sqlx::query_as!(
            Exam,
            r#"
            INSERT INTO exams
              (tenant_id, created_by, title,
               duration_minutes, pass_score, status)
            VALUES ($1,$2,$3,$4,$5,'draft')
            RETURNING *
            "#,
            tenant_id, user_id,
            dto.title, dto.duration_minutes,
            dto.pass_score
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(exam)
    }

    pub async fn find_many(
        &self,
        tenant_id: Uuid,
        page: Pagination,
    ) -> Result<Vec<Exam>> {
        sqlx::query_as!(
            Exam,
            "SELECT * FROM exams
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3",
            tenant_id, page.limit, page.offset
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Into::into)
    }
}
