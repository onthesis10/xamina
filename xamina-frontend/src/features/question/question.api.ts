import { api } from "@/lib/axios";
import type {
    ApiSuccess,
    ApiSuccessWithMeta,
    PageMeta,
    QuestionImportCommitResponse,
    QuestionImportFormat,
    QuestionImportPreviewResponse,
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
    previewImport: async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post<ApiSuccess<QuestionImportPreviewResponse>>(
            "/questions/import/preview",
            formData,
        );
        return response.data.data;
    },
    commitImport: async (questions: QuestionImportPreviewResponse["questions"]) => {
        const response = await api.post<ApiSuccess<QuestionImportCommitResponse>>(
            "/questions/import/commit",
            {
                questions: questions.map((item) => item.question),
            },
        );
        return response.data.data;
    },
    downloadImportTemplate: async (format: QuestionImportFormat = "xlsx") => {
        const response = await api.get(`/questions/import/template.${format}`, {
            responseType: "blob",
        });
        return response.data as Blob;
    },
    uploadImage: async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post<ApiSuccess<UploadImageResponse>>("/uploads/question-image", formData);
        return response.data.data;
    },
};
