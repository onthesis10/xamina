use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256, Sha512};
use uuid::Uuid;
use xamina_core::domain::billing::dto::{
    BillingCheckoutSessionDto, BillingHistoryMeta, BillingHistoryQuery, BillingInvoiceDto,
    BillingPlanDto, BillingSummaryDto, BillingWebhookProcessDto, ChangePlanInput,
    CreateCheckoutInput,
};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    billing_gateway::{build_billing_gateway, GatewayCheckoutRequest},
    middleware::auth::AuthUser,
    platform_audit::record_platform_audit,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/billing/plans", get(plans))
        .route("/billing/summary", get(tenant_summary))
        .route("/billing/history", get(tenant_history))
        .route("/billing/checkout", post(tenant_checkout))
        .route("/billing/change-plan", post(tenant_change_plan))
        .route(
            "/billing/invoices/:invoice_id/pdf",
            get(tenant_download_invoice_pdf),
        )
        .route("/platform/tenants/:tenant_id/billing/summary", get(summary))
        .route("/platform/tenants/:tenant_id/billing/history", get(history))
        .route(
            "/platform/tenants/:tenant_id/billing/checkout",
            post(checkout),
        )
        .route(
            "/platform/tenants/:tenant_id/billing/change-plan",
            post(change_plan),
        )
        .route(
            "/platform/tenants/:tenant_id/billing/invoices/:invoice_id/pdf",
            get(download_invoice_pdf),
        )
        .route("/billing/midtrans/webhook", post(midtrans_webhook))
}

#[derive(Debug, Deserialize, Serialize)]
struct MidtransWebhookPayload {
    order_id: String,
    status_code: String,
    gross_amount: String,
    transaction_status: String,
    fraud_status: Option<String>,
    signature_key: String,
}

fn ensure_super_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "super_admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "super_admin role required",
        ));
    }
    Ok(())
}

fn ensure_admin(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "admin" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "admin role required",
        ));
    }
    Ok(())
}

async fn billing_summary_response(
    state: &SharedState,
    tenant_id: Uuid,
) -> Result<SuccessResponse<BillingSummaryDto>, ApiError> {
    let data = state.services.billing.summary(tenant_id).await?;
    Ok(SuccessResponse {
        success: true,
        data,
    })
}

async fn billing_history_response(
    state: &SharedState,
    tenant_id: Uuid,
    query: BillingHistoryQuery,
) -> Result<SuccessWithMeta<Vec<BillingInvoiceDto>, BillingHistoryMeta>, ApiError> {
    let page = state.services.billing.history(tenant_id, query).await?;
    Ok(SuccessWithMeta {
        success: true,
        data: page.rows,
        meta: page.meta,
    })
}

async fn billing_checkout_response(
    state: &SharedState,
    tenant_id: Uuid,
    body: CreateCheckoutInput,
) -> Result<SuccessResponse<BillingCheckoutSessionDto>, ApiError> {
    let gateway = build_billing_gateway(&state.billing);
    let draft = state
        .services
        .billing
        .create_checkout_draft(tenant_id, &body.plan_code, &state.billing.provider)
        .await?;
    let gateway_response = gateway
        .create_checkout(GatewayCheckoutRequest {
            order_id: draft.invoice.provider_ref.clone(),
            amount: draft.invoice.amount,
            description: format!("Xamina {} Plan", draft.invoice.plan_code),
        })
        .await?;
    let invoice = state
        .services
        .billing
        .attach_checkout_url(tenant_id, draft.invoice.id, &gateway_response.checkout_url)
        .await?;
    Ok(SuccessResponse {
        success: true,
        data: state.services.billing.checkout_session(
            &gateway_response.mode,
            gateway_response.checkout_url,
            invoice,
            draft.current_subscription,
        ),
    })
}

