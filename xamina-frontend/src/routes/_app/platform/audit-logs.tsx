import { useEffect } from "react";

import { PlatformAuditLogsPanel } from "@/features/superadmin/PlatformAuditLogsPanel";
import { useUiStore } from "@/store/ui.store";

export function PlatformAuditLogsRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Platform Audit Logs");
  }, []);
  return <PlatformAuditLogsPanel />;
}
