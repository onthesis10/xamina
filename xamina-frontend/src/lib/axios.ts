import axios from "axios";

import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import type { ApiErrorResponse } from "@/types/api.types";

export interface NormalizedApiError {
    code: string;
    message: string;
    status: number | null;
    details: unknown;
    isNetworkError: boolean;
}

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1",
});

api.interceptors.request.use((config) => {
    const user = useAuthStore.getState().user;
    const token = useAuthStore.getState().accessToken;
    const selectedTenantId = useUiStore.getState().activeTenantId;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    if (user?.role === "super_admin" && selectedTenantId) {
        config.headers["X-Tenant-Id"] = selectedTenantId;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            useAuthStore.getState().clearSession();
        }
        return Promise.reject(error);
    },
);

export function normalizeApiError(error: unknown): NormalizedApiError {
    if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined;
        const responseError = responseData?.error;
        return {
            code: responseError?.code ?? "UNKNOWN",
            message: responseError?.message ?? error.message ?? "Request failed",
            status: error.response?.status ?? null,
            details: responseError?.details ?? null,
            isNetworkError: error.code === "ERR_NETWORK",
        };
    }

    if (error instanceof Error) {
        return {
            code: "UNKNOWN",
            message: error.message,
            status: null,
            details: null,
            isNetworkError: false,
        };
    }

    return {
        code: "UNKNOWN",
        message: "Unknown error",
        status: null,
        details: null,
        isNetworkError: false,
    };
}

export function errorMessageForCode(
    error: unknown,
    codeMap: Partial<Record<string, string>>,
    fallbackMessage: string,
): string {
    const normalized = normalizeApiError(error);
    if (normalized.isNetworkError) {
        return "API tidak bisa diakses. Periksa backend dan konfigurasi VITE_API_URL.";
    }
    return codeMap[normalized.code] ?? normalized.message ?? fallbackMessage;
}
