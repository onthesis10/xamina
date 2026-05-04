import { api } from "@/lib/axios";
import type {
    ApiSuccess,
    ApiSuccessWithMeta,
    PageMeta,
    QuestionDto,
    QuestionListQuery,
    CreateQuestionDto,
    UpdateQuestionDto,
    QuestionImportPreviewResponse,
    QuestionImportCommitResponse,
    QuestionImportFormat,
    UploadImageResponse,
} from "@/types/api.types";

/* ── Extended types for v2 ── */
export interface MediaAttachment {
    url: string;
    media_type: "image" | "audio" | "video";
    file_name: string;
    file_size: number;
}

export type QuestionStatus = "draft" | "review" | "published" | "archived";

export interface QuestionV2Dto extends QuestionDto {
    media_urls: MediaAttachment[];
    status: QuestionStatus;
    tags: string[];
    ai_metadata: Record<string, unknown> | null;
}

export interface PresignRequest {
    file_name: string;
    content_type: string;
    file_size: number;
}

export interface PresignResponse {
    upload_url: string;
    object_key: string;
    public_url: string;
    expires_in: number;
}

export interface ConfirmUploadRequest {
    object_key: string;
    question_id?: string;
}

export interface DraftPatch {
    content?: string;
    options_jsonb?: unknown;
    answer_key?: unknown;
    topic?: string;
    difficulty?: string;
    tags?: string[];
    media_urls?: MediaAttachment[];
    status?: QuestionStatus;
}

export interface AiGenerateRequest {
    prompt: string;
    count?: number;
    question_type?: string;
    difficulty?: string;
    topic?: string;
    attachments?: string[]; // presigned URLs of uploaded media
}

export const questionBankApi = {
    /* ── Core CRUD (delegates to existing endpoints) ── */
    list: async (params: QuestionListQuery) => {
        const response = await api.get<ApiSuccessWithMeta<QuestionV2Dto[], PageMeta>>("/questions", { params });
        return response.data;
    },
    get: async (id: string) => {
        const response = await api.get<ApiSuccess<QuestionV2Dto>>(`/questions/${id}`);
        return response.data.data;
    },
    create: async (payload: CreateQuestionDto) => {
        const response = await api.post<ApiSuccess<QuestionV2Dto>>("/questions", payload);
        return response.data.data;
    },
    update: async (id: string, payload: UpdateQuestionDto) => {
        const response = await api.patch<ApiSuccess<QuestionV2Dto>>(`/questions/${id}`, payload);
        return response.data.data;
    },
    remove: async (id: string) => {
        await api.delete(`/questions/${id}`);
    },
    bulkDelete: async (ids: string[]) => {
        await api.post("/questions/bulk-delete", { ids });
    },

    /* ── Import (passthrough) ── */
    previewImport: async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post<ApiSuccess<QuestionImportPreviewResponse>>("/questions/import/preview", formData);
        return response.data.data;
    },
    commitImport: async (questions: QuestionImportPreviewResponse["questions"]) => {
        const response = await api.post<ApiSuccess<QuestionImportCommitResponse>>("/questions/import/commit", {
            questions: questions.map((item) => item.question),
        });
        return response.data.data;
    },
    downloadImportTemplate: async (format: QuestionImportFormat = "xlsx") => {
        const response = await api.get(`/questions/import/template.${format}`, { responseType: "blob" });
        return response.data as Blob;
    },

    /* ── Legacy upload (fallback until presigned URLs land) ── */
    uploadImage: async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post<ApiSuccess<UploadImageResponse>>("/uploads/question-image", formData);
        return response.data.data;
    },

    /* ── Presigned URL flow (Phase 1, once backend is ready) ── */
    requestPresign: async (req: PresignRequest): Promise<PresignResponse> => {
        const response = await api.post<ApiSuccess<PresignResponse>>("/uploads/presign", req);
        return response.data.data;
    },
    confirmUpload: async (req: ConfirmUploadRequest) => {
        const response = await api.post<ApiSuccess<{ public_url: string; confirmed: boolean }>>("/uploads/confirm", req);
        return response.data.data;
    },
    uploadToPresignedUrl: async (url: string, file: File, onProgress?: (pct: number) => void): Promise<void> => {
        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", url, true);
            xhr.setRequestHeader("Content-Type", file.type);
            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                };
            }
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
            xhr.onerror = () => reject(new Error("Upload network error"));
            xhr.send(file);
        });
    },

    /* ── Draft auto-save ── */
    saveDraft: async (id: string, patch: DraftPatch) => {
        const response = await api.patch<ApiSuccess<QuestionV2Dto>>(`/questions/${id}`, patch);
        return response.data.data;
    },
};
