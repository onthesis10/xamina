import { useParams } from "@tanstack/react-router";
import { ExamMonitorPanel } from "@/features/exam/ExamMonitorPanel";
import { useEffect } from "react";
import { useUiStore } from "@/store/ui.store";

export function ExamMonitorRoutePage() {
    const params = useParams({ from: "/app/exams/monitor/$examId" });
    useEffect(() => {
        useUiStore.getState().setPageTitle("Exam Monitor");
    }, []);
    return <ExamMonitorPanel examId={params.examId} />;
}
