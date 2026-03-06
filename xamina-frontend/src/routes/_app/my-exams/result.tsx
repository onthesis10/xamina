import { useEffect } from "react";
import { useParams } from "@tanstack/react-router";

import { ExamResultPanel } from "@/features/exam-session/ExamResultPanel";
import { useUiStore } from "@/store/ui.store";

export function MyExamResultRoutePage() {
    const params = useParams({ from: "/app/my-exams/result/$submissionId" });
    useEffect(() => {
        useUiStore.getState().setPageTitle("Exam Result");
    }, []);
    return <ExamResultPanel submissionId={params.submissionId} />;
}
