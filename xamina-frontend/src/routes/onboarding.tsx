import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ArrowRight, ArrowLeft, AlertCircle, Building2, ShieldCheck, Rocket, Eye, EyeOff, ChevronDown, Check } from "lucide-react";

import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import { onboardingApi, type RegisterPayload } from "@/features/onboarding/onboarding.api";
import { XaminaLogo } from "@/components/XaminaLogo";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const smoothEase = [0.16, 1, 0.3, 1];

const EDUCATION_OPTIONS = [
  "SD / Sederajat",
  "SMP / Sederajat",
  "SMA / SMK / Sederajat",
  "Perguruan Tinggi",
  "Lembaga Kursus / Lainnya"
];

export function OnboardingRoutePage() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    tenant_name: "",
    education_level: "SMA / SMK / Sederajat",
    phone: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    admin_password_confirm: "",
  });

  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError("");
  };

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterPayload) => onboardingApi.register(payload),
    onSuccess: () => {
      toast.success("Registrasi berhasil! Silakan login dengan akun admin Anda.");
      navigate({ to: "/auth/login" });
    },
    onError: (error) => {
      setFormError(
        errorMessageForCode(
          error,
          {
            SLUG_CONFLICT: "Nama institusi sudah terdaftar. Gunakan nama yang berbeda.",
            EMAIL_CONFLICT: "Email sudah digunakan. Gunakan email yang berbeda.",
            VALIDATION_ERROR: "Data tidak valid. Periksa kembali isian Anda.",
          },
          "Gagal mendaftarkan institusi. Silakan coba lagi.",
        ),
      );
    },
  });

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (step === 1) {
      if (!form.tenant_name.trim()) {
        setFormError("Nama institusi harus diisi.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!form.admin_name.trim()) {
        setFormError("Nama lengkap harus diisi.");
        return;
      }
      if (!EMAIL_REGEX.test(form.admin_email)) {
        setFormError("Format email tidak valid.");
        return;
      }
      if (form.admin_password.length < 8) {
        setFormError("Kata sandi minimal 8 karakter.");
        return;
      }
      if (form.admin_password !== form.admin_password_confirm) {
        setFormError("Konfirmasi kata sandi tidak cocok.");
        return;
      }
      setStep(3);
      return;
    }

    registerMutation.mutate({
      tenant_name: form.tenant_name.trim(),
      admin_name: form.admin_name.trim(),
      admin_email: form.admin_email.trim().toLowerCase(),
      admin_password: form.admin_password,
    });
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setFormError("");
    }
  };

  const isLoading = registerMutation.isPending;

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col font-sans relative overflow-x-hidden selection:bg-[#ea580c]/20 selection:text-[#ea580c]">

      {/* Logo Placement: Pojok Kiri Atas tanpa Bar */}
      <div className="absolute top-6 left-6 md:top-8 md:left-8 z-50">
        <Link to="/" className="inline-block transition-transform hover:scale-105">
          <XaminaLogo variant="animated" text="Xamina" />
        </Link>
      </div>

      {/* Link Masuk: Pojok Kanan Atas */}
      <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50 hidden sm:block">
        <Link to="/auth/login" className="text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-0)] transition-colors">
          Sudah punya akun? <span className="text-[#ea580c] font-semibold hover:underline">Masuk</span>
        </Link>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12 relative z-10">
        <div className="w-full max-w-[520px] relative">

          {/* Ambient Glow Background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[#ea580c] opacity-[0.04] dark:opacity-[0.06] blur-[100px] rounded-full pointer-events-none -z-10" />

          {/* Progress Indicators */}
          <div className="flex items-center justify-center mb-8 gap-3 relative z-20">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <motion.div
                  initial={false}
                  animate={{
                    backgroundColor: step >= i ? "#ea580c" : "transparent",
                    color: step >= i ? "#ffffff" : "var(--text-3)",
                    borderColor: step >= i ? "#ea580c" : "var(--border)",
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border bg-[var(--surface-1)] transition-colors duration-300"
                >
                  {i < step ? <CheckCircle2 size={14} strokeWidth={3} /> : i}
                </motion.div>
                {i < 3 && (
                  <div className="w-10 sm:w-12 h-px bg-[var(--border)] relative overflow-hidden">
                    <motion.div
                      initial={{ x: "-100%" }}
                      animate={{ x: step > i ? "0%" : "-100%" }}
                      transition={{ duration: 0.4, ease: smoothEase }}
                      className="absolute inset-0 bg-[#ea580c]"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Main Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: smoothEase }}
            className="bg-[var(--surface-1)]/80 backdrop-blur-3xl shadow-[0_8px_40px_rgb(0,0,0,0.04),inset_0_1px_0_0_rgba(255,255,255,0.1)] border border-[var(--border)] p-8 sm:p-10 rounded-[2rem] relative z-20"
          >
            {isLoading ? (
              <div className="py-12 flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-[#ea580c] blur-xl opacity-20 rounded-full animate-pulse" />
                  <div className="w-12 h-12 relative z-10 border-4 border-[var(--border-strong)] border-t-[#ea580c] rounded-full animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-[var(--text-0)] mb-2">Menyiapkan Workspace...</h3>
                <p className="text-[var(--text-2)] text-sm font-medium max-w-xs leading-relaxed">
                  Membangun infrastruktur terisolasi untuk keamanan data institusi Anda.
                </p>
              </div>
            ) : (
              <form onSubmit={handleNext}>
                {formError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="overflow-hidden mb-6"
                  >
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-danger/5 border border-danger/20 text-danger text-sm font-medium">
                      <AlertCircle size={18} className="shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{formError}</p>
                    </div>
                  </motion.div>
                )}

                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-5">
                      <div className="mb-8 text-center sm:text-left">
                        <div className="w-12 h-12 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[#ea580c] flex items-center justify-center mb-4 mx-auto sm:mx-0 shadow-inner">
                          <Building2 size={22} strokeWidth={1.5} />
                        </div>
                        <h2 className="text-2xl font-bold text-[var(--text-0)] tracking-tight">Profil Institusi</h2>
                        <p className="text-[var(--text-2)] text-sm mt-1">Beri nama workspace untuk institusi Anda.</p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-[var(--text-1)]">Nama Institusi / Sekolah <span className="text-danger">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="Contoh: SMA Negeri 1 Jakarta"
                            className="w-full bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl py-3 px-4 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:bg-[var(--surface-2)] focus:ring-4 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)] shadow-inner"
                            value={form.tenant_name}
                            onChange={(e) => updateField("tenant_name", e.target.value)}
                            autoFocus
                          />
                        </div>

                        {/* CUSTOM DROPDOWN - MODEREN */}
                        <div className="space-y-1.5 relative">
                          <label className="text-sm font-medium text-[var(--text-1)]">Jenjang Pendidikan</label>
                          <button
                            type="button"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="w-full bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl py-3 px-4 text-left text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:bg-[var(--surface-2)] focus:ring-4 focus:ring-[#ea580c]/10 transition-all flex justify-between items-center shadow-inner"
                          >
                            <span>{form.education_level}</span>
                            <ChevronDown size={16} className={`text-[var(--text-3)] transition-transform duration-300 ${isDropdownOpen ? "rotate-180 text-[#ea580c]" : ""}`} />
                          </button>

                          <AnimatePresence>
                            {isDropdownOpen && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                                <motion.div
                                  initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scaleY: 1 }}
                                  exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
                                  transition={{ duration: 0.2, ease: "easeOut" }}
                                  className="absolute w-full mt-2 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] z-50 overflow-hidden origin-top backdrop-blur-xl"
                                >
                                  <div className="py-2">
                                    {EDUCATION_OPTIONS.map((opt) => (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => {
                                          updateField("education_level", opt);
                                          setIsDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors hover:bg-[var(--surface-2)]"
                                      >
                                        <span className={form.education_level === opt ? "text-[#ea580c] font-semibold" : "text-[var(--text-1)]"}>
                                          {opt}
                                        </span>
                                        {form.education_level === opt && <Check size={16} className="text-[#ea580c]" />}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-[var(--text-1)]">Nomor Telepon <span className="text-[var(--text-3)] font-normal">(Opsional)</span></label>
                          <input
                            type="tel"
                            placeholder="+62 812..."
                            className="w-full bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl py-3 px-4 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:bg-[var(--surface-2)] focus:ring-4 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)] shadow-inner"
                            value={form.phone}
                            onChange={(e) => updateField("phone", e.target.value)}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-5">
                      <div className="mb-8 text-center sm:text-left">
                        <div className="w-12 h-12 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[#ea580c] flex items-center justify-center mb-4 mx-auto sm:mx-0 shadow-inner">
                          <ShieldCheck size={22} strokeWidth={1.5} />
                        </div>
                        <h2 className="text-2xl font-bold text-[var(--text-0)] tracking-tight">Akun Super Admin</h2>
                        <p className="text-[var(--text-2)] text-sm mt-1">Akun ini memiliki hak akses penuh ke sistem.</p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-[var(--text-1)]">Nama Lengkap <span className="text-danger">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="John Doe"
                            className="w-full bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl py-3 px-4 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:bg-[var(--surface-2)] focus:ring-4 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)] shadow-inner"
                            value={form.admin_name}
                            onChange={(e) => updateField("admin_name", e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-[var(--text-1)]">Alamat Email <span className="text-danger">*</span></label>
                          <input
                            type="email"
                            required
                            placeholder="admin@institusi.sch.id"
                            className="w-full bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl py-3 px-4 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:bg-[var(--surface-2)] focus:ring-4 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)] shadow-inner"
                            value={form.admin_email}
                            onChange={(e) => updateField("admin_email", e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5 relative">
                            <label className="text-sm font-medium text-[var(--text-1)]">Kata Sandi <span className="text-danger">*</span></label>
                            <div className="relative group">
                              <input
                                type={showPassword ? "text" : "password"}
                                required
                                placeholder="Min. 8 karakter"
                                className="w-full bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl py-3 pl-4 pr-10 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:bg-[var(--surface-2)] focus:ring-4 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)] shadow-inner"
                                minLength={8}
                                value={form.admin_password}
                                onChange={(e) => updateField("admin_password", e.target.value)}
                              />
                              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] group-focus-within:text-[#ea580c] hover:text-[var(--text-1)] transition-colors focus:outline-none" tabIndex={-1}>
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5 relative">
                            <label className="text-sm font-medium text-[var(--text-1)]">Ulangi Sandi <span className="text-danger">*</span></label>
                            <div className="relative group">
                              <input
                                type={showConfirmPassword ? "text" : "password"}
                                required
                                placeholder="Ketik ulang"
                                className="w-full bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl py-3 pl-4 pr-10 text-[var(--text-0)] text-sm outline-none focus:border-[#ea580c] focus:bg-[var(--surface-2)] focus:ring-4 focus:ring-[#ea580c]/10 transition-all placeholder:text-[var(--text-3)] shadow-inner"
                                minLength={8}
                                value={form.admin_password_confirm}
                                onChange={(e) => updateField("admin_password_confirm", e.target.value)}
                              />
                              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] group-focus-within:text-[#ea580c] hover:text-[var(--text-1)] transition-colors focus:outline-none" tabIndex={-1}>
                                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="space-y-5 text-center py-2">
                      <div className="relative inline-block mb-4">
                        <div className="absolute inset-0 bg-[#ea580c] rounded-full blur-xl opacity-20" />
                        <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-[#ea580c] flex items-center justify-center relative z-10 shadow-inner">
                          <Rocket size={28} strokeWidth={1.5} />
                        </div>
                      </div>
                      <h2 className="text-2xl font-bold text-[var(--text-0)] tracking-tight mb-2">Satu Langkah Lagi!</h2>
                      <p className="text-[var(--text-2)] text-sm max-w-[280px] mx-auto leading-relaxed">
                        Anda akan membuat workspace Xamina untuk <span className="font-semibold text-[var(--text-0)]">{form.tenant_name}</span>.
                      </p>

                      <div className="bg-[var(--surface-2)]/50 rounded-xl p-4 text-left border border-[var(--border)] max-w-sm mx-auto mt-6 shadow-inner">
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] uppercase font-semibold text-[var(--text-3)] tracking-wider mb-0.5">Super Admin</p>
                            <p className="font-medium text-[var(--text-0)] text-sm">{form.admin_name}</p>
                          </div>
                          <div className="h-px bg-[var(--border)] w-full" />
                          <div>
                            <p className="text-[10px] uppercase font-semibold text-[var(--text-3)] tracking-wider mb-0.5">Email Login</p>
                            <p className="font-medium text-[var(--text-0)] text-sm break-all">{form.admin_email}</p>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-[var(--text-3)] mt-6">
                        Dengan melanjutkan, Anda menyetujui <a href="#" className="underline hover:text-[#ea580c] transition-colors">Syarat Ketentuan</a> dan <a href="#" className="underline hover:text-[#ea580c] transition-colors">Kebijakan Privasi</a>.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-8 flex gap-3">
                  {step > 1 && (
                    <button type="button" onClick={handleBack} className="px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center active:scale-[0.98]">
                      <ArrowLeft size={18} />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex-1 relative overflow-hidden bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(234,88,12,0.39),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_6px_20px_rgba(234,88,12,0.23),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    disabled={isLoading}
                  >
                    {step === 3 ? "Buat Workspace" : "Lanjutkan"}
                    {step < 3 && <ArrowRight size={16} />}
                  </button>
                </div>
              </form>
            )}
          </motion.div>

          {/* Link Masuk untuk layar Mobile (Hanya muncul di Mobile) */}
          <div className="text-center mt-8 sm:hidden">
            <Link to="/auth/login" className="text-sm font-medium text-[var(--text-2)] hover:text-[var(--text-0)] transition-colors">
              Sudah punya akun? <span className="text-[#ea580c] font-semibold hover:underline">Masuk</span>
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}