use std::{
    fs::{self, File},
    io::BufWriter,
    path::{Path, PathBuf},
};

use chrono::{Duration, Utc};
use printpdf::{BuiltinFont, IndirectFontRef, Mm, PdfDocument, PdfLayerReference};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{domain::notification::service::NotificationService, error::CoreError};

use super::{
    dto::{
        BillingCheckoutSessionDto, BillingHistoryMeta, BillingHistoryQuery, BillingInvoiceDto,
        BillingPlanDto, BillingSubscriptionDto, BillingSummaryDto, BillingWebhookProcessDto,
    },
    models::{
        BillingHistoryPage, BillingInvoiceInsertInput, BillingInvoiceRawRow, BillingPlanDefinition,
        BillingTenantRow,
    },
    repository::BillingRepository,
};

const BILLING_PLANS: [BillingPlanDefinition; 3] = [
    BillingPlanDefinition {
        code: "starter",
        label: "Starter",
        amount: 299_000,
        currency: "IDR",
        users_quota: 500,
        ai_credits_quota: 200,
        description: "Untuk sekolah kecil yang baru memulai operasional CBT.",
    },
    BillingPlanDefinition {
        code: "professional",
        label: "Professional",
        amount: 899_000,
        currency: "IDR",
        users_quota: 2_000,
        ai_credits_quota: 1_000,
        description: "Untuk sekolah aktif dengan kebutuhan analitik dan AI lebih tinggi.",
    },
    BillingPlanDefinition {
        code: "enterprise",
        label: "Enterprise",
        amount: 1_999_000,
        currency: "IDR",
        users_quota: 5_000,
        ai_credits_quota: 5_000,
        description: "Untuk deployment multi-unit dengan kuota dan support tertinggi.",
    },
];

#[derive(Debug, Clone)]
pub struct BillingDraft {
    pub invoice: BillingInvoiceDto,
    pub current_subscription: Option<BillingSubscriptionDto>,
}

#[derive(Debug, Clone)]
pub struct BillingService {
    repo: BillingRepository,
    notification: NotificationService,
    invoice_public_base_url: String,
}

struct InvoicePdfRenderContext<'a> {
    tenant: &'a BillingTenantRow,
    invoice_id: Uuid,
    subscription_id: Uuid,
    plan: &'a BillingPlanDefinition,
    status: &'a str,
    provider: &'a str,
    provider_ref: &'a str,
    amount: i64,
    currency: &'a str,
    issued_at: chrono::DateTime<Utc>,
    period_start: Option<chrono::DateTime<Utc>>,
    period_end: Option<chrono::DateTime<Utc>>,
    due_at: chrono::DateTime<Utc>,
    paid_at: Option<chrono::DateTime<Utc>>,
    attempt_count: i32,
    next_retry_at: Option<chrono::DateTime<Utc>>,
    checkout_url: Option<&'a str>,
    pdf_url: Option<&'a str>,
}

impl<'a> InvoicePdfRenderContext<'a> {
    fn from_invoice_raw(
        tenant: &'a BillingTenantRow,
        invoice: &'a BillingInvoiceRawRow,
        plan: &'a BillingPlanDefinition,
    ) -> Self {
        Self {
            tenant,
            invoice_id: invoice.id,
            subscription_id: invoice.subscription_id,
            plan,
            status: &invoice.status,
            provider: &invoice.provider,
            provider_ref: &invoice.provider_ref,
            amount: invoice.amount,
            currency: &invoice.currency,
            issued_at: invoice.created_at,
            period_start: invoice.period_start,
            period_end: invoice.period_end,
            due_at: invoice.due_at,
            paid_at: invoice.paid_at,
            attempt_count: invoice.attempt_count,
            next_retry_at: invoice.next_retry_at,
            checkout_url: invoice.checkout_url.as_deref(),
            pdf_url: Some(invoice.pdf_url.as_str()),
        }
    }
}

