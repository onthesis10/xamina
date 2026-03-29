import type { ReactNode } from "react";

import type { BillingPlanDto } from "@/types/api.types";

import { formatBillingCurrency } from "./billing.utils";

interface BillingPlanCardProps {
  plan: BillingPlanDto;
  badge?: string | null;
  action: ReactNode;
}

export function BillingPlanCard(props: BillingPlanCardProps) {
  const { plan, badge, action } = props;

  return (
    <section className="card">
      <div className="inline-actions">
        <p className="section-eyebrow">{plan.label}</p>
        {badge ? <span className="pill p-neu">{badge}</span> : null}
      </div>
      <h3 className="section-title">{formatBillingCurrency(plan.currency, plan.amount)}</h3>
      <p className="state-text">{plan.description}</p>
      <div className="stack gap-xs">
        <span className="state-text">Users quota: {plan.users_quota}</span>
        <span className="state-text">AI credits: {plan.ai_credits_quota}</span>
      </div>
      {action}
    </section>
  );
}
