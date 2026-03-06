use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum CoreErrorKind {
    BadRequest,
    Unauthorized,
    Forbidden,
    NotFound,
    Internal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreError {
    pub kind: CoreErrorKind,
    pub code: &'static str,
    pub message: String,
    pub details: Value,
}

impl CoreError {
    pub fn new(kind: CoreErrorKind, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind,
            code,
            message: message.into(),
            details: Value::Null,
        }
    }

    pub fn with_details(mut self, details: Value) -> Self {
        self.details = details;
        self
    }

    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(CoreErrorKind::BadRequest, code, message)
    }

    pub fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(CoreErrorKind::Unauthorized, code, message)
    }

    pub fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(CoreErrorKind::Forbidden, code, message)
    }

    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(CoreErrorKind::NotFound, code, message)
    }

    pub fn internal(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(CoreErrorKind::Internal, code, message)
    }
}
