import { useEffect } from "react";
import { useParams } from "@tanstack/react-router";

import { ExamSessionPanel } from "@/features/exam-session/ExamSessionPanel";
import { useUiStore } from "@/store/ui.store";

export function MyExamSessionRoutePage() {
    const params = useParams({ from: "/app/my-exams/session/$submissionId" });
    useEffect(() => {
        useUiStore.getState().setPageTitle("Exam Session");
    }, []);
    return <ExamSessionPanel submissionId={params.submissionId} />;
}
