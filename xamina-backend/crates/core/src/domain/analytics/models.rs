use super::dto::{ClassResultRow, PageMeta};

#[derive(Debug, Clone)]
pub struct ClassResultPage {
    pub rows: Vec<ClassResultRow>,
    pub meta: PageMeta,
}
