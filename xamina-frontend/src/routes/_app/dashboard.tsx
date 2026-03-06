import { useEffect } from "react";

import { DashboardPanel } from "@/features/analytics/DashboardPanel";
import { useUiStore } from "@/store/ui.store";

export function DashboardPage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Dashboard");
  }, []);
  return <DashboardPanel />;
}
