import { useEffect } from "react";

import { PrivacySettingsPanel } from "@/features/privacy/PrivacySettingsPanel";
import { useUiStore } from "@/store/ui.store";

export function PrivacyRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Privacy Settings");
  }, []);

  return <PrivacySettingsPanel />;
}
