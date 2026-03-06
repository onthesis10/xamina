import { useEffect } from "react";

import { TenantsPanel } from "@/features/superadmin/TenantsPanel";
import { useUiStore } from "@/store/ui.store";

export function PlatformTenantsRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Platform Tenants");
  }, []);
  return <TenantsPanel />;
}
