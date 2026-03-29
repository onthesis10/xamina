import { api } from "@/lib/axios";
import type {
  ApiSuccess,
  ApiSuccessWithMeta,
  PageMeta,
  PlatformAiConfigDto,
  PlatformAnalyticsOverviewDto,
  PlatformAuditLogDto,
  PlatformAuditLogQuery,
  PlatformSystemHealthDto,
  UpdatePlatformAiConfigDto,
} from "@/types/api.types";

export const platformApi = {
  async analyticsOverview() {
    const response = await api.get<ApiSuccess<PlatformAnalyticsOverviewDto>>(
      "/platform/analytics/overview",
    );
    return response.data.data;
  },
  async systemHealth() {
    const response = await api.get<ApiSuccess<PlatformSystemHealthDto>>("/platform/system/health");
    return response.data.data;
  },
  async getAiConfig() {
    const response = await api.get<ApiSuccess<PlatformAiConfigDto>>("/platform/ai-config");
    return response.data.data;
  },
  async updateAiConfig(payload: UpdatePlatformAiConfigDto) {
    const response = await api.patch<ApiSuccess<PlatformAiConfigDto>>(
      "/platform/ai-config",
      payload,
    );
    return response.data.data;
  },
  async listAuditLogs(params: PlatformAuditLogQuery) {
    const response = await api.get<ApiSuccessWithMeta<PlatformAuditLogDto[], PageMeta>>(
      "/platform/audit-logs",
      { params },
    );
    return response.data;
  },
};
