import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { StatCard } from "@/components/StatCard";
import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";

import { platformApi } from "./platform.api";

type TrendRow = {
  id: string;
  day: string;
  submissions: number;
  ai_requests: number;
  paid_invoices: number;
};

type TenantRow = {
  id: string;
  tenant_name: string;
  plan: string;
  users_count: number;
  exams_count: number;
  submissions_count: number;
  ai_requests_30d: number;
  mrr: number;
  last_activity_at: string;
};

export function PlatformConsolePanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const analyticsQuery = useQuery({
    queryKey: ["platform-analytics-overview"],
    queryFn: () => platformApi.analyticsOverview(),
    refetchInterval: 30_000,
  });
  const systemHealthQuery = useQuery({
    queryKey: ["platform-system-health"],
    queryFn: () => platformApi.systemHealth(),
    refetchInterval: 20_000,
  });
  const aiConfigQuery = useQuery({
    queryKey: ["platform-ai-config"],
    queryFn: () => platformApi.getAiConfig(),
  });

  const [form, setForm] = useState({
    preferred_provider: "auto" as "auto" | "openai" | "groq",
    openai_model: "gpt-4o-mini",
    groq_model: "llama-3.1-8b-instant",
    ai_mock_mode: false,
    generate_rate_limit_per_min: 12,
    grade_rate_limit_per_min: 30,
    extract_rate_limit_per_min: 10,
  });

  useEffect(() => {
    if (!aiConfigQuery.data) return;
    setForm({
      preferred_provider: aiConfigQuery.data.preferred_provider,
      openai_model: aiConfigQuery.data.openai_model,
      groq_model: aiConfigQuery.data.groq_model,
      ai_mock_mode: aiConfigQuery.data.ai_mock_mode,
      generate_rate_limit_per_min: aiConfigQuery.data.generate_rate_limit_per_min,
      grade_rate_limit_per_min: aiConfigQuery.data.grade_rate_limit_per_min,
      extract_rate_limit_per_min: aiConfigQuery.data.extract_rate_limit_per_min,
    });
  }, [aiConfigQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () => platformApi.updateAiConfig(form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["platform-ai-config"] });
      await qc.invalidateQueries({ queryKey: ["platform-audit-logs"] });
      toast.success("Platform AI config berhasil disimpan.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal menyimpan AI config."));
    },
  });

  const trendRows = useMemo<TrendRow[]>(
    () =>
      (analyticsQuery.data?.trend_14d ?? []).map((row) => ({
        id: row.day,
        day: row.day,
        submissions: row.submissions,
        ai_requests: row.ai_requests,
        paid_invoices: row.paid_invoices,
      })),
    [analyticsQuery.data?.trend_14d],
  );

  const tenantRows = useMemo<TenantRow[]>(
    () =>
      (analyticsQuery.data?.top_tenants ?? []).map((row) => ({
        id: row.tenant_id,
        tenant_name: row.tenant_name,
        plan: row.plan,
        users_count: row.users_count,
        exams_count: row.exams_count,
        submissions_count: row.submissions_count,
        ai_requests_30d: row.ai_requests_30d,
        mrr: row.mrr,
        last_activity_at: row.last_activity_at,
      })),
    [analyticsQuery.data?.top_tenants],
  );

  const totals = analyticsQuery.data?.totals;
  const health = systemHealthQuery.data;

  return (
    <section className="panel-grid">
      <section className="card">
        <p className="section-eyebrow">Platform Console</p>
        <h2 className="section-title">Cross-Tenant Analytics & Runtime Health</h2>
        <p className="state-text">
          Monitor performa global tenant, status infrastruktur runtime, dan konfigurasi AI platform
          dari satu panel super admin.
        </p>
      </section>

      <section className="metric-grid">
        <StatCard label="Tenants" value={totals?.tenants_total ?? "-"} caption="Total tenant terdaftar" />
        <StatCard
          label="Active Tenants"
          value={totals?.active_tenants_total ?? "-"}
          caption="Tenant aktif"
          accent="success"
        />
        <StatCard label="Users" value={totals?.users_total ?? "-"} caption="Akun lintas tenant" accent="info" />
        <StatCard
          label="MRR Active"
          value={totals ? `IDR ${totals.active_mrr_total.toLocaleString("id-ID")}` : "-"}
          caption="Total recurring billing aktif"
          accent="teal"
        />
      </section>

      <section className="metric-grid">
        <StatCard
          label="Submissions"
          value={totals?.submissions_total ?? "-"}
          caption="Total submission global"
        />
        <StatCard label="AI Requests" value={totals?.ai_requests_total ?? "-"} caption="Total request AI global" />
        <StatCard
          label="Pending Invoices"
          value={totals?.pending_invoices_total ?? "-"}
          caption="Invoice butuh tindak lanjut"
          accent="warning"
        />
        <StatCard
          label="Runtime Uptime"
          value={health ? `${Math.floor(health.uptime_seconds / 60)}m` : "-"}
          caption={`Provider billing: ${health?.billing_provider ?? "-"}`}
        />
      </section>

      <DataTable
        title="Trend 14 Hari"
        loading={analyticsQuery.isLoading}
        error={analyticsQuery.isError ? errorMessageForCode(analyticsQuery.error, {}, "Gagal memuat trend platform.") : null}
        columns={[
          { key: "day", header: "Day", render: (row: TrendRow) => <span className="text-mono">{row.day}</span> },
          { key: "submissions", header: "Submissions", render: (row: TrendRow) => row.submissions },
          { key: "ai_requests", header: "AI Requests", render: (row: TrendRow) => row.ai_requests },
          { key: "paid_invoices", header: "Paid Invoices", render: (row: TrendRow) => row.paid_invoices },
        ]}
        rows={trendRows}
      />

      <DataTable
        title="Top Tenants Snapshot"
        loading={analyticsQuery.isLoading}
        error={analyticsQuery.isError ? errorMessageForCode(analyticsQuery.error, {}, "Gagal memuat top tenants.") : null}
        columns={[
          { key: "tenant", header: "Tenant", render: (row: TenantRow) => row.tenant_name },
          { key: "plan", header: "Plan", render: (row: TenantRow) => <span className="pill p-neu">{row.plan}</span> },
          { key: "users", header: "Users", render: (row: TenantRow) => row.users_count },
          { key: "submissions", header: "Submissions", render: (row: TenantRow) => row.submissions_count },
          { key: "ai", header: "AI 30d", render: (row: TenantRow) => row.ai_requests_30d },
          {
            key: "mrr",
            header: "MRR",
            render: (row: TenantRow) => `IDR ${row.mrr.toLocaleString("id-ID")}`,
          },
          {
            key: "activity",
            header: "Last Activity",
            render: (row: TenantRow) =>
              new Date(row.last_activity_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }),
          },
        ]}
        rows={tenantRows}
      />

      <section className="card">
        <p className="section-eyebrow">Runtime Health</p>
        <h3 className="section-title-sm">Dependency & Queue Summary</h3>
        <div className="grid-3">
          <div className="surface-muted">
            <strong>Database</strong>
            <p className={`state-text ${health?.db.healthy ? "" : "error"}`}>
              {health?.db.healthy ? "Healthy" : "Unhealthy"}
            </p>
            <p className="state-text">{health?.db.detail ?? "-"}</p>
          </div>
          <div className="surface-muted">
            <strong>Redis</strong>
            <p className={`state-text ${health?.redis.healthy ? "" : "error"}`}>
              {health?.redis.healthy ? "Healthy" : "Unhealthy"}
            </p>
            <p className="state-text">{health?.redis.detail ?? "-"}</p>
          </div>
          <div className="surface-muted">
            <strong>Queue Backlog</strong>
            <p className="state-text">Email: {health?.queue_backlog.email_jobs ?? "-"}</p>
            <p className="state-text">Push: {health?.queue_backlog.push_jobs ?? "-"}</p>
            <p className="state-text">Billing: {health?.queue_backlog.billing_retries ?? "-"}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <p className="section-eyebrow">AI Platform Config</p>
        <h3 className="section-title-sm">Global AI Control</h3>
        <div className="grid-3">
          <FormField label="Preferred Provider">
            <select
              className="input"
              value={form.preferred_provider}
              onChange={(e) =>
                setForm((value) => ({
                  ...value,
                  preferred_provider: e.target.value as "auto" | "openai" | "groq",
                }))
              }
            >
              <option value="auto">auto</option>
              <option value="openai">openai</option>
              <option value="groq">groq</option>
            </select>
          </FormField>
          <FormField label="OpenAI Model">
            <input
              className="input"
              value={form.openai_model}
              onChange={(e) => setForm((value) => ({ ...value, openai_model: e.target.value }))}
            />
          </FormField>
          <FormField label="Groq Model">
            <input
              className="input"
              value={form.groq_model}
              onChange={(e) => setForm((value) => ({ ...value, groq_model: e.target.value }))}
            />
          </FormField>
          <FormField label="Generate Rate Limit / min">
            <input
              className="input"
              type="number"
              min={1}
              value={form.generate_rate_limit_per_min}
              onChange={(e) =>
                setForm((value) => ({ ...value, generate_rate_limit_per_min: Number(e.target.value || 1) }))
              }
            />
          </FormField>
          <FormField label="Grade Rate Limit / min">
            <input
              className="input"
              type="number"
              min={1}
              value={form.grade_rate_limit_per_min}
              onChange={(e) =>
                setForm((value) => ({ ...value, grade_rate_limit_per_min: Number(e.target.value || 1) }))
              }
            />
          </FormField>
          <FormField label="Extract Rate Limit / min">
            <input
              className="input"
              type="number"
              min={1}
              value={form.extract_rate_limit_per_min}
              onChange={(e) =>
                setForm((value) => ({ ...value, extract_rate_limit_per_min: Number(e.target.value || 1) }))
              }
            />
          </FormField>
        </div>
        <label className="inline-actions" style={{ marginTop: 12 }}>
          <input
            className="checkbox"
            type="checkbox"
            checked={form.ai_mock_mode}
            onChange={(e) => setForm((value) => ({ ...value, ai_mock_mode: e.target.checked }))}
          />
          <span>Enable AI mock mode</span>
        </label>
        <div className="inline-actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Menyimpan..." : "Simpan Config"}
          </button>
          {aiConfigQuery.data?.updated_at ? (
            <p className="state-text">
              Terakhir update:{" "}
              {new Date(aiConfigQuery.data.updated_at).toLocaleString("id-ID", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
