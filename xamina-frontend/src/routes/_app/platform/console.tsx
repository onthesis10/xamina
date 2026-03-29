import { useEffect } from "react";

import { PlatformConsolePanel } from "@/features/superadmin/PlatformConsolePanel";
import { useUiStore } from "@/store/ui.store";

export function PlatformConsoleRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Platform Console");
  }, []);
  return <PlatformConsolePanel />;
}
