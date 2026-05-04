import { useEffect } from "react";

import { useUiStore } from "@/store/ui.store";
import { QuestionBankLayout } from "@/features/question-bank/QuestionBankLayout";

export function QuestionBankRoutePage() {
  useEffect(() => {
    useUiStore.getState().setPageTitle("Question Bank");
  }, []);
  return <QuestionBankLayout />;
}
