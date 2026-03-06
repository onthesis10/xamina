use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AiUsageLogCreate {
    pub tenant_id: Uuid,
    pub user_id: Option<Uuid>,
    pub endpoint: String,
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub estimated_cost_usd: f64,
    pub status: String,
    pub error_code: Option<String>,
    pub latency_ms: i32,
    pub metadata: Value,
}

#[derive(Debug, Clone, Default)]
pub struct AiUsageSummary {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub estimated_cost_usd: f64,
    pub latency_ms: i32,
}
