import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { errorMessageForCode } from "@/lib/axios";
import { resolvePublicAssetUrl } from "@/lib/api-base";
import { downloadPublicAssetFile, saveBlobAsFile } from "@/lib/file-download";
import { useToast } from "@/store/toast.store";
import type {
  BillingCheckoutSessionDto,
  BillingHistoryMeta,
  BillingInvoiceDto,
  BillingSummaryDto,
} from "@/types/api.types";

import { BillingPlanCard } from "./BillingPlanCard";
import { formatBillingCurrency, formatBillingDate } from "./billing.utils";

interface MissingScopeState {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

interface BillingWorkspacePanelProps {
  eyebrow: string;
  title: string;
  description: string;
  isReady: boolean;
  missingScope?: MissingScopeState;
  summaryQueryKeyPrefix: readonly unknown[];
  historyQueryKeyPrefix: readonly unknown[];
  loadSummary: () => Promise<BillingSummaryDto>;
  loadHistory: (page: number) => Promise<{
    data: BillingInvoiceDto[];
    meta: BillingHistoryMeta;
  }>;
  createCheckout: (planCode: string) => Promise<BillingCheckoutSessionDto>;
  changePlan: (planCode: string) => Promise<BillingCheckoutSessionDto>;
  downloadInvoicePdf: (invoiceId: string) => Promise<Blob>;
}

export function BillingWorkspacePanel(props: BillingWorkspacePanelProps) {
  const {
    eyebrow,
    title,
    description,
    isReady,
    missingScope,
    summaryQueryKeyPrefix,
    historyQueryKeyPrefix,
    loadSummary,
    loadHistory,
    createCheckout,
    changePlan,
    downloadInvoicePdf,
  } = props;
  const qc = useQueryClient();
  const toast = useToast();
  const [checkoutSession, setCheckoutSession] = useState<BillingCheckoutSessionDto | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const summaryQuery = useQuery({
    queryKey: [...summaryQueryKeyPrefix],
    enabled: isReady,
    queryFn: loadSummary,
  });

  const historyQuery = useQuery({
    queryKey: [...historyQueryKeyPrefix, historyPage],
    enabled: isReady,
    queryFn: () => loadHistory(historyPage),
  });

  const billingMutation = useMutation({
    mutationFn: async (planCode: string) => {
      const currentPlan = summaryQuery.data?.current_subscription?.plan_code ?? null;
      return currentPlan ? changePlan(planCode) : createCheckout(planCode);
    },
    onSuccess: async (result) => {
      setCheckoutSession(result);
      await qc.invalidateQueries({ queryKey: [...summaryQueryKeyPrefix] });
      await qc.invalidateQueries({ queryKey: [...historyQueryKeyPrefix] });
      toast.success("Checkout session billing berhasil dibuat.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal membuat checkout billing."));
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (invoice: BillingInvoiceDto) => {
      const fallback = await downloadPublicAssetFile(invoice.pdf_url, {
        expectedContentTypes: ["pdf", "octet-stream"],
        fallbackMimeType: "application/pdf",
      });
      if (fallback instanceof Blob && fallback.size > 0) {
        return fallback;
      }

      const primary = await downloadInvoicePdf(invoice.id).catch(() => null);
      if (primary instanceof Blob && primary.size > 0) {
        return primary;
      }

      const secondFallback = await downloadPublicAssetFile(invoice.pdf_url, {
        expectedContentTypes: ["pdf", "octet-stream"],
        fallbackMimeType: "application/pdf",
      });
      if (secondFallback instanceof Blob && secondFallback.size > 0) {
        return secondFallback;
      }

      if (primary instanceof Blob) {
        return primary;
      }
      throw new Error("Invoice PDF tidak dapat diunduh.");
    },
    onSuccess: (blob, invoice) => {
      if (!(blob instanceof Blob) || blob.size === 0) {
        toast.error("Invoice PDF yang diterima kosong. Coba generate invoice baru lalu unduh lagi.");
        return;
      }
      saveBlobAsFile(blob, `xamina-invoice-${invoice.id}.pdf`);
    },
    onError: (error, invoice) => {
      const resolved = invoice?.pdf_url ? resolvePublicAssetUrl(invoice.pdf_url) : null;
      if (resolved) {
        const url = new URL(resolved, window.location.origin);
        url.searchParams.set("ts", Date.now().toString());
        const anchor = document.createElement("a");
        anchor.href = url.toString();
        anchor.download = `xamina-invoice-${invoice.id}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        toast.error(
          errorMessageForCode(
            error,
            {},
            "Gagal mengunduh via API. Invoice diunduh lewat fallback.",
          ),
        );
        return;
      }
      toast.error(errorMessageForCode(error, {}, "Gagal mengunduh invoice PDF."));
    },
  });

  const columns = useMemo(
    () => [
      {
        key: "plan_code",
        header: "Plan",
        render: (row: BillingInvoiceDto) => <span className="pill p-neu">{row.plan_code}</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row: BillingInvoiceDto) => <span className="pill p-neu">{row.status}</span>,
      },
      {
        key: "amount",
        header: "Amount",
        render: (row: BillingInvoiceDto) => formatBillingCurrency(row.currency, row.amount),
      },
      {
        key: "due_at",
        header: "Due",
        render: (row: BillingInvoiceDto) => formatBillingDate(row.due_at),
      },
      {
        key: "actions",
        header: "Action",
        render: (row: BillingInvoiceDto) => (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadMutation.mutate(row)}
            disabled={downloadMutation.isPending}
          >
            Download PDF
          </button>
        ),
      },
    ],
    [downloadMutation],
  );

  if (!isReady && missingScope) {
    return (
      <section className="panel-grid">
        <section className="card onboarding-tour" data-tour="platform_billing">
          <p className="section-eyebrow">{eyebrow}</p>
          <h2 className="section-title">{missingScope.title}</h2>
          <p className="state-text">{missingScope.description}</p>
          <a className="btn" href={missingScope.href}>
            {missingScope.ctaLabel}
          </a>
        </section>
      </section>
    );
  }

  return (
    <section className="panel-grid">
      <section className="card onboarding-tour">
        <p className="section-eyebrow">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
        <p className="state-text">{description}</p>
      </section>

      {summaryQuery.data?.outstanding_invoice ? (
        <section className="card card-muted">
          <p className="section-eyebrow">Outstanding Invoice</p>
          <h3 className="section-title-sm">
            {formatBillingCurrency(
              summaryQuery.data.outstanding_invoice.currency,
              summaryQuery.data.outstanding_invoice.amount,
            )}
          </h3>
          <p className="state-text">
            Plan {summaryQuery.data.outstanding_invoice.plan_code} jatuh tempo{" "}
            {formatBillingDate(summaryQuery.data.outstanding_invoice.due_at)}.
          </p>
          {summaryQuery.data.outstanding_invoice.checkout_url ? (
            <a
              className="btn"
              href={summaryQuery.data.outstanding_invoice.checkout_url}
              target="_blank"
              rel="noreferrer"
            >
              Buka Checkout
            </a>
          ) : null}
        </section>
      ) : null}

      {checkoutSession ? (
        <section className="card card-muted">
          <p className="section-eyebrow">Checkout Ready</p>
          <h3 className="section-title-sm">Session billing sudah dibuat</h3>
          <p className="state-text">Lanjutkan pembayaran melalui checkout URL berikut.</p>
          <a className="btn" href={checkoutSession.checkout_url} target="_blank" rel="noreferrer">
            Buka Checkout
          </a>
        </section>
      ) : null}

      <section className="grid-3">
        {(summaryQuery.data?.available_plans ?? []).map((plan) => {
          const currentPlan = summaryQuery.data?.current_subscription?.plan_code ?? null;
          const isCurrent = currentPlan === plan.code;
          const actionLabel = isCurrent
            ? "Plan Aktif"
            : currentPlan
              ? "Change Plan"
              : "Start Checkout";
          return (
            <BillingPlanCard
              key={plan.code}
              plan={plan}
              badge={isCurrent ? "Aktif" : null}
              action={
                <button
                  className="btn"
                  disabled={billingMutation.isPending || isCurrent}
                  onClick={() => billingMutation.mutate(plan.code)}
                >
                  {actionLabel}
                </button>
              }
            />
          );
        })}
      </section>

      <section className="metric-grid">
        <section className="card metric-card">
          <p className="section-eyebrow">Current Subscription</p>
          <h3 className="metric-value">
            {summaryQuery.data?.current_subscription?.plan_code ?? "not_active"}
          </h3>
          <p className="state-text">
            Status {summaryQuery.data?.current_subscription?.status ?? "belum ada"}.
          </p>
        </section>
        <section className="card metric-card">
          <p className="section-eyebrow">Billing Provider</p>
          <h3 className="metric-value">
            {checkoutSession?.gateway_mode
              ?? summaryQuery.data?.current_subscription?.provider
              ?? "mock"}
          </h3>
          <p className="state-text">Batch ini mendukung mock fallback dan Midtrans sandbox.</p>
        </section>
        <section className="card metric-card">
          <p className="section-eyebrow">Invoice Stored</p>
          <h3 className="metric-value">{historyQuery.data?.meta.total ?? 0}</h3>
          <p className="state-text">Invoice PDF tersimpan di backend uploads.</p>
        </section>
      </section>

      <DataTable
        title="Billing History"
        columns={columns}
        rows={historyQuery.data?.data ?? []}
        loading={summaryQuery.isLoading || historyQuery.isLoading}
        error={
          summaryQuery.isError
            ? errorMessageForCode(summaryQuery.error, {}, "Gagal memuat billing summary.")
            : historyQuery.isError
              ? errorMessageForCode(historyQuery.error, {}, "Gagal memuat billing history.")
              : null
        }
        actions={
          <div className="inline-actions">
            <button
              className="btn btn-ghost"
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage((value) => Math.max(1, value - 1))}
            >
              Prev
            </button>
            <button
              className="btn btn-ghost"
              disabled={
                !historyQuery.data
                || historyQuery.data.meta.page * historyQuery.data.meta.page_size
                  >= historyQuery.data.meta.total
              }
              onClick={() => setHistoryPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        }
        emptyLabel="Belum ada invoice billing."
      />
    </section>
  );
}