impl BillingService {
    pub fn new(
        repo: BillingRepository,
        notification: NotificationService,
        invoice_public_base_url: String,
    ) -> Self {
        Self {
            repo,
            notification,
            invoice_public_base_url,
        }
    }

    pub fn available_plans(&self) -> Vec<BillingPlanDto> {
        BILLING_PLANS.iter().map(plan_to_dto).collect()
    }

    pub async fn summary(&self, tenant_id: Uuid) -> Result<BillingSummaryDto, CoreError> {
        self.ensure_tenant_exists(tenant_id).await?;
        let current_subscription = self.repo.get_subscription(tenant_id).await?;
        let outstanding_invoice = self.repo.get_outstanding_invoice(tenant_id).await?;
        let recent_invoices = self.repo.list_invoices(tenant_id, 5, 0).await?;
        Ok(BillingSummaryDto {
            tenant_id,
            available_plans: self.available_plans(),
            current_subscription,
            outstanding_invoice,
            recent_invoices,
        })
    }

    pub async fn history(
        &self,
        tenant_id: Uuid,
        query: BillingHistoryQuery,
    ) -> Result<BillingHistoryPage, CoreError> {
        self.ensure_tenant_exists(tenant_id).await?;
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * page_size;
        let total = self.repo.count_invoices(tenant_id).await?;
        let rows = self
            .repo
            .list_invoices(tenant_id, page_size, offset)
            .await?;
        Ok(BillingHistoryPage {
            rows,
            meta: BillingHistoryMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn create_checkout_draft(
        &self,
        tenant_id: Uuid,
        plan_code: &str,
        provider: &str,
    ) -> Result<BillingDraft, CoreError> {
        let plan = self.plan_by_code(plan_code)?;
        let tenant = self.get_tenant_or_error(tenant_id).await?;
        let current_subscription = self.repo.get_subscription(tenant_id).await?;

        let subscription = if let Some(existing) = current_subscription.as_ref() {
            if existing.status == "pending_activation" {
                self.repo
                    .update_subscription_pending_plan(
                        tenant_id,
                        existing.id,
                        plan.code,
                        plan.amount,
                        "pending_activation",
                    )
                    .await?
            } else {
                existing.clone()
            }
        } else {
            self.repo
                .create_subscription(
                    tenant_id,
                    plan.code,
                    provider,
                    plan.amount,
                    plan.currency,
                    "pending_activation",
                )
                .await?
        };

        let now = Utc::now();
        let invoice_id = Uuid::new_v4();
        let provider_ref = format!(
            "INV-{}-{}",
            now.format("%Y%m%d%H%M%S"),
            &invoice_id.to_string()[..8]
        );
        let period_start = Some(now);
        let period_end = Some(now + Duration::days(30));
        let due_at = now + Duration::days(3);
        let pdf_path = format!("uploads/invoices/{tenant_id}/{invoice_id}.pdf");
        self.render_invoice_pdf(
            &pdf_path,
            &InvoicePdfRenderContext {
                tenant: &tenant,
                invoice_id,
                subscription_id: subscription.id,
                plan,
                status: "pending",
                provider,
                provider_ref: &provider_ref,
                amount: plan.amount,
                currency: plan.currency,
                issued_at: now,
                period_start,
                period_end,
                due_at,
                paid_at: None,
                attempt_count: 0,
                next_retry_at: None,
                checkout_url: None,
                pdf_url: None,
            },
        )?;
        let pdf_url = format!(
            "{}/{tenant_id}/{invoice_id}.pdf",
            self.invoice_public_base_url.trim_end_matches('/')
        );

        let invoice = self
            .repo
            .insert_invoice(BillingInvoiceInsertInput {
                id: invoice_id,
                tenant_id,
                subscription_id: subscription.id,
                plan_code: plan.code.to_string(),
                status: "pending".to_string(),
                provider: provider.to_string(),
                provider_ref,
                amount: plan.amount,
                currency: plan.currency.to_string(),
                period_start,
                period_end,
                due_at,
                checkout_url: None,
                pdf_path,
                pdf_url,
                raw_payload_jsonb: json!({}),
            })
            .await?;

        Ok(BillingDraft {
            invoice,
            current_subscription,
        })
    }

    pub async fn attach_checkout_url(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
        checkout_url: &str,
    ) -> Result<BillingInvoiceDto, CoreError> {
        let invoice = self
            .repo
            .update_invoice_checkout_url(tenant_id, invoice_id, checkout_url)
            .await?;
        self.sync_invoice_pdf(tenant_id, invoice_id).await?;
        Ok(invoice)
    }

    pub async fn get_subscription(
        &self,
        tenant_id: Uuid,
    ) -> Result<Option<BillingSubscriptionDto>, CoreError> {
        self.repo.get_subscription(tenant_id).await
    }

    pub async fn find_invoice(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
    ) -> Result<Option<BillingInvoiceDto>, CoreError> {
        self.repo.get_invoice(tenant_id, invoice_id).await
    }

    pub async fn find_invoice_raw_path(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
    ) -> Result<Option<String>, CoreError> {
        let invoice = self.repo.get_invoice_raw(tenant_id, invoice_id).await?;
        Ok(invoice.map(|row| row.pdf_path))
    }

    pub async fn download_invoice_pdf(
        &self,
        tenant_id: Uuid,
        invoice_id: Uuid,
    ) -> Result<Vec<u8>, CoreError> {
        let tenant = self.get_tenant_or_error(tenant_id).await?;
        let invoice = self
            .repo
            .get_invoice_raw(tenant_id, invoice_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Billing invoice not found"))?;

        let target_path = Self::resolve_uploads_path(&invoice.pdf_path);
        let needs_regen = fs::metadata(&target_path)
            .map(|meta| meta.len() == 0)
            .unwrap_or(true);
        if needs_regen {
            let plan = self.plan_by_code(&invoice.plan_code)?;
            let render_ctx = InvoicePdfRenderContext::from_invoice_raw(&tenant, &invoice, plan);
            self.render_invoice_pdf(&invoice.pdf_path, &render_ctx)?;
        }

        fs::read(&target_path).map_err(|_| {
            CoreError::internal("INVOICE_DOWNLOAD_FAILED", "Failed to read invoice PDF")
        })
    }

    pub async fn apply_webhook(
        &self,
        provider: &str,
        event_key: &str,
        provider_ref: &str,
        next_status: &str,
        payload: Value,
    ) -> Result<BillingWebhookProcessDto, CoreError> {
        let Some(invoice_row) = self
            .repo
            .get_invoice_raw_by_provider_ref(provider_ref)
            .await?
        else {
            return Err(CoreError::not_found(
                "NOT_FOUND",
                "Billing invoice not found for webhook provider_ref",
            ));
        };

        let inserted = self
            .repo
            .insert_webhook_event(
                Some(invoice_row.tenant_id),
                provider,
                event_key,
                Some(provider_ref),
                payload.clone(),
            )
            .await?;
        if inserted.is_none() {
            let invoice = self
                .repo
                .get_invoice(invoice_row.tenant_id, invoice_row.id)
                .await?
                .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Billing invoice not found"))?;
            let subscription = self
                .repo
                .get_subscription_by_id(invoice_row.tenant_id, invoice_row.subscription_id)
                .await?
                .ok_or_else(|| {
                    CoreError::not_found("NOT_FOUND", "Billing subscription not found")
                })?;
            return Ok(BillingWebhookProcessDto {
                already_processed: true,
                invoice,
                subscription,
            });
        }

        let paid_at = if next_status == "paid" {
            Some(Utc::now())
        } else {
            None
        };
        let invoice = self
            .repo
            .update_invoice_status(
                invoice_row.tenant_id,
                invoice_row.id,
                next_status,
                paid_at,
                payload,
            )
            .await?;

        let plan = self.plan_by_code(&invoice.plan_code)?;
        let subscription = if next_status == "paid" {
            let period_start = invoice.period_start.unwrap_or_else(Utc::now);
            let period_end = invoice
                .period_end
                .unwrap_or_else(|| period_start + Duration::days(30));
            self.repo
                .update_tenant_plan(
                    invoice.tenant_id,
                    plan.code,
                    plan.users_quota,
                    plan.ai_credits_quota,
                )
                .await?;
            self.repo
                .activate_subscription(
                    invoice.tenant_id,
                    invoice.subscription_id,
                    plan.code,
                    &invoice.provider_ref,
                    plan.amount,
                    period_start,
                    period_end,
                    invoice.id,
                )
                .await?
        } else {
            if next_status == "failed" {
                self.repo
                    .mark_subscription_past_due(invoice.tenant_id, invoice.subscription_id)
                    .await?;
            }
            self.repo
                .get_subscription_by_id(invoice.tenant_id, invoice.subscription_id)
                .await?
                .ok_or_else(|| {
                    CoreError::not_found("NOT_FOUND", "Billing subscription not found")
                })?
        };

        self.sync_invoice_pdf(invoice.tenant_id, invoice.id).await?;

        Ok(BillingWebhookProcessDto {
            already_processed: false,
            invoice,
            subscription,
        })
    }

    pub async fn process_dunning_cycle(&self, max_attempts: i32) -> Result<usize, CoreError> {
        let due_invoices = self
            .repo
            .list_due_invoices_for_dunning(max_attempts, 25)
            .await?;
        let mut processed = 0usize;
        for invoice in due_invoices {
            self.notification
                .notify_billing_invoice_due(
                    invoice.tenant_id,
                    invoice.id,
                    &invoice.plan_code,
                    invoice.amount,
                    &invoice.currency,
                    invoice.due_at,
                    &invoice.pdf_url,
                    invoice.checkout_url.as_deref(),
                )
                .await?;
            let next_retry_at = if invoice.attempt_count + 1 >= max_attempts {
                None
            } else {
                Some(Utc::now() + Duration::hours(24))
            };
            let next_status = if invoice.attempt_count + 1 >= max_attempts {
                "failed"
            } else {
                "overdue"
            };
            let updated_invoice = self
                .repo
                .mark_invoice_dunning_attempt(
                    invoice.tenant_id,
                    invoice.id,
                    next_status,
                    next_retry_at,
                )
                .await?;
            self.sync_invoice_pdf(updated_invoice.tenant_id, updated_invoice.id)
                .await?;
            self.repo
                .mark_subscription_past_due(invoice.tenant_id, invoice.subscription_id)
                .await?;
            processed += 1;
        }
        Ok(processed)
    }

    pub fn checkout_session(
        &self,
        gateway_mode: &str,
        checkout_url: String,
        invoice: BillingInvoiceDto,
        current_subscription: Option<BillingSubscriptionDto>,
    ) -> BillingCheckoutSessionDto {
        BillingCheckoutSessionDto {
            gateway_mode: gateway_mode.to_string(),
            checkout_url,
            invoice,
            current_subscription,
        }
    }

    fn plan_by_code(&self, code: &str) -> Result<&'static BillingPlanDefinition, CoreError> {
        let normalized = code.trim().to_ascii_lowercase();
        BILLING_PLANS
            .iter()
            .find(|plan| plan.code == normalized)
            .ok_or_else(|| {
                CoreError::bad_request("VALIDATION_ERROR", "Unsupported billing plan_code")
            })
    }

    async fn ensure_tenant_exists(&self, tenant_id: Uuid) -> Result<(), CoreError> {
        self.get_tenant_or_error(tenant_id).await.map(|_| ())
    }

    async fn get_tenant_or_error(&self, tenant_id: Uuid) -> Result<BillingTenantRow, CoreError> {
        self.repo
            .get_tenant(tenant_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Tenant not found"))
    }

    async fn sync_invoice_pdf(&self, tenant_id: Uuid, invoice_id: Uuid) -> Result<(), CoreError> {
        let tenant = self.get_tenant_or_error(tenant_id).await?;
        let invoice = self
            .repo
            .get_invoice_raw(tenant_id, invoice_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "Billing invoice not found"))?;
        let plan = self.plan_by_code(&invoice.plan_code)?;
        let render_ctx = InvoicePdfRenderContext::from_invoice_raw(&tenant, &invoice, plan);
        self.render_invoice_pdf(&invoice.pdf_path, &render_ctx)
    }

    fn resolve_uploads_dir() -> PathBuf {
        if let Ok(value) = std::env::var("XAMINA_UPLOADS_DIR") {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed);
            }
        }
        let default_dir = PathBuf::from("uploads");
        if default_dir.is_dir() {
            return default_dir;
        }
        let fallback_dir = PathBuf::from("xamina-backend").join("uploads");
        if fallback_dir.is_dir() {
            return fallback_dir;
        }
        default_dir
    }

    fn resolve_uploads_path(relative_path: &str) -> PathBuf {
        let path = Path::new(relative_path);
        if path.is_absolute() {
            return path.to_path_buf();
        }
        let uploads_dir = Self::resolve_uploads_dir();
        let trimmed = relative_path
            .strip_prefix("uploads/")
            .or_else(|| relative_path.strip_prefix("uploads\\"))
            .unwrap_or(relative_path);
        uploads_dir.join(trimmed)
    }

    fn render_invoice_pdf(
        &self,
        relative_path: &str,
        render_ctx: &InvoicePdfRenderContext<'_>,
    ) -> Result<(), CoreError> {
        let (doc, page, layer) =
            PdfDocument::new("Xamina Invoice", Mm(210.0), Mm(297.0), "Layer 1");
        let current_layer = doc.get_page(page).get_layer(layer);
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|_| CoreError::internal("INVOICE_RENDER_FAILED", "Failed to load PDF font"))?;
        let font_regular = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|_| CoreError::internal("INVOICE_RENDER_FAILED", "Failed to load PDF font"))?;
        let mut y = 275.0;

