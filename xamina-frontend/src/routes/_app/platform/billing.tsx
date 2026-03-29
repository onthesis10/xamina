import { useEffect } from "react";

import { BillingPanel } from "@/features/superadmin/BillingPanel";
import { useUiStore } from "@/store/ui.store";

export function PlatformBillingRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Platform Billing");
  }, []);
  return <BillingPanel />;
}
