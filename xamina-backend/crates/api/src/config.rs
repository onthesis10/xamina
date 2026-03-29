#[derive(Debug, Clone)]
pub struct BillingConfig {
    pub provider: String,
    pub midtrans_server_key: Option<String>,
    pub midtrans_client_key: Option<String>,
    pub midtrans_base_url: String,
    pub midtrans_merchant_id: Option<String>,
    pub invoice_public_base_url: String,
    pub dunning_interval_secs: u64,
    pub dunning_max_attempts: i32,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub access_ttl_minutes: i64,
    pub refresh_ttl_days: i64,
    pub host: String,
    pub port: u16,
    pub global_rate_limit_per_min: u32,
    pub auth_rate_limit_per_min: u32,
    pub import_rate_limit_per_min: u32,
    pub import_max_bytes: usize,
    pub import_max_rows: usize,
    pub billing: BillingConfig,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://postgres:postgres@localhost:5432/xamina".to_string()
            }),
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:56379".to_string()),
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "dev-secret-change-me".to_string()),
            access_ttl_minutes: std::env::var("JWT_ACCESS_TTL_MINUTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(30),
            refresh_ttl_days: std::env::var("JWT_REFRESH_TTL_DAYS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(14),
            host: std::env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("API_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8080),
            global_rate_limit_per_min: read_u32_env("GLOBAL_RATE_LIMIT_PER_MIN", 120),
            auth_rate_limit_per_min: read_u32_env("AUTH_RATE_LIMIT_PER_MIN", 20),
            import_rate_limit_per_min: read_u32_env("IMPORT_RATE_LIMIT_PER_MIN", 8),
            import_max_bytes: read_usize_env("QUESTION_IMPORT_MAX_BYTES", 2 * 1024 * 1024),
            import_max_rows: read_usize_env("QUESTION_IMPORT_MAX_ROWS", 500),
            billing: BillingConfig {
                provider: std::env::var("BILLING_PROVIDER")
                    .unwrap_or_else(|_| "mock".to_string())
                    .trim()
                    .to_ascii_lowercase(),
                midtrans_server_key: read_optional_env("MIDTRANS_SERVER_KEY"),
                midtrans_client_key: read_optional_env("MIDTRANS_CLIENT_KEY"),
                midtrans_base_url: std::env::var("MIDTRANS_BASE_URL").unwrap_or_else(|_| {
                    "https://app.sandbox.midtrans.com/snap/v1/transactions".to_string()
                }),
                midtrans_merchant_id: read_optional_env("MIDTRANS_MERCHANT_ID"),
                invoice_public_base_url: std::env::var("INVOICE_PUBLIC_BASE_URL")
                    .unwrap_or_else(|_| "http://localhost:8080/uploads/invoices".to_string()),
                dunning_interval_secs: read_u64_env("BILLING_DUNNING_INTERVAL_SECS", 30),
                dunning_max_attempts: read_i32_env("BILLING_DUNNING_MAX_ATTEMPTS", 3),
            },
        }
    }
}

fn read_u32_env(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn read_usize_env(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn read_u64_env(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn read_i32_env(key: &str, default: i32) -> i32 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse::<i32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn read_optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
