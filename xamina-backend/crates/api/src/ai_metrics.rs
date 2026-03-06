use std::sync::atomic::{AtomicU64, Ordering};

static AI_REQUESTS_TOTAL: AtomicU64 = AtomicU64::new(0);
static AI_TOKENS_TOTAL: AtomicU64 = AtomicU64::new(0);
static AI_COST_USD_MICROS_TOTAL: AtomicU64 = AtomicU64::new(0);
static AI_RATE_LIMIT_HITS_TOTAL: AtomicU64 = AtomicU64::new(0);

pub fn record_ai_request() {
    AI_REQUESTS_TOTAL.fetch_add(1, Ordering::Relaxed);
}

pub fn record_ai_tokens(total_tokens: u32) {
    AI_TOKENS_TOTAL.fetch_add(u64::from(total_tokens), Ordering::Relaxed);
}

pub fn record_ai_cost_usd(usd: f64) {
    let micros = (usd.max(0.0) * 1_000_000.0).round() as u64;
    AI_COST_USD_MICROS_TOTAL.fetch_add(micros, Ordering::Relaxed);
}

pub fn record_ai_rate_limit_hit() {
    AI_RATE_LIMIT_HITS_TOTAL.fetch_add(1, Ordering::Relaxed);
}

pub fn render_prometheus() -> String {
    let requests = AI_REQUESTS_TOTAL.load(Ordering::Relaxed);
    let tokens = AI_TOKENS_TOTAL.load(Ordering::Relaxed);
    let cost_micros = AI_COST_USD_MICROS_TOTAL.load(Ordering::Relaxed);
    let cost_usd = (cost_micros as f64) / 1_000_000.0;
    let rate_limit_hits = AI_RATE_LIMIT_HITS_TOTAL.load(Ordering::Relaxed);

    format!(
        "\n# HELP xamina_ai_requests_total Total AI endpoint requests.\n# TYPE xamina_ai_requests_total counter\nxamina_ai_requests_total {requests}\n# HELP xamina_ai_tokens_total Total AI tokens consumed.\n# TYPE xamina_ai_tokens_total counter\nxamina_ai_tokens_total {tokens}\n# HELP xamina_ai_cost_usd_total Total estimated AI cost in USD.\n# TYPE xamina_ai_cost_usd_total counter\nxamina_ai_cost_usd_total {cost_usd:.6}\n# HELP xamina_ai_rate_limit_hits_total Total AI rate limit rejections.\n# TYPE xamina_ai_rate_limit_hits_total counter\nxamina_ai_rate_limit_hits_total {rate_limit_hits}\n"
    )
}
