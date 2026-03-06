import { api } from "@/lib/axios";
import type {
    ApiSuccess,
    ApiSuccessWithMeta,
    AttachQuestionsDto,
    CreateExamDto,
    ExamDto,
    PageMeta,
    PublishPrecheckResult,
    ReorderExamQuestionsDto,
    ReorderExamQuestionsResponse,
} from "@/types/api.types";

export const examApi = {
    list: async (params: { page?: number; page_size?: number; status?: string; search?: string }) => {
        const response = await api.get<ApiSuccessWithMeta<ExamDto[], PageMeta>>("/exams", { params });
        return response.data;
    },
    create: async (payload: CreateExamDto) => {
        const response = await api.post<ApiSuccess<ExamDto>>("/exams", payload);
        return response.data.data;
    },
    update: async (id: string, payload: CreateExamDto) => {
        const response = await api.patch<ApiSuccess<ExamDto>>(`/exams/${id}`, payload);
        return response.data.data;
    },
    remove: async (id: string) => {
        await api.delete(`/exams/${id}`);
    },
    getOne: async (id: string) => {
        const response = await api.get<ApiSuccess<{ exam: ExamDto; questions: Array<{ question_id: string; order_no: number }> }>>(`/exams/${id}`);
        return response.data.data;
    },
    attachQuestions: async (id: string, payload: AttachQuestionsDto) => {
        await api.post(`/exams/${id}/questions`, payload);
    },
    detachQuestion: async (id: string, questionId: string) => {
        await api.delete(`/exams/${id}/questions/${questionId}`);
    },
    reorderQuestions: async (id: string, payload: ReorderExamQuestionsDto) => {
        const response = await api.patch<ApiSuccess<ReorderExamQuestionsResponse>>(`/exams/${id}/questions/reorder`, payload);
        return response.data.data;
    },
    publishPrecheck: async (id: string) => {
        const response = await api.get<ApiSuccess<PublishPrecheckResult>>(`/exams/${id}/publish-precheck`);
        return response.data.data;
    },
    publish: async (id: string) => {
        await api.post(`/exams/${id}/publish`);
    },
    unpublish: async (id: string) => {
        await api.post(`/exams/${id}/unpublish`);
    },
};
