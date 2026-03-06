import { api } from "@/lib/axios";

export interface ExamSubmissionItem {
    submission_id: string;
    student_id: string;
    student_name: string;
    status: string;
    answered_count: number;
    anomaly_count: number;
    started_at: string;
    finished_at: string | null;
    score: number | null;
}

export const monitorApi = {
    async getExamSubmissions(examId: string): Promise<ExamSubmissionItem[]> {
        const res = await api.get(`/exams/${examId}/submissions`);
        return res.data.data;
    },
    async forceFinishSubmission(examId: string, studentId: string) {
        const res = await api.post(`/exams/${examId}/submissions/${studentId}/force-finish`);
        return res.data.data;
    },
};
