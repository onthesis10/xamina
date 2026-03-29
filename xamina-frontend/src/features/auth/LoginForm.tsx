import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { api, normalizeApiError } from "@/lib/axios";
import { useAuthStore } from "@/store/auth.store";
import type {
  ApiSuccess,
  AuthChallengeResponse,
  AuthLoginResponse,
  AuthenticatedLoginResponse,
  LoginRequest,
  ResendEmailOtpRequest,
  VerifyEmailOtpRequest,
} from "@/types/api.types";

function formatReason(reason: string) {
  switch (reason) {
    case "always_on_email_otp":
      return "Akun ini disetel selalu meminta Email OTP.";
    case "new_device_or_ip":
      return "Login terdeteksi dari device atau IP yang belum dikenal.";
    case "recent_failed_logins":
      return "Ada percobaan login gagal berulang baru-baru ini.";
    case "recent_otp_failures":
      return "Ada percobaan OTP gagal baru-baru ini.";
    default:
      return reason;
  }
}

function normalizeReasonCodes(reasonCodes: unknown) {
  if (!Array.isArray(reasonCodes)) {
    return [];
  }
  return reasonCodes.filter((reason): reason is string => typeof reason === "string");
}

export function LoginForm() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginRequest>({
    email: "admin@xamina.local",
    password: "Admin123!",
  });
  const [challenge, setChallenge] = useState<AuthChallengeResponse | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(0);

  useEffect(() => {
    if (!challenge) {
      setExpiresIn(0);
      return;
    }
    const update = () => {
      const diff = new Date(challenge.expires_at).getTime() - Date.now();
      setExpiresIn(Math.max(0, Math.ceil(diff / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiSuccess<AuthLoginResponse>>("/auth/login", form);
      return response.data.data;
    },
    onSuccess: (payload) => {
      if (payload.status === "authenticated") {
        const session = payload as AuthenticatedLoginResponse;
        setSession({
          user: session.user,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        });
        setChallenge(null);
        setOtpCode("");
        setError(null);
        void navigate({ to: "/app/dashboard" });
        return;
      }
      setChallenge(payload);
      setOtpCode("");
      setError(null);
    },
    onError: (err: unknown) => {
      const normalized = normalizeApiError(err);
      if (normalized.isNetworkError) {
        setError("API tidak bisa diakses. Jalankan backend di VITE_API_URL lalu coba lagi.");
        return;
      }
      if (normalized.status === 401) {
        setError("Email atau password salah.");
        return;
      }
      setError("Login gagal. Cek konfigurasi backend dan database.");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const payload: VerifyEmailOtpRequest = {
        challenge_token: challenge?.challenge_token ?? "",
        code: otpCode,
      };
      const response = await api.post<ApiSuccess<AuthenticatedLoginResponse>>(
        "/auth/login/verify-email-otp",
        payload,
      );
      return response.data.data;
    },
    onSuccess: (payload) => {
      setSession({
        user: payload.user,
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
      });
      setChallenge(null);
      setOtpCode("");
      setError(null);
      void navigate({ to: "/app/dashboard" });
    },
    onError: (err: unknown) => {
      const normalized = normalizeApiError(err);
      if (normalized.code === "INVALID_OTP") {
        setError("Kode OTP salah. Periksa email Anda lalu coba lagi.");
        return;
      }
      if (normalized.code === "OTP_EXPIRED") {
        setError("Kode OTP sudah kedaluwarsa. Minta resend untuk mendapatkan kode baru.");
        return;
      }
      if (normalized.code === "OTP_ATTEMPTS_EXCEEDED") {
        setError("Percobaan OTP melebihi batas. Minta challenge baru.");
        return;
      }
      if (normalized.code === "CHALLENGE_NOT_FOUND") {
        setError("Challenge login tidak ditemukan. Ulangi login dari awal.");
        setChallenge(null);
        setOtpCode("");
        return;
      }
      setError("Verifikasi OTP gagal. Coba lagi.");
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const payload: ResendEmailOtpRequest = {
        challenge_token: challenge?.challenge_token ?? "",
      };
      const response = await api.post<ApiSuccess<AuthChallengeResponse>>(
        "/auth/login/resend-email-otp",
        payload,
      );
      return response.data.data;
    },
    onSuccess: (payload) => {
      setChallenge(payload);
      setOtpCode("");
      setError(null);
    },
    onError: (err: unknown) => {
      const normalized = normalizeApiError(err);
      if (normalized.code === "OTP_RESEND_COOLDOWN") {
        setError("Resend OTP masih cooldown. Tunggu beberapa detik lalu coba lagi.");
        return;
      }
      if (normalized.code === "CHALLENGE_NOT_FOUND") {
        setError("Challenge login sudah tidak valid. Ulangi login dari awal.");
        setChallenge(null);
        return;
      }
      setError("Gagal mengirim ulang OTP.");
    },
  });

  const challengeReasons = useMemo(
    () => normalizeReasonCodes(challenge?.reason_codes).map(formatReason),
    [challenge],
  );

  const onSubmitCredentials = (event: FormEvent) => {
    event.preventDefault();
    loginMutation.mutate();
  };

  const onSubmitOtp = (event: FormEvent) => {
    event.preventDefault();
    verifyMutation.mutate();
  };

  return (
    <form
      onSubmit={challenge ? onSubmitOtp : onSubmitCredentials}
      className="auth-form card"
    >
      <p className="section-eyebrow">Secure Access</p>
      <h2 className="section-title">Login</h2>
      {!challenge ? (
        <p className="state-text">Masuk ke workspace Xamina menggunakan akun tenant Anda.</p>
      ) : (
        <p className="state-text">
          Login membutuhkan Email OTP. Periksa inbox untuk kode 6 digit yang baru dikirim.
        </p>
      )}

      {!challenge ? (
        <>
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
        </>
      ) : (
        <>
          <div className="surface-muted" style={{ marginBottom: 12 }}>
            <strong>Challenge status</strong>
            <p className="state-text">Delivery: {challenge.delivery}</p>
            <p className="state-text">Expired in: {expiresIn}s</p>
            {challengeReasons.length > 0 ? (
              <p className="state-text">Reason: {challengeReasons.join(" | ")}</p>
            ) : null}
          </div>

          <label className="form-field">
            <span className="form-label">Email OTP</span>
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input"
              inputMode="numeric"
              placeholder="6 digit code"
            />
          </label>

          <div className="row gap-sm" style={{ alignItems: "center", marginTop: 8 }}>
            <button
              type="submit"
              className="btn"
              disabled={verifyMutation.isPending || otpCode.length !== 6}
            >
              {verifyMutation.isPending ? "Verifying..." : "Verify Email OTP"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
            >
              {resendMutation.isPending ? "Resending..." : "Resend OTP"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setChallenge(null);
                setOtpCode("");
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        </>
      )}

      {error ? <p className="state-text error">{error}</p> : null}
    </form>
  );
}