        write_pdf_line(
            &current_layer,
            &font_bold,
            28.0,
            18.0,
            &mut y,
            "Xamina Billing Invoice",
            13.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!(
                "{} | Generated {}",
                invoice_status_label(render_ctx.status),
                format_timestamp(render_ctx.issued_at)
            ),
            10.0,
        );
        y -= 4.0;

        write_pdf_line(
            &current_layer,
            &font_bold,
            14.0,
            18.0,
            &mut y,
            "Invoice Summary",
            9.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Invoice ID: {}", render_ctx.invoice_id),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Invoice No: {}", render_ctx.provider_ref),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Subscription ID: {}", render_ctx.subscription_id),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Billing Provider: {}", render_ctx.provider),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Status: {}", invoice_status_label(render_ctx.status)),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!(
                "Amount Due: {} {}",
                render_ctx.currency,
                format_amount(render_ctx.amount)
            ),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Due At: {}", format_timestamp(render_ctx.due_at)),
            7.0,
        );
        if let Some(paid_at) = render_ctx.paid_at {
            write_pdf_line(
                &current_layer,
                &font_regular,
                11.0,
                18.0,
                &mut y,
                format!("Paid At: {}", format_timestamp(paid_at)),
                7.0,
            );
        }
        if let Some(period) = format_period(render_ctx.period_start, render_ctx.period_end) {
            write_pdf_line(
                &current_layer,
                &font_regular,
                11.0,
                18.0,
                &mut y,
                format!("Billing Period: {period}"),
                7.0,
            );
        }
        y -= 4.0;

        write_pdf_line(
            &current_layer,
            &font_bold,
            14.0,
            18.0,
            &mut y,
            "Tenant",
            9.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Tenant Name: {}", render_ctx.tenant.name),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Tenant Slug: {}", render_ctx.tenant.slug),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Tenant ID: {}", render_ctx.tenant.id),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("Current Workspace Plan: {}", render_ctx.tenant.plan),
            7.0,
        );
        y -= 4.0;

        write_pdf_line(
            &current_layer,
            &font_bold,
            14.0,
            18.0,
            &mut y,
            "Plan Detail",
            9.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!(
                "Selected Plan: {} ({})",
                render_ctx.plan.label, render_ctx.plan.code
            ),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("User Quota: {}", render_ctx.plan.users_quota),
            7.0,
        );
        write_pdf_line(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            format!("AI Credits Quota: {}", render_ctx.plan.ai_credits_quota),
            7.0,
        );
        write_pdf_wrapped(
            &current_layer,
            &font_regular,
            11.0,
            18.0,
            &mut y,
            &format!("Plan Description: {}", render_ctx.plan.description),
            7.0,
            78,
        );
        y -= 4.0;

        write_pdf_line(
            &current_layer,
            &font_bold,
            14.0,
            18.0,
            &mut y,
            "Payment Access",
            9.0,
        );
        match render_ctx.checkout_url {
            Some(checkout_url) => {
                write_pdf_wrapped(
                    &current_layer,
                    &font_regular,
                    11.0,
                    18.0,
                    &mut y,
                    &format!("Checkout URL: {checkout_url}"),
                    7.0,
                    78,
                );
            }
            None => {
                write_pdf_line(
                    &current_layer,
                    &font_regular,
                    11.0,
                    18.0,
                    &mut y,
                    "Checkout URL: not generated yet",
                    7.0,
                );
            }
        }
        if let Some(pdf_url) = render_ctx.pdf_url {
            write_pdf_wrapped(
                &current_layer,
                &font_regular,
                11.0,
                18.0,
                &mut y,
                &format!("Hosted PDF URL: {pdf_url}"),
                7.0,
                78,
            );
        }
        if render_ctx.attempt_count > 0 {
            write_pdf_line(
                &current_layer,
                &font_regular,
                11.0,
                18.0,
                &mut y,
                format!("Dunning Attempts: {}", render_ctx.attempt_count),
                7.0,
            );
        }
        if let Some(next_retry_at) = render_ctx.next_retry_at {
            write_pdf_line(
                &current_layer,
                &font_regular,
                11.0,
                18.0,
                &mut y,
                format!("Next Retry At: {}", format_timestamp(next_retry_at)),
                7.0,
            );
        }
        y -= 4.0;

        write_pdf_line(&current_layer, &font_bold, 14.0, 18.0, &mut y, "Notes", 9.0);
        for note in invoice_status_notes(render_ctx) {
            write_pdf_wrapped(
                &current_layer,
                &font_regular,
                11.0,
                18.0,
                &mut y,
                &format!("- {note}"),
                7.0,
                78,
            );
        }
        write_pdf_wrapped(
            &current_layer,
            &font_regular,
            10.0,
            18.0,
            &mut y,
            "This invoice is generated automatically by Xamina for audit and billing follow-up purposes.",
            6.0,
            82,
        );

        let target_path = Self::resolve_uploads_path(relative_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|_| {
                CoreError::internal("INVOICE_RENDER_FAILED", "Failed to create invoice folder")
            })?;
        }
        let file = File::create(&target_path).map_err(|_| {
            CoreError::internal("INVOICE_RENDER_FAILED", "Failed to create invoice PDF")
        })?;
        let mut writer = BufWriter::new(file);
        doc.save(&mut writer).map_err(|_| {
            CoreError::internal("INVOICE_RENDER_FAILED", "Failed to save invoice PDF")
        })?;
        Ok(())
    }
}

