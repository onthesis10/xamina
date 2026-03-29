use std::{
    sync::{Arc, Once},
    time::Duration,
};

use api::{
    app::{create_router, AppState},
    config::BillingConfig,
    middleware::auth::Claims,
    middleware::rate_limit::GlobalRateLimitProfile,
    services::AppServices,
};
use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use chrono::{Duration as ChronoDuration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower::ServiceExt;
use uuid::Uuid;

#[allow(dead_code)]
pub struct TestCtx {
    pub app: Router,
    pub pool: PgPool,
    pub tenant_id: Uuid,
    pub super_admin_id: Uuid,
    pub admin_id: Uuid,
    pub guru_id: Uuid,
    pub siswa_id: Uuid,
    pub jwt_secret: String,
    pub services: AppServices,
}

impl TestCtx {
    pub async fn request_json(&self, request: Request<Body>) -> (StatusCode, Value) {
        let response = self
            .app
            .clone()
            .oneshot(request)
            .await
            .expect("request should succeed");
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("response bytes");
        let value = serde_json::from_slice::<Value>(&bytes).unwrap_or_else(|_| json!({}));
        (status, value)
    }

    pub fn bearer_for(&self, user_id: Uuid, role: &str) -> String {
        let claims = Claims {
            sub: user_id,
            tenant_id: self.tenant_id,
            role: role.to_string(),
            exp: (Utc::now() + ChronoDuration::hours(3)).timestamp() as usize,
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .expect("token encode");
        format!("Bearer {token}")
    }
}

pub async fn setup_test_ctx() -> anyhow::Result<Option<TestCtx>> {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        std::env::set_var("XAMINA_DISABLE_METRICS", "1");
    });

    let Some(db_url_raw) = std::env::var("TEST_DATABASE_URL").ok() else {
        return Ok(None);
    };
    let db_url = with_sslmode_disable(&db_url_raw);

    let pool = PgPoolOptions::new()
        .acquire_timeout(Duration::from_secs(10))
        .connect(&db_url)
        .await?;
    run_migrations(&pool).await?;
    reset_db(&pool).await?;

    let tenant_id = Uuid::new_v4();
    let super_admin_id = Uuid::new_v4();
    let admin_id = Uuid::new_v4();
    let guru_id = Uuid::new_v4();
    let siswa_id = Uuid::new_v4();

    sqlx::query("INSERT INTO tenants (id, name, slug, plan, is_active) VALUES ($1, 'Test School', 'test-school', 'starter', TRUE)")
        .bind(tenant_id)
        .execute(&pool)
        .await?;

    sqlx::query(
        "INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
         VALUES
         ($1, $5, 'sa@test.local', 'SuperAdmin123!', 'Super Admin', 'super_admin', TRUE),
         ($2, $5, 'admin@test.local', 'Admin123!', 'Admin', 'admin', TRUE),
         ($3, $5, 'guru@test.local', 'Guru123!', 'Guru', 'guru', TRUE),
         ($4, $5, 'siswa@test.local', 'Siswa123!', 'Siswa', 'siswa', TRUE)",
    )
    .bind(super_admin_id)
    .bind(admin_id)
    .bind(guru_id)
    .bind(siswa_id)
    .bind(tenant_id)
    .execute(&pool)
    .await?;

    let redis = redis::Client::open("redis://localhost:56379")?;
    let services = AppServices::new(
        &pool,
        redis.clone(),
        "http://localhost:8080/uploads/invoices".to_string(),
    );
    let jwt_secret = "test-secret".to_string();
    let state = Arc::new(AppState {
        services: services.clone(),
        pool: pool.clone(),
        redis,
        started_at: Utc::now(),
        jwt_secret: jwt_secret.clone(),
        access_ttl_minutes: 30,
        refresh_ttl_days: 14,
        ws: api::ws_state::WsState::new(),
        ai_rate_limits: api::middleware::ai_rate_limit::AiRateLimitProfile::from_env(),
        global_rate_limits: GlobalRateLimitProfile {
            default_per_min: 120,
            auth_per_min: 20,
            import_per_min: 8,
        },
        import_max_bytes: 2 * 1024 * 1024,
        import_max_rows: 500,
        billing: BillingConfig {
            provider: "mock".to_string(),
            midtrans_server_key: Some("test-midtrans-secret".to_string()),
            midtrans_client_key: Some("test-midtrans-client".to_string()),
            midtrans_base_url: "https://example.invalid".to_string(),
            midtrans_merchant_id: Some("merchant-test".to_string()),
            invoice_public_base_url: "http://localhost:8080/uploads/invoices".to_string(),
            dunning_interval_secs: 30,
            dunning_max_attempts: 3,
        },
    });

    Ok(Some(TestCtx {
        app: create_router(state),
        pool,
        tenant_id,
        super_admin_id,
        admin_id,
        guru_id,
        siswa_id,
        jwt_secret,
        services,
    }))
}

async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::raw_sql(include_str!("../../../db/migrations/0001_extensions.sql"))
        .execute(pool)
        .await?;
    sqlx::raw_sql(include_str!("../../../db/migrations/0002_core_auth.sql"))
        .execute(pool)
        .await?;
    sqlx::raw_sql(include_str!("../../../db/migrations/0003_questions.sql"))
        .execute(pool)
        .await?;
    sqlx::raw_sql(include_str!("../../../db/migrations/0004_exams.sql"))
        .execute(pool)
        .await?;
    sqlx::raw_sql(include_str!("../../../db/migrations/0005_submissions.sql"))
        .execute(pool)
        .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0006_publish_conflict_indexes.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0007_notifications.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0008_dashboard_indexes.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0009_sprint7_multitenant_rls.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0010_ai_usage_logs.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0011_sprint10_certificates_delivery.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0012_sprint10_push_receipts.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0013_sprint11_analytics_indexes.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/20260225105400_schema_app_and_superadmin_seed.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0014_sprint13_billing.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0015_sprint14_platform_ops.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0016_sprint15_privacy_requests.sql"
    ))
    .execute(pool)
    .await?;
    sqlx::raw_sql(include_str!(
        "../../../db/migrations/0017_sprint15_auth_security.sql"
    ))
    .execute(pool)
    .await?;
    Ok(())
}

async fn reset_db(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "TRUNCATE TABLE auth_login_events, auth_login_challenges, user_security_settings, account_deletion_requests, platform_audit_logs, platform_ai_settings, billing_webhook_events, billing_invoices, billing_subscriptions, push_delivery_receipts, push_jobs, email_jobs, push_subscriptions, certificates, ai_usage_logs, notifications, submission_anomalies, submission_answers, submissions, exam_questions, exams, questions, refresh_tokens, users, classes, tenants RESTART IDENTITY CASCADE",
    )
    .execute(pool)
    .await?;
    Ok(())
}

fn with_sslmode_disable(db_url: &str) -> String {
    if db_url.contains("sslmode=") {
        return db_url.to_string();
    }
    if db_url.contains('?') {
        format!("{db_url}&sslmode=disable")
    } else {
        format!("{db_url}?sslmode=disable")
    }
}
