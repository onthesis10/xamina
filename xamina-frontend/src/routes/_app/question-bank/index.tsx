import { useEffect } from "react";

import { useUiStore } from "@/store/ui.store";
import { QuestionBankPanel } from "@/features/question/QuestionBankPanel";

export function QuestionBankRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Question Bank");
  }, []);
  return <QuestionBankPanel />;
}
