use std::time::Duration;

use tokio::time::sleep;
use tracing::error;

use crate::services::AppServices;

pub fn spawn_billing_workers(services: AppServices, interval_secs: u64, max_attempts: i32) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = services.billing.process_dunning_cycle(max_attempts).await {
                error!(code = err.code, message = %err.message, "failed to run billing dunning cycle");
            }
            sleep(Duration::from_secs(interval_secs)).await;
        }
    });
}
