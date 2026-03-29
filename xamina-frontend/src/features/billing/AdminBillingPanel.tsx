import { BillingWorkspacePanel } from "@/features/billing/BillingWorkspacePanel";

import { billingApi } from "./billing.api";

export function AdminBillingPanel() {
  return (
    <BillingWorkspacePanel
      eyebrow="Tenant Billing"
      title="Subscription & Invoice Control"
      description="Kelola plan tenant aktif, buat checkout session baru, dan unduh invoice PDF tanpa berpindah ke scope platform."
      isReady
      summaryQueryKeyPrefix={["tenant-billing-summary"]}
      historyQueryKeyPrefix={["tenant-billing-history"]}
      loadSummary={() => billingApi.tenant.summary()}
      loadHistory={(page) => billingApi.tenant.history({ page, page_size: 10 })}
      createCheckout={(planCode) => billingApi.tenant.checkout({ plan_code: planCode })}
      changePlan={(planCode) => billingApi.tenant.changePlan({ plan_code: planCode })}
      downloadInvoicePdf={(invoiceId) => billingApi.tenant.downloadInvoicePdf(invoiceId)}
    />
  );
}
