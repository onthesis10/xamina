use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::error::CoreError;

use super::dto::CertificateDto;

#[derive(Debug, Clone)]
pub struct CertificateRepository {
    pool: PgPool,
}

#[derive(Debug, Clone)]
pub struct CertificateInsertInput {
    pub tenant_id: Uuid,
    pub submission_id: Uuid,
    pub exam_id: Uuid,
    pub student_id: Uuid,
    pub certificate_no: String,
    pub score: f64,
    pub file_path: String,
    pub file_url: String,
}

#[derive(Debug, Clone)]
pub struct IssueCertificateContextRow {
    pub tenant_id: Uuid,
    pub submission_id: Uuid,
    pub exam_id: Uuid,
    pub student_id: Uuid,
    pub score: f64,
    pub pass_score: i32,
    pub exam_title: String,
    pub student_name: String,
    pub student_email: String,
    pub tenant_name: String,
    pub finished_at: Option<DateTime<Utc>>,
    pub submission_status: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct CertificateDownloadRow {
    pub certificate_no: String,
    pub file_path: String,
}

impl CertificateRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count_student_certificates(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
    ) -> Result<i64, CoreError> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*)
             FROM certificates
             WHERE tenant_id = $1
               AND student_id = $2",
        )
        .bind(tenant_id)
        .bind(student_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to count certificates"))
    }

    pub async fn list_student_certificates(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        page_size: i64,
        offset: i64,
    ) -> Result<Vec<CertificateDto>, CoreError> {
        sqlx::query_as::<_, CertificateDto>(
            "SELECT
                id, tenant_id, submission_id, exam_id, student_id, certificate_no,
                score::float8 AS score, issued_at, file_url
             FROM certificates
             WHERE tenant_id = $1
               AND student_id = $2
             ORDER BY issued_at DESC
             LIMIT $3 OFFSET $4",
        )
        .bind(tenant_id)
        .bind(student_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to list certificates"))
    }

    pub async fn find_by_submission(
        &self,
        tenant_id: Uuid,
        submission_id: Uuid,
    ) -> Result<Option<CertificateDto>, CoreError> {
        sqlx::query_as::<_, CertificateDto>(
            "SELECT
                id, tenant_id, submission_id, exam_id, student_id, certificate_no,
                score::float8 AS score, issued_at, file_url
             FROM certificates
             WHERE tenant_id = $1
               AND submission_id = $2",
        )
        .bind(tenant_id)
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load certificate"))
    }

    pub async fn find_for_student_by_submission(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        submission_id: Uuid,
    ) -> Result<Option<CertificateDto>, CoreError> {
        sqlx::query_as::<_, CertificateDto>(
            "SELECT
                id, tenant_id, submission_id, exam_id, student_id, certificate_no,
                score::float8 AS score, issued_at, file_url
             FROM certificates
             WHERE tenant_id = $1
               AND student_id = $2
               AND submission_id = $3",
        )
        .bind(tenant_id)
        .bind(student_id)
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load certificate"))
    }

    pub async fn find_for_student_by_id(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        certificate_id: Uuid,
    ) -> Result<Option<CertificateDto>, CoreError> {
        sqlx::query_as::<_, CertificateDto>(
            "SELECT
                id, tenant_id, submission_id, exam_id, student_id, certificate_no,
                score::float8 AS score, issued_at, file_url
             FROM certificates
             WHERE tenant_id = $1
               AND student_id = $2
               AND id = $3",
        )
        .bind(tenant_id)
        .bind(student_id)
        .bind(certificate_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load certificate"))
    }

    pub async fn find_download_for_student_by_id(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        certificate_id: Uuid,
    ) -> Result<Option<CertificateDownloadRow>, CoreError> {
        sqlx::query_as::<_, CertificateDownloadRow>(
            "SELECT certificate_no, file_path
             FROM certificates
             WHERE tenant_id = $1
               AND student_id = $2
               AND id = $3",
        )
        .bind(tenant_id)
        .bind(student_id)
        .bind(certificate_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load certificate download"))
    }

    pub async fn get_issue_context(
        &self,
        tenant_id: Uuid,
        submission_id: Uuid,
    ) -> Result<Option<IssueCertificateContextRow>, CoreError> {
        sqlx::query_as::<
            _,
            (
                Uuid,
                Uuid,
                Uuid,
                Uuid,
                Option<f64>,
                i32,
                String,
                String,
                String,
                String,
                Option<DateTime<Utc>>,
                String,
            ),
        >(
            "SELECT
                s.tenant_id,
                s.id AS submission_id,
                s.exam_id,
                s.student_id,
                s.score::float8,
                e.pass_score,
                e.title AS exam_title,
                u.name AS student_name,
                u.email AS student_email,
                t.name AS tenant_name,
                s.finished_at,
                s.status
             FROM submissions s
             JOIN exams e ON e.id = s.exam_id
             JOIN users u ON u.id = s.student_id
             JOIN tenants t ON t.id = s.tenant_id
             WHERE s.tenant_id = $1
               AND s.id = $2",
        )
        .bind(tenant_id)
        .bind(submission_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to load certificate context"))?
        .map(|row| IssueCertificateContextRow {
            tenant_id: row.0,
            submission_id: row.1,
            exam_id: row.2,
            student_id: row.3,
            score: row.4.unwrap_or(0.0),
            pass_score: row.5,
            exam_title: row.6,
            student_name: row.7,
            student_email: row.8,
            tenant_name: row.9,
            finished_at: row.10,
            submission_status: row.11,
        })
        .map(Ok)
        .transpose()
    }

    pub async fn insert_or_get_certificate(
        &self,
        input: CertificateInsertInput,
    ) -> Result<(CertificateDto, bool), CoreError> {
        let maybe_inserted = sqlx::query_as::<_, CertificateDto>(
            "INSERT INTO certificates
                (tenant_id, submission_id, exam_id, student_id, certificate_no, score, file_path, file_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (submission_id) DO NOTHING
             RETURNING
                id, tenant_id, submission_id, exam_id, student_id, certificate_no,
                score::float8 AS score, issued_at, file_url",
        )
        .bind(input.tenant_id)
        .bind(input.submission_id)
        .bind(input.exam_id)
        .bind(input.student_id)
        .bind(input.certificate_no)
        .bind(input.score)
        .bind(input.file_path)
        .bind(input.file_url)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| CoreError::internal("DB_ERROR", "Failed to insert certificate"))?;

        if let Some(inserted) = maybe_inserted {
            return Ok((inserted, true));
        }

        let existing = self
            .find_by_submission(input.tenant_id, input.submission_id)
            .await?
            .ok_or_else(|| CoreError::internal("DB_ERROR", "Certificate lookup failed"))?;
        Ok((existing, false))
    }
}
