#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub access_ttl_minutes: i64,
    pub refresh_ttl_days: i64,
    pub host: String,
    pub port: u16,
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
        }
    }
}
