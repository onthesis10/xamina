use std::{
    fs::{self, File},
    io::BufWriter,
    path::PathBuf,
};

use chrono::{Datelike, Utc};
use printpdf::{BuiltinFont, Mm, PdfDocument};
use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{CertificateDto, CertificateListMeta, ListCertificatesQuery},
    models::CertificateListResult,
    repository::{CertificateInsertInput, CertificateRepository, IssueCertificateContextRow},
};

#[derive(Debug, Clone)]
pub struct CertificateIssueResult {
    pub certificate: CertificateDto,
    pub created: bool,
    pub student_email: String,
    pub student_name: String,
    pub exam_title: String,
}

#[derive(Debug, Clone)]
pub struct CertificateService {
    repo: CertificateRepository,
    base_public_url: String,
}

impl CertificateService {
    pub fn new(repo: CertificateRepository) -> Self {
        let base_public_url = std::env::var("CERTIFICATE_PUBLIC_BASE_URL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "http://localhost:8080/uploads/certificates".to_string());
        Self {
            repo,
            base_public_url,
        }
    }

    pub async fn list_my_certificates(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        query: ListCertificatesQuery,
    ) -> Result<CertificateListResult, CoreError> {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * page_size;
        let total = self
            .repo
            .count_student_certificates(tenant_id, student_id)
            .await?;
        let rows = self
            .repo
            .list_student_certificates(tenant_id, student_id, page_size, offset)
            .await?;
        Ok(CertificateListResult {
            rows,
            meta: CertificateListMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn get_my_certificate_by_submission(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        submission_id: Uuid,
    ) -> Result<Option<CertificateDto>, CoreError> {
        self.repo
            .find_for_student_by_submission(tenant_id, student_id, submission_id)
            .await
    }

    pub async fn get_my_certificate_by_id(
        &self,
        tenant_id: Uuid,
        student_id: Uuid,
        certificate_id: Uuid,
    ) -> Result<Option<CertificateDto>, CoreError> {
        self.repo
            .find_for_student_by_id(tenant_id, student_id, certificate_id)
            .await
    }

    pub async fn issue_for_submission(
        &self,
        tenant_id: Uuid,
        submission_id: Uuid,
    ) -> Result<Option<CertificateIssueResult>, CoreError> {
        let Some(ctx) = self
            .repo
            .get_issue_context(tenant_id, submission_id)
            .await?
        else {
            return Ok(None);
        };

        if !self.is_eligible(&ctx) {
            return Ok(None);
        }

        if let Some(existing) = self
            .repo
            .find_by_submission(tenant_id, submission_id)
            .await?
        {
            return Ok(Some(CertificateIssueResult {
                certificate: existing,
                created: false,
                student_email: ctx.student_email,
                student_name: ctx.student_name,
                exam_title: ctx.exam_title,
            }));
        }

        let certificate_id = Uuid::new_v4();
        let cert_no = self.generate_certificate_no(certificate_id);
        let relative_path = format!(
            "uploads/certificates/{}/{}.pdf",
            ctx.tenant_id, certificate_id
        );
        self.render_pdf(&ctx, &cert_no, &relative_path)?;

        let file_url = format!(
            "{}/{}/{}.pdf",
            self.base_public_url.trim_end_matches('/'),
            ctx.tenant_id,
            certificate_id
        );

        let (certificate, created) = self
            .repo
            .insert_or_get_certificate(CertificateInsertInput {
                tenant_id: ctx.tenant_id,
                submission_id: ctx.submission_id,
                exam_id: ctx.exam_id,
                student_id: ctx.student_id,
                certificate_no: cert_no,
                score: ctx.score,
                file_path: relative_path,
                file_url,
            })
            .await?;

        Ok(Some(CertificateIssueResult {
            certificate,
            created,
            student_email: ctx.student_email,
            student_name: ctx.student_name,
            exam_title: ctx.exam_title,
        }))
    }

    fn is_eligible(&self, ctx: &IssueCertificateContextRow) -> bool {
        if ctx.finished_at.is_none() {
            return false;
        }
        if ctx.submission_status != "finished" && ctx.submission_status != "auto_finished" {
            return false;
        }
        ctx.score >= ctx.pass_score as f64
    }

    fn generate_certificate_no(&self, certificate_id: Uuid) -> String {
        let now = Utc::now();
        format!(
            "CERT-{:04}{:02}{:02}-{}",
            now.year(),
            now.month(),
            now.day(),
            &certificate_id.to_string()[..8]
        )
    }

    fn render_pdf(
        &self,
        ctx: &IssueCertificateContextRow,
        certificate_no: &str,
        relative_path: &str,
    ) -> Result<(), CoreError> {
        let (doc, page, layer) =
            PdfDocument::new("Xamina Certificate", Mm(210.0), Mm(297.0), "Layer 1");
        let current_layer = doc.get_page(page).get_layer(layer);
        let font = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|_| {
                CoreError::internal("CERTIFICATE_RENDER_FAILED", "Failed to load PDF font")
            })?;
        let font_regular = doc.add_builtin_font(BuiltinFont::Helvetica).map_err(|_| {
            CoreError::internal("CERTIFICATE_RENDER_FAILED", "Failed to load PDF font")
        })?;

        current_layer.use_text("Sertifikat Kelulusan", 36.0, Mm(30.0), Mm(240.0), &font);
        current_layer.use_text(
            format!("Diberikan kepada: {}", ctx.student_name),
            18.0,
            Mm(30.0),
            Mm(210.0),
            &font_regular,
        );
        current_layer.use_text(
            format!("Atas kelulusan ujian: {}", ctx.exam_title),
            16.0,
            Mm(30.0),
            Mm(190.0),
            &font_regular,
        );
        current_layer.use_text(
            format!("Skor akhir: {:.2}", ctx.score),
            16.0,
            Mm(30.0),
            Mm(175.0),
            &font_regular,
        );
        current_layer.use_text(
            format!("Nomor sertifikat: {certificate_no}"),
            12.0,
            Mm(30.0),
            Mm(155.0),
            &font_regular,
        );
        current_layer.use_text(
            format!("Sekolah: {}", ctx.tenant_name),
            12.0,
            Mm(30.0),
            Mm(145.0),
            &font_regular,
        );
        current_layer.use_text(
            format!(
                "Tanggal terbit: {}",
                Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
            ),
            12.0,
            Mm(30.0),
            Mm(135.0),
            &font_regular,
        );

        let target_path = PathBuf::from(relative_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|_| {
                CoreError::internal(
                    "CERTIFICATE_RENDER_FAILED",
                    "Failed to create certificate folder",
                )
            })?;
        }
        let file = File::create(&target_path).map_err(|_| {
            CoreError::internal(
                "CERTIFICATE_RENDER_FAILED",
                "Failed to create certificate file",
            )
        })?;
        let mut writer = BufWriter::new(file);
        doc.save(&mut writer).map_err(|_| {
            CoreError::internal(
                "CERTIFICATE_RENDER_FAILED",
                "Failed to save certificate PDF",
            )
        })
    }
}
