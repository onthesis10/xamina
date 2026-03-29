use async_trait::async_trait;
use serde_json::json;

use crate::{app::ApiError, config::BillingConfig};

#[derive(Debug, Clone)]
pub struct GatewayCheckoutRequest {
    pub order_id: String,
    pub amount: i64,
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct GatewayCheckoutResponse {
    pub mode: String,
    pub checkout_url: String,
}

#[async_trait]
pub trait BillingGateway: Send + Sync {
    async fn create_checkout(
        &self,
        request: GatewayCheckoutRequest,
    ) -> Result<GatewayCheckoutResponse, ApiError>;
}

pub fn build_billing_gateway(config: &BillingConfig) -> Box<dyn BillingGateway> {
    if config.provider == "midtrans" && config.midtrans_server_key.is_some() {
        return Box::new(MidtransGateway::new(config.clone()));
    }
    Box::new(MockGateway)
}

struct MockGateway;

#[async_trait]
impl BillingGateway for MockGateway {
    async fn create_checkout(
        &self,
        request: GatewayCheckoutRequest,
    ) -> Result<GatewayCheckoutResponse, ApiError> {
        Ok(GatewayCheckoutResponse {
            mode: "mock".to_string(),
            checkout_url: format!(
                "https://mock-billing.local/checkout/{}?amount={}",
                request.order_id, request.amount
            ),
        })
    }
}

struct MidtransGateway {
    config: BillingConfig,
    client: reqwest::Client,
}

impl MidtransGateway {
    fn new(config: BillingConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl BillingGateway for MidtransGateway {
    async fn create_checkout(
        &self,
        request: GatewayCheckoutRequest,
    ) -> Result<GatewayCheckoutResponse, ApiError> {
        let server_key = self.config.midtrans_server_key.as_ref().ok_or_else(|| {
            ApiError::new(
                axum::http::StatusCode::BAD_REQUEST,
                "BILLING_PROVIDER_NOT_READY",
                "MIDTRANS_SERVER_KEY is missing",
            )
        })?;
        let response = self
            .client
            .post(&self.config.midtrans_base_url)
            .basic_auth(server_key, Some(""))
            .json(&json!({
                "transaction_details": {
                    "order_id": request.order_id,
                    "gross_amount": request.amount,
                },
                "item_details": [{
                    "id": request.order_id,
                    "price": request.amount,
                    "quantity": 1,
                    "name": request.description,
                }],
                "custom_field1": self.config.midtrans_merchant_id.clone().unwrap_or_default(),
            }))
            .send()
            .await
            .map_err(|_| {
                ApiError::new(
                    axum::http::StatusCode::BAD_GATEWAY,
                    "BILLING_GATEWAY_ERROR",
                    "Failed to call Midtrans gateway",
                )
            })?;
        let status = response.status();
        let body = response.json::<serde_json::Value>().await.map_err(|_| {
            ApiError::new(
                axum::http::StatusCode::BAD_GATEWAY,
                "BILLING_GATEWAY_ERROR",
                "Failed to parse Midtrans response",
            )
        })?;
        if !status.is_success() {
            let message = extract_gateway_error_message(&body);
            return Err(ApiError::new(
                axum::http::StatusCode::BAD_GATEWAY,
                "BILLING_GATEWAY_ERROR",
                format!("Midtrans gateway rejected request ({status}): {message}"),
            )
            .with_details(json!({
                "gateway_status": status.as_u16(),
                "gateway_message": message,
                "gateway_body": body
            })));
        }
        let checkout_url = body
            .get("redirect_url")
            .and_then(|value| value.as_str())
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                ApiError::new(
                    axum::http::StatusCode::BAD_GATEWAY,
                    "BILLING_GATEWAY_ERROR",
                    "Midtrans response missing redirect_url",
                )
            })?;
        Ok(GatewayCheckoutResponse {
            mode: "midtrans".to_string(),
            checkout_url: checkout_url.to_string(),
        })
    }
}

fn extract_gateway_error_message(body: &serde_json::Value) -> String {
    if let Some(error_messages) = body
        .get("error_messages")
        .and_then(|value| value.as_array())
    {
        let joined = error_messages
            .iter()
            .filter_map(|value| value.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        if !joined.is_empty() {
            return joined;
        }
    }

    if let Some(message) = body
        .get("status_message")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
    {
        return message.to_string();
    }

    if let Some(message) = body
        .get("message")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
    {
        return message.to_string();
    }

    "Unknown Midtrans error".to_string()
}
