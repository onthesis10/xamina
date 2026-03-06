use super::dto::{ExamDto, PageMeta};

#[derive(Debug, Clone)]
pub struct ListExamsResult {
    pub rows: Vec<ExamDto>,
    pub meta: PageMeta,
}
