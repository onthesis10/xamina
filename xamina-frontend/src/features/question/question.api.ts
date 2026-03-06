import { api } from "@/lib/axios";
import type {
    ApiSuccess,
    ApiSuccessWithMeta,
    PageMeta,
    QuestionBulkDeleteDto,
    QuestionDto,
    QuestionListQuery,
    UploadImageResponse,
    CreateQuestionDto,
    UpdateQuestionDto,
} from "@/types/api.types";

export const questionApi = {
    list: async (params: QuestionListQuery) => {
        const response = await api.get<ApiSuccessWithMeta<QuestionDto[], PageMeta>>("/questions", { params });
        return response.data;
    },
    create: async (payload: CreateQuestionDto) => {
        const response = await api.post<ApiSuccess<QuestionDto>>("/questions", payload);
        return response.data.data;
    },
    update: async (id: string, payload: UpdateQuestionDto) => {
        const response = await api.patch<ApiSuccess<QuestionDto>>(`/questions/${id}`, payload);
        return response.data.data;
    },
    remove: async (id: string) => {
        await api.delete(`/questions/${id}`);
    },
    bulkDelete: async (payload: QuestionBulkDeleteDto) => {
        await api.post("/questions/bulk-delete", payload);
    },
    uploadImage: async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post<ApiSuccess<UploadImageResponse>>("/uploads/question-image", formData);
        return response.data.data;
    },
};
