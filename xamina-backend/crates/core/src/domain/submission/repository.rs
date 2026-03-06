use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct SubmissionRepository {
    pub pool: PgPool,
}

impl SubmissionRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}
