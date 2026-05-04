import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, KeyRound, AlertCircle, ArrowRight, ShieldCheck, Zap, Eye, EyeOff } from "lucide-react";

import { api, normalizeApiError } from "@/lib/axios";
import { useAuthStore } from "@/store/auth.store";
import { XaminaLogo } from "@/components/XaminaLogo";
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

const smoothEase = [0.16, 1, 0.3, 1];

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

  const [showPassword, setShowPassword] = useState(false);

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
        setError("Email atau password salah. Silakan periksa kembali kredensial Anda.");
        return;
      }
      setError("Login gagal. Terjadi kesalahan pada server. Silakan coba beberapa saat lagi.");
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
    setError(null);
    loginMutation.mutate();
  };

  const onSubmitOtp = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    verifyMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex font-sans overflow-hidden">
      {/* Left Panel - Branding (Minimalist & Clean) */}
      <div className="hidden lg:flex flex-col flex-1 bg-[var(--surface-1)] border-r border-[var(--border)] p-14">
        <Link to="/" className="w-fit mb-auto">
          <XaminaLogo variant="animated" text="Xamina" />
        </Link>

        <div className="max-w-xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: smoothEase }}>
            <h1 className="text-4xl xl:text-5xl font-bold text-[var(--text-0)] tracking-tight leading-tight mb-6">
              Manajemen ujian dalam skala besar, disederhanakan.
            </h1>
            <p className="text-[var(--text-2)] font-medium leading-relaxed mb-12 max-w-md">
              Infrastruktur multi-tenant yang stabil dengan proctoring cerdas untuk integritas akademik institusi Anda.
            </p>

            <div className="space-y-3">
              {[
                { icon: ShieldCheck, text: "Lockdown Browser Keamanan Tinggi" },
                { icon: Zap, text: "Performa Optimal Bebas Downtime" },
                { icon: KeyRound, text: "Autentikasi Terenkripsi & OTP" }
              ].map((feat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + (i * 0.1), duration: 0.5, ease: smoothEase }}
                  className="flex items-center gap-4 py-3 text-[var(--text-1)]"
                >
                  <div className="text-[var(--text-3)]">
                    <feat.icon size={20} strokeWidth={2} />
                  </div>
                  <span className="font-medium text-sm">{feat.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="mt-auto flex items-center gap-8 text-xs font-semibold text-[var(--text-3)] pt-12">
          <Link to="/help" className="hover:text-[var(--text-0)] transition-colors">Bantuan</Link>
          <Link to="/app/privacy" className="hover:text-[var(--text-0)] transition-colors">Privasi</Link>
          <Link to="/pricing" className="hover:text-[var(--text-0)] transition-colors">Harga</Link>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 relative bg-[var(--bg-app)]">
        <div className="w-full max-w-[420px]">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-10 flex justify-center">
            <Link to="/">
              <XaminaLogo variant="animated" text="Xamina" />
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: smoothEase }}
            className="bg-[var(--surface-1)] p-8 sm:p-10 rounded-3xl border border-[var(--border)] shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          >
            <AnimatePresence mode="wait">
              {!challenge ? (
                <motion.form
                  key="credentials-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.3, ease: smoothEase }}
                  onSubmit={onSubmitCredentials}
                  className="space-y-6"
                >
                  <div className="mb-8 text-center sm:text-left">
                    <h2 className="text-2xl font-bold text-[var(--text-0)] tracking-tight mb-2">Selamat Datang</h2>
                    <p className="text-[var(--text-2)] text-sm">
                      Silakan masuk ke akun institusi Anda.
                    </p>
                  </div>

                  {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden mb-4">
                      <div className="p-4 rounded-xl bg-danger/5 border border-danger/20 flex items-start gap-3 text-danger text-sm font-medium">
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{error}</p>
                      </div>
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-[var(--text-1)]">Email</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-3)] group-focus-within:text-[#ea580c] transition-colors" size={18} />
                        <input
                          type="email"
                          required
                          placeholder="admin@sekolah.sch.id"
                          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)]"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-[var(--text-1)]">Kata Sandi</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-3)] group-focus-within:text-[#ea580c] transition-colors" size={18} />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="••••••••"
                          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-12 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)]"
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors focus:outline-none"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 rounded border-[var(--border)] text-[#ea580c] focus:ring-[#ea580c]/30 accent-[#ea580c] cursor-pointer" />
                      <span className="text-sm font-medium text-[var(--text-2)] group-hover:text-[var(--text-1)] transition-colors">Ingat saya</span>
                    </label>
                    <a href="#" className="text-sm font-medium text-[#ea580c] hover:text-[#c2410c] hover:underline transition-colors">Lupa sandi?</a>
                  </div>

                  {/* Tombol Login Sudah Diperbaiki Menggunakan Hex Color */}
                  <button
                    type="submit"
                    className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-medium text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2 shadow-md shadow-orange-900/10"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Memproses...
                      </span>
                    ) : (
                      "Masuk"
                    )}
                  </button>

                  <div className="text-center pt-6 mt-6 border-t border-[var(--border)]">
                    <p className="text-sm text-[var(--text-2)]">
                      Belum memiliki akses tenant? <Link to="/onboarding" className="text-[var(--text-0)] font-medium hover:underline">Hubungi kami</Link>
                    </p>
                  </div>
                </motion.form>
              ) : (
                <motion.form
                  key="otp-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: smoothEase }}
                  onSubmit={onSubmitOtp}
                  className="space-y-6"
                >
                  <div className="mb-6 relative text-center sm:text-left">
                    <button
                      type="button"
                      onClick={() => {
                        setChallenge(null);
                        setOtpCode("");
                        setError(null);
                      }}
                      className="absolute right-0 top-0 w-8 h-8 rounded-full bg-[var(--surface-2)] hover:bg-[var(--border)] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text-0)] transition-colors"
                    >
                      <ArrowRight size={16} className="rotate-180" />
                    </button>
                    <div className="w-12 h-12 rounded-xl bg-info/10 text-info flex items-center justify-center mb-5 mx-auto sm:mx-0">
                      <ShieldCheck size={24} />
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--text-0)] tracking-tight mb-2 pr-10">Verifikasi OTP</h2>
                    <p className="text-[var(--text-2)] text-sm leading-relaxed">
                      Kode keamanan 6 digit telah dikirimkan ke email <br className="hidden sm:block" />
                      <strong className="text-[var(--text-0)] font-medium">{challenge.delivery}</strong>
                    </p>
                  </div>

                  {challengeReasons.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/20 text-warning text-xs font-medium mb-6">
                      <span className="block mb-1 opacity-80">Alasan Tantangan:</span>
                      {challengeReasons.join(" | ")}
                    </div>
                  )}

                  {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden mb-4">
                      <div className="p-4 rounded-xl bg-danger/5 border border-danger/20 flex items-start gap-3 text-danger text-sm font-medium">
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{error}</p>
                      </div>
                    </motion.div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--text-1)] flex justify-between items-center">
                      <span>Kode Verifikasi</span>
                      <span className={`text-xs ${expiresIn < 60 ? "text-danger font-medium" : "text-[var(--text-3)]"}`}>
                        0:{expiresIn.toString().padStart(2, '0')}
                      </span>
                    </label>
                    <input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl py-3.5 text-center text-[var(--text-0)] font-bold text-2xl tracking-[0.5em] outline-none focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--border-strong)] placeholder:tracking-normal placeholder:font-normal"
                      inputMode="numeric"
                      placeholder="------"
                      autoFocus
                    />
                  </div>

                  {/* Tombol Verifikasi OTP Juga Diperbaiki */}
                  <button
                    type="submit"
                    className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-medium text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4 shadow-md shadow-orange-900/10"
                    disabled={verifyMutation.isPending || otpCode.length !== 6}
                  >
                    {verifyMutation.isPending ? "Memverifikasi..." : "Verifikasi"}
                  </button>

                  <div className="text-center pt-4">
                    <p className="text-sm text-[var(--text-2)]">
                      Belum menerima kode?{" "}
                      <button
                        type="button"
                        onClick={() => resendMutation.mutate()}
                        disabled={resendMutation.isPending || expiresIn > 270}
                        className="text-[var(--text-0)] font-medium hover:underline transition-colors disabled:opacity-50 disabled:no-underline"
                      >
                        {resendMutation.isPending ? "Mengirim..." : "Kirim Ulang"}
                      </button>
                    </p>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}