async fn billing_change_plan_response(
    state: &SharedState,
    tenant_id: Uuid,
    body: ChangePlanInput,
) -> Result<SuccessResponse<BillingCheckoutSessionDto>, ApiError> {
    let gateway = build_billing_gateway(&state.billing);
    let current = state.services.billing.get_subscription(tenant_id).await?;
    let draft = state
        .services
        .billing
        .create_checkout_draft(tenant_id, &body.plan_code, &state.billing.provider)
        .await?;
    let gateway_response = gateway
        .create_checkout(GatewayCheckoutRequest {
            order_id: draft.invoice.provider_ref.clone(),
            amount: draft.invoice.amount,
            description: format!("Xamina {} Plan Change", draft.invoice.plan_code),
        })
        .await?;
    let invoice = state
        .services
        .billing
        .attach_checkout_url(tenant_id, draft.invoice.id, &gateway_response.checkout_url)
        .await?;
    Ok(SuccessResponse {
        success: true,
        data: state.services.billing.checkout_session(
            &gateway_response.mode,
            gateway_response.checkout_url,
            invoice,
            current,
        ),
    })
}

async fn billing_download_invoice_response(
    state: &SharedState,
    tenant_id: Uuid,
    invoice_id: Uuid,
) -> Result<impl IntoResponse, ApiError> {
    let bytes = state
        .services
        .billing
        .download_invoice_pdf(tenant_id, invoice_id)
        .await?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (header::CONTENT_ENCODING, "identity"),
            (
                header::CACHE_CONTROL,
                "no-store, no-cache, must-revalidate, max-age=0",
            ),
            (header::PRAGMA, "no-cache"),
            (header::EXPIRES, "0"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"xamina-invoice.pdf\"",
            ),
        ],
        bytes,
    ))
}

async fn plans(
    State(state): State<SharedState>,
) -> ApiResult<SuccessResponse<Vec<BillingPlanDto>>> {
    Ok(Json(SuccessResponse {
        success: true,
        data: state.services.billing.available_plans(),
    }))
}

async fn tenant_summary(
    State(state): State<SharedState>,
    auth: AuthUser,
) -> ApiResult<SuccessResponse<BillingSummaryDto>> {
    ensure_admin(&auth)?;
    Ok(Json(
        billing_summary_response(&state, auth.0.tenant_id).await?,
    ))
}

async fn tenant_history(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<BillingHistoryQuery>,
) -> ApiResult<SuccessWithMeta<Vec<BillingInvoiceDto>, BillingHistoryMeta>> {
    ensure_admin(&auth)?;
    Ok(Json(
        billing_history_response(&state, auth.0.tenant_id, query).await?,
    ))
}

async fn tenant_checkout(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<CreateCheckoutInput>,
) -> ApiResult<SuccessResponse<BillingCheckoutSessionDto>> {
    ensure_admin(&auth)?;
    Ok(Json(
        billing_checkout_response(&state, auth.0.tenant_id, body).await?,
    ))
}

async fn tenant_change_plan(
    State(state): State<SharedState>,
    auth: AuthUser,
    Json(body): Json<ChangePlanInput>,
) -> ApiResult<SuccessResponse<BillingCheckoutSessionDto>> {
    ensure_admin(&auth)?;
    Ok(Json(
        billing_change_plan_response(&state, auth.0.tenant_id, body).await?,
    ))
}

