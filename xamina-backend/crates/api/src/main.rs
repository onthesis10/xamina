use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use api::billing_worker::spawn_billing_workers;
use api::services::AppServices;
use api::ws_bus::{spawn_heartbeat_sweeper, spawn_redis_subscriber};
use api::ws_state::WsState;
use api::{
    app::{create_router, AppState},
    config::Config,
    delivery_worker::{spawn_delivery_workers, validate_delivery_config},
    middleware::ai_rate_limit::AiRateLimitProfile,
    middleware::rate_limit::GlobalRateLimitProfile,
};
use sqlx::PgPool;
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .compact()
        .init();

    let config = Config::from_env();
    let pool = PgPool::connect(&config.database_url)
        .await
        .with_context(|| {
            format!(
                "failed to connect database (DATABASE_URL={}). Make sure PostgreSQL is running and reachable.",
                config.database_url
            )
        })?;
    let redis = redis::Client::open(config.redis_url.clone()).with_context(|| {
        format!(
            "failed to initialize redis client (REDIS_URL={})",
            config.redis_url
        )
    })?;
    let services = AppServices::new(
        &pool,
        redis.clone(),
        config.billing.invoice_public_base_url.clone(),
    );
    let ws = WsState::new();
    let global_rate_limits = GlobalRateLimitProfile::from_config(&config);

    let state = Arc::new(AppState {
        services,
        pool,
        redis,
        started_at: chrono::Utc::now(),
        jwt_secret: config.jwt_secret,
        access_ttl_minutes: config.access_ttl_minutes,
        refresh_ttl_days: config.refresh_ttl_days,
        ws,
        ai_rate_limits: AiRateLimitProfile::from_env(),
        global_rate_limits,
        import_max_bytes: config.import_max_bytes,
        import_max_rows: config.import_max_rows,
        billing: config.billing.clone(),
    });

    spawn_redis_subscriber(state.redis.clone(), state.ws.clone());
    spawn_heartbeat_sweeper(state.redis.clone(), state.ws.clone(), 45, 15);
    validate_delivery_config();
    spawn_delivery_workers(state.services.clone());
    spawn_billing_workers(
        state.services.clone(),
        config.billing.dunning_interval_secs,
        config.billing.dunning_max_attempts,
    );

    let app = create_router(state);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .context("invalid bind address")?;

    info!("api listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
