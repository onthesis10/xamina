import { api } from "@/lib/axios";
import type {
  AccountDeletionRequestDto,
  ApiSuccess,
  CreateAccountDeletionRequestDto,
  PrivacyExportDto,
  SecuritySettingsDto,
  UpdateSecuritySettingsDto,
} from "@/types/api.types";

export const privacyApi = {
  exportMyData: async () => {
    const response = await api.get<ApiSuccess<PrivacyExportDto>>("/auth/privacy/export");
    return response.data.data;
  },
  getDeletionRequest: async () => {
    const response = await api.get<ApiSuccess<AccountDeletionRequestDto | null>>(
      "/auth/privacy/delete-request",
    );
    return response.data.data;
  },
  createDeletionRequest: async (payload: CreateAccountDeletionRequestDto) => {
    const response = await api.post<ApiSuccess<AccountDeletionRequestDto>>(
      "/auth/privacy/delete-request",
      payload,
    );
    return response.data.data;
  },
  getSecuritySettings: async () => {
    const response = await api.get<ApiSuccess<SecuritySettingsDto>>(
      "/auth/privacy/security-settings",
    );
    return response.data.data;
  },
  updateSecuritySettings: async (payload: UpdateSecuritySettingsDto) => {
    const response = await api.patch<ApiSuccess<SecuritySettingsDto>>(
      "/auth/privacy/security-settings",
      payload,
    );
    return response.data.data;
  },
};
