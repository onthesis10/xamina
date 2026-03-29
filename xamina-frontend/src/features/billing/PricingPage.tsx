import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/store/auth.store";

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
  return "Masuk untuk Checkout";
}

export function PricingPage() {
  const user = useAuthStore((state) => state.user);
  const plansQuery = useQuery({
    queryKey: ["public-billing-plans"],
    queryFn: () => billingApi.listPlans(),
  });
  const ctaTo = pricingTargetForRole(user?.role);
  const ctaLabel = pricingLabelForRole(user?.role);

  return (
    <main className="landing">
      <div className="landing-card" style={{ maxWidth: 1200 }}>
        <p className="section-eyebrow">Pricing</p>
        <h1 className="landing-title">Pilih plan Xamina yang sesuai untuk skala sekolah Anda.</h1>
        <p className="state-text">
          Halaman ini hanya untuk discovery plan. Checkout tetap dibuat dari dashboard billing oleh
          admin tenant yang sudah login.
        </p>
        <div className="landing-actions">
          <Link className="btn" to={ctaTo}>
            {ctaLabel}
          </Link>
          <Link className="btn btn-ghost" to="/auth/login">
            Masuk
          </Link>
        </div>

        <section className="grid-3" style={{ width: "100%", marginTop: 24 }}>
          {(plansQuery.data ?? []).map((plan) => (
            <BillingPlanCard
              key={plan.code}
              plan={plan}
              action={
                <Link className="btn" to={ctaTo}>
                  {ctaLabel}
                </Link>
              }
            />
          ))}
        </section>

        {plansQuery.isLoading ? <p className="state-text">Memuat pricing plan...</p> : null}
        {plansQuery.isError ? (
          <p className="state-text error">Gagal memuat pricing plan publik.</p>
        ) : null}
      </div>
    </main>
  );
}
