import { api } from "@/lib/axios";
import type {
  ApiSuccess,
  ApiSuccessWithMeta,
  CreateTenantDto,
  PageMeta,
  TenantDto,
  TenantListQuery,
  UpdateTenantDto,
} from "@/types/api.types";

export const tenantApi = {
  async list(params: TenantListQuery) {
    const response = await api.get<ApiSuccessWithMeta<TenantDto[], PageMeta>>("/platform/tenants", {
      params,
    });
    return response.data;
  },
  async create(payload: CreateTenantDto) {
    const response = await api.post<ApiSuccess<TenantDto>>("/platform/tenants", payload);
    return response.data.data;
  },
  async update(id: string, payload: UpdateTenantDto) {
    const response = await api.patch<ApiSuccess<TenantDto>>(`/platform/tenants/${id}`, payload);
    return response.data.data;
  },
};
