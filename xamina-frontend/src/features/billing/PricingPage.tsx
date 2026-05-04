import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";

import { useAuthStore } from "@/store/auth.store";
import { XaminaLogo } from "@/components/XaminaLogo";
import { BillingPlanCard } from "./BillingPlanCard";
import { billingApi } from "./billing.api";

function pricingTargetForRole(role?: string) {
  if (role === "admin") return "/app/billing";
  if (role === "super_admin") return "/app/platform/billing";
  return "/auth/login";
}

function pricingLabelForRole(role?: string) {
  if (role === "admin") return "Kelola Billing";
  if (role === "super_admin") return "Buka Platform Billing";
  return "Mulai Sekarang";
}

// Curve animasi elegan (tidak bouncy)
const smoothEase = [0.16, 1, 0.3, 1];

export function PricingPage() {
  const user = useAuthStore((state) => state.user);
  const plansQuery = useQuery({
    queryKey: ["public-billing-plans"],
    queryFn: () => billingApi.listPlans(),
  });
  const ctaTo = pricingTargetForRole(user?.role);
  const ctaLabel = pricingLabelForRole(user?.role);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] font-sans relative overflow-hidden">
      {/* Background sengaja dibiarkan clean tanpa orb/gradient mencolok untuk kesan mahal */}

      {/* Floating Header (Clean Glassmorphism) */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 md:p-6 transition-all">
        <header className="max-w-5xl mx-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-1)]/80 backdrop-blur-md shadow-[0_2px_10px_rgb(0,0,0,0.02)] px-6 py-3.5 flex items-center justify-between">
          <Link to="/">
            <XaminaLogo variant="animated" text="Xamina Pricing" />
          </Link>
          <nav className="hidden md:flex gap-8 items-center font-medium text-[var(--text-2)] text-sm">
            <a href="/#features" className="hover:text-[var(--text-0)] transition-colors">Fitur</a>
            <Link to="/help" className="hover:text-[var(--text-0)] transition-colors">Bantuan</Link>
            <div className="w-px h-4 bg-[var(--border)]"></div>
            <Link to="/auth/login" className="hover:text-[var(--text-0)] transition-colors font-semibold">Masuk</Link>
            <Link
              to="/onboarding"
              className="bg-[var(--text-0)] text-[var(--bg-app)] px-5 py-2 rounded-xl font-semibold shadow-sm text-sm flex items-center gap-2 group hover:bg-[var(--text-1)] transition-all active:scale-[0.98]"
            >
              Coba Gratis <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </nav>
        </header>
      </div>

      <main className="relative z-10 pt-40 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center max-w-3xl mx-auto mb-20">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: smoothEase }}>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[var(--text-0)] tracking-tight leading-[1.15] mb-6">
                Investasi Cerdas untuk <br />
                {/* Fix Warna Font: Menggunakan Hex Color */}
                <span className="text-[#ea580c]">Evaluasi Berkualitas.</span>
              </h1>
              <p className="text-lg md:text-xl text-[var(--text-2)] font-medium leading-relaxed mb-10 max-w-2xl mx-auto">
                Pilih paket langganan yang sesuai dengan skala institusi pendidikan Anda. Tidak ada biaya tersembunyi, batalkan kapan saja.
              </p>

              <div className="flex flex-wrap justify-center gap-8 text-sm font-semibold text-[var(--text-1)]">
                <span className="flex items-center gap-2"><CheckCircle2 size={18} className="text-[var(--text-3)]" /> Tanpa Kartu Kredit</span>
                <span className="flex items-center gap-2"><CheckCircle2 size={18} className="text-[var(--text-3)]" /> Setup Instan 5 Menit</span>
              </div>
            </motion.div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-32 items-center">
            {plansQuery.isLoading ? (
              <div className="col-span-3 text-center py-24 bg-[var(--surface-1)] border border-[var(--border)] rounded-3xl">
                <div className="w-8 h-8 border-2 border-[var(--border-strong)] border-t-[var(--text-0)] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[var(--text-2)] text-sm font-medium">Memuat paket harga...</p>
              </div>
            ) : plansQuery.isError ? (
              <div className="col-span-3 text-center py-20 bg-danger/5 rounded-3xl border border-danger/20">
                <p className="text-danger font-medium">Gagal memuat pricing plan. Silakan coba beberapa saat lagi.</p>
              </div>
            ) : (
              (plansQuery.data ?? []).map((plan, index) => (
                <BillingPlanCard
                  key={plan.code}
                  plan={plan}
                  delay={index * 0.1}
                  badge={index === 1 ? "Paling Populer" : undefined}
                  action={
                    <Link
                      // Fix Warna Button: Menggunakan Hex Color langsung untuk background dan hover
                      className={`w-full py-3.5 mt-4 rounded-xl text-sm font-semibold text-center flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] ${index === 1
                        ? "bg-[#EA8010] text-black hover:bg-[#c2410c] shadow-md shadow-orange-900/10 hover:shadow-lg hover:-translate-y-0.5"
                        : "bg-[var(--surface-2)] text-[var(--text-0)] border border-[var(--border)] hover:bg-[var(--surface-3)] hover:-translate-y-0.5"
                        }`}
                      to={ctaTo}
                    >
                      {ctaLabel} <ArrowRight size={16} />
                    </Link>
                  }
                />
              ))
            )}
          </div>

          {/* Enterprise / Trust Section */}
          <div className="max-w-5xl mx-auto bg-[var(--surface-1)] rounded-3xl p-10 md:p-14 border border-[var(--border)] shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="absolute right-0 bottom-0 opacity-[0.03] pointer-events-none">
              <XaminaLogo variant="icon-only" style={{ transform: "scale(5) translate(-20%, -10%)" }} />
            </div>

            <div className="relative z-10 text-center md:text-left max-w-xl">
              <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-0)] tracking-tight mb-3">Butuh Kapasitas Enterprise?</h2>
              <p className="text-base text-[var(--text-2)] font-medium leading-relaxed">
                Untuk institusi pendidikan tinggi atau dinas pendidikan dengan lebih dari 10.000 siswa aktif, kami menyediakan paket khusus dengan dedicated server dan SLA 99.9%.
              </p>
            </div>

            <div className="relative z-10 shrink-0 w-full md:w-auto">
              <button className="w-full md:w-auto px-6 py-3.5 rounded-xl bg-[var(--text-0)] text-[var(--bg-app)] font-semibold text-sm shadow-sm hover:bg-[var(--text-1)] active:scale-[0.98] transition-all">
                Hubungi Tim Sales
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Minimalist Footer */}
      <footer className="bg-[var(--bg-app)] border-t border-[var(--border)] pt-16 pb-12 px-6 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <XaminaLogo variant="animated" />
          <div className="mt-8 md:mt-0 flex gap-8 text-sm font-medium text-[var(--text-2)]">
            <Link to="/help" className="hover:text-[var(--text-0)] transition-colors">Pusat Bantuan</Link>
            <Link to="/app/privacy" className="hover:text-[var(--text-0)] transition-colors">Privasi & Ketentuan</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}