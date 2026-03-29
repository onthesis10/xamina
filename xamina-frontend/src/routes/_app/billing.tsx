import { useEffect } from "react";

import { AdminBillingPanel } from "@/features/billing/AdminBillingPanel";
import { useUiStore } from "@/store/ui.store";

export function BillingRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Billing");
  }, []);
  return <AdminBillingPanel />;
}