fn plan_to_dto(plan: &BillingPlanDefinition) -> BillingPlanDto {
    BillingPlanDto {
        code: plan.code.to_string(),
        label: plan.label.to_string(),
        amount: plan.amount,
        currency: plan.currency.to_string(),
        users_quota: plan.users_quota,
        ai_credits_quota: plan.ai_credits_quota,
        description: plan.description.to_string(),
    }
}

fn format_amount(amount: i64) -> String {
    let raw = amount.to_string();
    let mut out = String::new();
    for (index, ch) in raw.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 {
            out.push('.');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}

fn format_timestamp(value: chrono::DateTime<Utc>) -> String {
    value.format("%d %b %Y %H:%M UTC").to_string()
}

fn format_period(
    period_start: Option<chrono::DateTime<Utc>>,
    period_end: Option<chrono::DateTime<Utc>>,
) -> Option<String> {
    match (period_start, period_end) {
        (Some(start), Some(end)) => Some(format!(
            "{} - {}",
            start.format("%d %b %Y"),
            end.format("%d %b %Y")
        )),
        (Some(start), None) => Some(format!("starts {}", start.format("%d %b %Y"))),
        (None, Some(end)) => Some(format!("until {}", end.format("%d %b %Y"))),
        (None, None) => None,
    }
}

fn invoice_status_label(status: &str) -> &'static str {
    match status {
        "pending" => "Pending Payment",
        "paid" => "Paid",
        "overdue" => "Overdue",
        "failed" => "Failed",
        other if other.eq_ignore_ascii_case("pending_activation") => "Pending Activation",
        _ => "Unknown",
    }
}

