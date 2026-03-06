import { useEffect } from "react";

import { useUiStore } from "@/store/ui.store";
import { ExamsPanel } from "@/features/exam/ExamsPanel";

export function ExamsRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Exams");
  }, []);
  return <ExamsPanel />;
}
