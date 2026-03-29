import { api } from "@/lib/axios";
import { downloadBinaryFile } from "@/lib/file-download";
import type {
  ApiSuccess,
  ApiSuccessWithMeta,
  BillingCheckoutSessionDto,
  BillingHistoryMeta,
  BillingInvoiceDto,
  BillingPlanDto,
  BillingSummaryDto,
  ChangePlanDto,
  CreateCheckoutDto,
} from "@/types/api.types";

type BillingHistoryResponse = ApiSuccessWithMeta<BillingInvoiceDto[], BillingHistoryMeta>;

export const billingApi = {
  async listPlans() {
    const response = await api.get<ApiSuccess<BillingPlanDto[]>>("/billing/plans");
    return response.data.data;
  },
  tenant: {
    async summary() {
      const response = await api.get<ApiSuccess<BillingSummaryDto>>("/billing/summary");
      return response.data.data;
    },
    async history(params?: { page?: number; page_size?: number }) {
      const response = await api.get<BillingHistoryResponse>("/billing/history", { params });
      return response.data;
    },
    async checkout(payload: CreateCheckoutDto) {
      const response = await api.post<ApiSuccess<BillingCheckoutSessionDto>>(
        "/billing/checkout",
        payload,
      );
      return response.data.data;
    },
    async changePlan(payload: ChangePlanDto) {
      const response = await api.post<ApiSuccess<BillingCheckoutSessionDto>>(
        "/billing/change-plan",
        payload,
      );
      return response.data.data;
    },
    async downloadInvoicePdf(invoiceId: string) {
      return downloadBinaryFile(`/billing/invoices/${invoiceId}/pdf`, {
        expectedContentTypes: ["pdf", "octet-stream"],
        fallbackMimeType: "application/pdf",
      });
    },
  },
  platform: {
    async summary(tenantId: string) {
      const response = await api.get<ApiSuccess<BillingSummaryDto>>(
        `/platform/tenants/${tenantId}/billing/summary`,
      );
      return response.data.data;
    },
    async history(tenantId: string, params?: { page?: number; page_size?: number }) {
      const response = await api.get<BillingHistoryResponse>(
        `/platform/tenants/${tenantId}/billing/history`,
        { params },
      );
      return response.data;
    },
    async checkout(tenantId: string, payload: CreateCheckoutDto) {
      const response = await api.post<ApiSuccess<BillingCheckoutSessionDto>>(
        `/platform/tenants/${tenantId}/billing/checkout`,
        payload,
      );
      return response.data.data;
    },
    async changePlan(tenantId: string, payload: ChangePlanDto) {
      const response = await api.post<ApiSuccess<BillingCheckoutSessionDto>>(
        `/platform/tenants/${tenantId}/billing/change-plan`,
        payload,
      );
      return response.data.data;
    },
    async downloadInvoicePdf(tenantId: string, invoiceId: string) {
      return downloadBinaryFile(`/platform/tenants/${tenantId}/billing/invoices/${invoiceId}/pdf`, {
        expectedContentTypes: ["pdf", "octet-stream"],
        fallbackMimeType: "application/pdf",
      });
    },
  },
};
