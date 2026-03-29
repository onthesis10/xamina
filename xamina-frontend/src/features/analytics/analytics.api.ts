import { api } from "@/lib/axios";
import { downloadBinaryFile } from "@/lib/file-download";
import type {
    ApiSuccess,
    ApiSuccessWithMeta,
    ClassResultQuery,
    DashboardStatsDto,
    ExamInsightsDto,
    ExamInsightsQuery,
    BroadcastNotificationRequest,
    BroadcastNotificationResult,
    ClassResultRow,
    CertificateDto,
    CertificateListMeta,
    DashboardSummaryDto,
    NotificationDto,
    NotificationListMeta,
    PageMeta,
    PushSubscriptionPayload,
} from "@/types/api.types";

export const analyticsApi = {
    summary: async () => {
        const response = await api.get<ApiSuccess<DashboardSummaryDto>>("/dashboard/summary");
        return response.data.data;
    },
    stats: async () => {
        const response = await api.get<ApiSuccess<DashboardStatsDto>>("/dashboard/stats");
        return response.data.data;
    },
    classResults: async (params: ClassResultQuery) => {
        const response = await api.get<ApiSuccessWithMeta<ClassResultRow[], PageMeta>>(
            "/reports/class-results",
            { params },
        );
        return response.data;
    },
    exportClassResultsCsv: async (params: ClassResultQuery) => {
        const response = await api.get("/reports/class-results/export.csv", {
            params,
            responseType: "blob",
        });
        return response.data as Blob;
    },
    examInsights: async (params: ExamInsightsQuery) => {
        const response = await api.get<ApiSuccess<ExamInsightsDto>>("/reports/exam-insights", {
            params,
        });
        return response.data.data;
    },
    exportExamInsightsExcel: async (params: ExamInsightsQuery) => {
        const response = await api.get("/reports/exam-insights/export.xlsx", {
            params,
            responseType: "blob",
        });
        return response.data as Blob;
    },
};

export const notificationApi = {
    list: async (params?: { page?: number; page_size?: number; unread_only?: boolean }) => {
        const response = await api.get<ApiSuccessWithMeta<NotificationDto[], NotificationListMeta>>(
            "/notifications",
            { params },
        );
        return response.data;
    },
    markRead: async (id: string) => {
        await api.patch<ApiSuccess<{ id: string; is_read: boolean }>>(`/notifications/${id}/read`);
    },
    markAllRead: async () => {
        await api.post<ApiSuccess<{ updated: number }>>("/notifications/read-all");
    },
    broadcast: async (payload: BroadcastNotificationRequest) => {
        const response = await api.post<ApiSuccess<BroadcastNotificationResult>>(
            "/notifications/broadcast",
            payload,
        );
        return response.data.data;
    },
    getPushPublicKey: async () => {
        const response = await api.get<ApiSuccess<{ public_key: string }>>(
            "/notifications/push/public-key",
        );
        return response.data.data.public_key;
    },
    subscribePush: async (payload: PushSubscriptionPayload) => {
        await api.post<ApiSuccess<{ id: string }>>("/notifications/push/subscribe", payload);
    },
    unsubscribePush: async (endpoint: string) => {
        await api.delete<ApiSuccess<{ deleted: number }>>("/notifications/push/subscribe", {
            data: { endpoint },
        });
    },
};

export const certificateApi = {
    listMine: async (params?: { page?: number; page_size?: number }) => {
        const response = await api.get<ApiSuccessWithMeta<CertificateDto[], CertificateListMeta>>(
            "/certificates/my",
            { params },
        );
        return response.data;
    },
    getBySubmission: async (submissionId: string) => {
        const response = await api.get<ApiSuccess<CertificateDto>>(
            `/submissions/${submissionId}/certificate`,
        );
        return response.data.data;
    },
    downloadPdf: async (certificateId: string) =>
        downloadBinaryFile(`/certificates/${certificateId}/download`, {
            expectedContentTypes: ["pdf", "octet-stream"],
            fallbackMimeType: "application/pdf",
        }),
    downloadUrl: (certificateId: string) => `/api/v1/certificates/${certificateId}/download`,
};
