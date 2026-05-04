import axios from "axios";
import { resolveApiBaseUrl } from "@/lib/api-base";

/**
 * Separate axios instance for public (unauthenticated) endpoints.
 * Does NOT inject Authorization headers or trigger 401 redirects.
 */
const publicApi = axios.create({
    baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_URL),
});

export interface RegisterPayload {
    tenant_name: string;
    admin_name: string;
    admin_email: string;
    admin_password: string;
}

export interface RegisterResponse {
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    admin_user_id: string;
    admin_email: string;
}

export const onboardingApi = {
    register: async (payload: RegisterPayload): Promise<RegisterResponse> => {
        const res = await publicApi.post<{ success: boolean; data: RegisterResponse }>(
            "/public/register",
            payload,
        );
        return res.data.data;
    },
};