fn invoice_status_notes(render_ctx: &InvoicePdfRenderContext<'_>) -> Vec<String> {
    let mut notes = Vec::new();
    match render_ctx.status {
        "pending" => notes.push(
            "Payment has not been settled yet. Complete checkout before the due date to avoid dunning."
                .to_string(),
        ),
        "paid" => notes.push(
            "Payment has been confirmed and the workspace plan should already be provisioned."
                .to_string(),
        ),
        "overdue" => notes.push(
            "This invoice is overdue. Xamina will continue dunning until the maximum retry threshold is reached."
                .to_string(),
        ),
        "failed" => notes.push(
            "This invoice failed after the retry window. A new checkout is required to reactivate billing."
                .to_string(),
        ),
        _ => {}
    }
    if render_ctx.checkout_url.is_some() {
        notes.push("Use the checkout URL in this invoice to continue payment in the configured billing gateway.".to_string());
    }
    notes
}

fn write_pdf_line(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    font_size: f32,
    x: f32,
    y: &mut f32,
    text: impl AsRef<str>,
    gap: f32,
) {
    layer.use_text(text.as_ref(), font_size, Mm(x), Mm(*y), font);
    *y -= gap;
}

fn write_pdf_wrapped(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    font_size: f32,
    x: f32,
    y: &mut f32,
    text: &str,
    gap: f32,
    max_chars: usize,
) {
    for line in wrap_pdf_text(text, max_chars) {
        write_pdf_line(layer, font, font_size, x, y, line, gap);
    }
}

fn wrap_pdf_text(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        for token in split_pdf_token(word, max_chars) {
            let next_len = if current.is_empty() {
                token.len()
            } else {
                current.len() + 1 + token.len()
            };
            if next_len > max_chars && !current.is_empty() {
                lines.push(current);
                current = token;
            } else {
                if !current.is_empty() {
                    current.push(' ');
                }
                current.push_str(&token);
            }
        }
    }

    if !current.is_empty() {
        lines.push(current);
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}

fn split_pdf_token(token: &str, max_chars: usize) -> Vec<String> {
    if token.len() <= max_chars {
        return vec![token.to_string()];
    }

    let mut parts = Vec::new();
    let mut current = String::new();
    for ch in token.chars() {
        current.push(ch);
        if current.chars().count() >= max_chars {
            parts.push(current);
            current = String::new();
        }
    }
    if !current.is_empty() {
        parts.push(current);
    }
    parts
}
