import { useParams } from "@tanstack/react-router";
import { ExamMonitorPanel } from "@/features/exam/ExamMonitorPanel";

export function ExamMonitorRoutePage() {
    const params = useParams({ from: "/app/exams/monitor/$examId" });
    return <ExamMonitorPanel examId={params.examId} />;
}
