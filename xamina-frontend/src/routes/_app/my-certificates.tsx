import { useEffect } from "react";

import { MyCertificatesPanel } from "@/features/certificate/MyCertificatesPanel";
import { useUiStore } from "@/store/ui.store";

export function MyCertificatesRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("My Certificates");
  }, []);
  return <MyCertificatesPanel />;
}
