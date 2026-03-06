import { api } from "@/lib/axios";
import type {
    AnomalyEventDto,
    ApiSuccess,
    StartSubmissionDto,
    StudentExamListItem,
    SubmissionAnswerInput,
    SubmissionResultDto,
    SubmissionSessionDto,
} from "@/types/api.types";

export const sessionApi = {
    listMyExams: async () => {
        const response = await api.get<ApiSuccess<StudentExamListItem[]>>("/me/exams");
        return response.data.data;
    },
    startExam: async (examId: string) => {
        const response = await api.post<ApiSuccess<StartSubmissionDto>>(`/exams/${examId}/start`);
        return response.data.data;
    },
    getSubmission: async (submissionId: string) => {
        const response = await api.get<ApiSuccess<SubmissionSessionDto>>(`/submissions/${submissionId}`);
        return response.data.data;
    },
    upsertAnswers: async (submissionId: string, answers: SubmissionAnswerInput[]) => {
        const response = await api.post<ApiSuccess<{ submission_id: string; saved_count: number }>>(
            `/submissions/${submissionId}/answers`,
            { answers },
        );
        return response.data.data;
    },
    logAnomaly: async (submissionId: string, payload: AnomalyEventDto) => {
        await api.post(`/submissions/${submissionId}/anomalies`, payload);
    },
    finishSubmission: async (submissionId: string) => {
        const response = await api.post<ApiSuccess<SubmissionResultDto>>(`/submissions/${submissionId}/finish`);
        return response.data.data;
    },
    getResult: async (submissionId: string) => {
        const response = await api.get<ApiSuccess<SubmissionResultDto>>(`/submissions/${submissionId}/result`);
        return response.data.data;
    },
};
