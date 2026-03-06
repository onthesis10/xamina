use super::dto::{CertificateDto, CertificateListMeta};

#[derive(Debug, Clone)]
pub struct CertificateListResult {
    pub rows: Vec<CertificateDto>,
    pub meta: CertificateListMeta,
}
