import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AuthUser } from "@/types/api.types";

interface AuthState {
    user: AuthUser | null;
    accessToken: string | null;
    refreshToken: string | null;
    setSession: (payload: {
        user: AuthUser;
        accessToken: string;
        refreshToken: string;
    }) => void;
    setUser: (user: AuthUser) => void;
    clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            setSession: ({ user, accessToken, refreshToken }) =>
                set({ user, accessToken, refreshToken }),
            setUser: (user) => set({ user }),
            clearSession: () =>
                set({ user: null, accessToken: null, refreshToken: null }),
        }),
        {
            name: "xamina-auth",
        },
    ),
);
