import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/axios";
import { useAuthStore } from "@/store/auth.store";
import type { ApiSuccess, LoginRequest, LoginResponse } from "@/types/api.types";

export function LoginForm() {
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState<LoginRequest>({
    email: "admin@xamina.local",
    password: "Admin123!",
  });
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiSuccess<LoginResponse>>("/auth/login", form);
      return response.data.data;
    },
    onSuccess: (payload) => {
      setSession({
        user: payload.user,
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
      });
      setError(null);
    },
    onError: (err: unknown) => {
      const maybeAxios = err as { code?: string; response?: { status?: number } };
      if (maybeAxios.code === "ERR_NETWORK") {
        setError("API tidak bisa diakses. Jalankan backend di VITE_API_URL lalu coba lagi.");
        return;
      }
      if (maybeAxios.response?.status === 401) {
        setError("Email atau password salah.");
        return;
      }
      setError("Login gagal. Cek konfigurasi backend dan database.");
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    loginMutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="auth-form card">
      <h2 className="section-title">Login</h2>
      <label className="form-field">
        <span className="form-label">Email</span>
        <input
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="input"
        />
      </label>
      <label className="form-field">
        <span className="form-label">Password</span>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          className="input"
        />
      </label>
      <button type="submit" className="btn" disabled={loginMutation.isPending}>
        {loginMutation.isPending ? "Logging in..." : "Login"}
      </button>
      {error ? <p className="state-text error">{error}</p> : null}
    </form>
  );
}
