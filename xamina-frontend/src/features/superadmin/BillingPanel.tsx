import { useUiStore } from "@/store/ui.store";

import { BillingWorkspacePanel } from "@/features/billing/BillingWorkspacePanel";
import { billingApi } from "@/features/billing/billing.api";

export function BillingPanel() {
  const activeTenantId = useUiStore((state) => state.activeTenantId);

  return (
    <BillingWorkspacePanel
      eyebrow="Platform Billing"
      title="Subscription & Invoice Control"
      description="Kelola plan tenant aktif, buat checkout session baru, dan unduh invoice PDF yang sudah tersimpan."
      isReady={Boolean(activeTenantId)}
      missingScope={{
        title: "Pilih tenant scope dulu",
        description:
          "Billing batch pertama dikelola oleh super admin per tenant. Pilih tenant aktif di halaman platform tenants untuk membuka summary dan invoice history.",
        href: "/app/platform/tenants",
        ctaLabel: "Buka Platform Tenants",
      }}
      summaryQueryKeyPrefix={["platform-billing-summary", activeTenantId]}
      historyQueryKeyPrefix={["platform-billing-history", activeTenantId]}
      loadSummary={() => billingApi.platform.summary(activeTenantId!)}
      loadHistory={(page) => billingApi.platform.history(activeTenantId!, { page, page_size: 10 })}
      createCheckout={(planCode) => billingApi.platform.checkout(activeTenantId!, { plan_code: planCode })}
      changePlan={(planCode) => billingApi.platform.changePlan(activeTenantId!, { plan_code: planCode })}
      downloadInvoicePdf={(invoiceId) => billingApi.platform.downloadInvoicePdf(activeTenantId!, invoiceId)}
    />
  );
}
