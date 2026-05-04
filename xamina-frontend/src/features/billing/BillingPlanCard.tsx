import type { ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { motion } from "framer-motion";

import type { BillingPlanDto } from "@/types/api.types";
import { formatBillingCurrency } from "./billing.utils";

interface BillingPlanCardProps {
  plan: BillingPlanDto;
  badge?: string | null;
  action: ReactNode;
  delay?: number;
}

export function BillingPlanCard(props: BillingPlanCardProps) {
  const { plan, badge, action, delay = 0 } = props;

  // Deteksi apakan paket "Popular" (jika badge dikirim sbg "Paling Populer" dari parent, maka harus dicocokkan)
  const isPopular = badge === "Popular" || badge === "Paling Populer" || plan.label.toLowerCase().includes("pro");
  const isEnterprise = plan.label.toLowerCase().includes("enterprise");

  // Mocking features based on plan code for display purposes
  const features = [
    { text: `Up to ${plan.users_quota} Active Users`, included: true },
    { text: `${plan.ai_credits_quota} AI Credits per month`, included: true },
    { text: "Secure Lockdown Browser", included: true },
    { text: "Automated Proctoring AI", included: isPopular || isEnterprise },
    { text: "Custom Subdomain & White-label", included: isEnterprise },
    { text: "Dedicated Support Account Manager", included: isEnterprise },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative flex flex-col p-8 sm:p-10 rounded-[2rem] transition-all duration-300 ${isPopular
          ? "bg-[var(--surface-1)] border-2 border-[#ea580c] shadow-[0_12px_40px_rgba(234,88,12,0.12)] scale-[1.02] md:-translate-y-2 z-10"
          : "bg-[var(--surface-1)] border border-[var(--border)] shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 z-0"
        }`}
    >
      {isPopular && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {/* FIX WARNA: Menggunakan Hex Color solid #ea580c */}
          <div className="bg-[#ea580c] text-white text-[10px] sm:text-xs font-black tracking-[0.2em] uppercase py-2 px-5 rounded-full shadow-lg shadow-orange-900/20 whitespace-nowrap">
            Paling Populer
          </div>
        </div>
      )}

      {badge && !isPopular && (
        <div className="absolute top-6 right-6 px-3 py-1 bg-[var(--surface-2)] text-[var(--text-1)] text-[10px] font-black uppercase tracking-widest rounded-lg border border-[var(--border)]">
          {badge}
        </div>
      )}

      <div className="mb-8">
        {/* FIX WARNA: Teks judul paket popular diganti ke Hex Color */}
        <h3 className={`text-2xl font-bold tracking-tight mb-3 ${isPopular ? "text-[#ea580c]" : "text-[var(--text-0)]"}`}>
          {plan.label}
        </h3>
        <p className="text-[var(--text-2)] text-sm font-medium h-10 leading-relaxed">{plan.description}</p>
      </div>

      <div className="mb-8 pb-8 border-b border-[var(--border)]/50">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl sm:text-5xl font-black text-[var(--text-0)] tracking-tight">
            {formatBillingCurrency(plan.currency, plan.amount)}
          </span>
          {plan.amount > 0 && <span className="text-[var(--text-3)] text-sm font-medium">/bln</span>}
        </div>
      </div>

      <div className="mb-10 flex-1">
        <p className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider mb-6">
          Yang Anda Dapatkan
        </p>
        <ul className="space-y-4">
          {features.map((feat, i) => (
            <li key={i} className="flex items-start gap-3">
              {feat.included ? (
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isPopular ? "text-[#ea580c]" : "text-success"}`}>
                  <CheckCircle2 size={20} strokeWidth={2.5} />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[var(--text-3)] opacity-60">
                  <X size={20} strokeWidth={2} />
                </div>
              )}
              <span className={`text-sm font-medium leading-relaxed ${feat.included ? "text-[var(--text-0)]" : "text-[var(--text-3)] line-through opacity-70"}`}>
                {feat.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-6">
        {action}
      </div>
    </motion.div>
  );
}