async fn tenant_download_invoice_pdf(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(invoice_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    ensure_admin(&auth)?;
    billing_download_invoice_response(&state, auth.0.tenant_id, invoice_id).await
}

async fn summary(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(tenant_id): Path<Uuid>,
) -> ApiResult<SuccessResponse<BillingSummaryDto>> {
    ensure_super_admin(&auth)?;
    Ok(Json(billing_summary_response(&state, tenant_id).await?))
}

async fn history(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(tenant_id): Path<Uuid>,
    Query(query): Query<BillingHistoryQuery>,
) -> ApiResult<
    SuccessWithMeta<Vec<BillingInvoiceDto>, xamina_core::domain::billing::dto::BillingHistoryMeta>,
> {
    ensure_super_admin(&auth)?;
    Ok(Json(
        billing_history_response(&state, tenant_id, query).await?,
    ))
}

async fn checkout(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(tenant_id): Path<Uuid>,
    Json(body): Json<CreateCheckoutInput>,
) -> ApiResult<SuccessResponse<BillingCheckoutSessionDto>> {
    ensure_super_admin(&auth)?;
    let payload = billing_checkout_response(&state, tenant_id, body).await?;
    record_platform_audit(
        &state.pool,
        &auth,
        "platform.billing.checkout.created",
        "billing_invoice",
        Some(payload.data.invoice.id),
        Some(tenant_id),
        json!({
            "plan_code": payload.data.invoice.plan_code.clone(),
            "provider_ref": payload.data.invoice.provider_ref.clone(),
            "amount": payload.data.invoice.amount,
            "gateway_mode": payload.data.gateway_mode.clone()
        }),
    )
    .await?;
    Ok(Json(payload))
}

async fn change_plan(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(tenant_id): Path<Uuid>,
    Json(body): Json<ChangePlanInput>,
) -> ApiResult<SuccessResponse<BillingCheckoutSessionDto>> {
    ensure_super_admin(&auth)?;
    let payload = billing_change_plan_response(&state, tenant_id, body).await?;
    record_platform_audit(
        &state.pool,
        &auth,
        "platform.billing.plan_change.created",
        "billing_invoice",
        Some(payload.data.invoice.id),
        Some(tenant_id),
        json!({
            "plan_code": payload.data.invoice.plan_code.clone(),
            "provider_ref": payload.data.invoice.provider_ref.clone(),
            "amount": payload.data.invoice.amount,
            "gateway_mode": payload.data.gateway_mode.clone()
        }),
    )
    .await?;
    Ok(Json(payload))
}

async fn download_invoice_pdf(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path((tenant_id, invoice_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, ApiError> {
    ensure_super_admin(&auth)?;
    billing_download_invoice_response(&state, tenant_id, invoice_id).await
}

async fn midtrans_webhook(
    State(state): State<SharedState>,
    Json(body): Json<MidtransWebhookPayload>,
) -> ApiResult<SuccessResponse<BillingWebhookProcessDto>> {
    verify_midtrans_signature(&body, state.billing.midtrans_server_key.as_deref())?;
    let next_status = match body.transaction_status.as_str() {
        "capture" | "settlement"
            if body.fraud_status.as_deref().unwrap_or("accept") == "accept" =>
        {
            "paid"
        }
        "pending" => "pending",
        "deny" | "cancel" | "expire" => "failed",
        _ => "pending",
    };
    let event_key = format!("{}:{}", body.order_id, body.transaction_status);
    let data = state
        .services
        .billing
        .apply_webhook(
            "midtrans",
            &event_key,
            &body.order_id,
            next_status,
            serde_json::to_value(&body).unwrap_or_default(),
        )
        .await?;
    Ok(Json(SuccessResponse {
        success: true,
        data,
    }))
}

fn verify_midtrans_signature(
    body: &MidtransWebhookPayload,
    server_key: Option<&str>,
) -> Result<(), ApiError> {
    let server_key = server_key.ok_or_else(|| {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "BILLING_PROVIDER_NOT_READY",
            "MIDTRANS_SERVER_KEY is missing",
        )
    })?;
    let digest = Sha512::digest(
        format!(
            "{}{}{}{}",
            body.order_id, body.status_code, body.gross_amount, server_key
        )
        .as_bytes(),
    );
    let signature = format!("{digest:x}");
    if signature != body.signature_key {
        let server_key_hash = format!("{:x}", Sha256::digest(server_key.as_bytes()));
        let server_key_hash = server_key_hash.get(..8).unwrap_or(&server_key_hash);
        tracing::warn!(
            order_id = %body.order_id,
            status_code = %body.status_code,
            gross_amount = %body.gross_amount,
            provided_signature = %body.signature_key,
            expected_signature = %signature,
            server_key_hash = %server_key_hash,
            "Midtrans webhook signature mismatch"
        );
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_SIGNATURE",
            "Invalid billing webhook signature",
        ));
    }
    Ok(())
}
