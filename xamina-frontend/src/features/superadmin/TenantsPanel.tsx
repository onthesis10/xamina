import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { errorMessageForCode } from "@/lib/axios";
import { useToast } from "@/store/toast.store";
import { useUiStore } from "@/store/ui.store";
import type { TenantDto, TenantListQuery } from "@/types/api.types";

import { tenantApi } from "./tenant.api";

const EMPTY_FORM = {
  name: "",
  slug: "",
  plan: "starter",
  users_quota: 500,
  ai_credits_quota: 200,
};

export function TenantsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const activeTenantId = useUiStore((s) => s.activeTenantId);
  const setActiveTenantId = useUiStore((s) => s.setActiveTenantId);

  const [query, setQuery] = useState<TenantListQuery>({ page: 1, page_size: 20, search: "" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<TenantDto | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [latestCreatedTenantId, setLatestCreatedTenantId] = useState<string | null>(null);

  const tenantsQuery = useQuery({
    queryKey: ["platform-tenants", query],
    queryFn: () => tenantApi.list(query),
  });

  const createMutation = useMutation({
    mutationFn: () => tenantApi.create(form),
    onSuccess: async (created) => {
      setForm(EMPTY_FORM);
      setActiveTenantId(created.id);
      setLatestCreatedTenantId(created.id);
      await qc.invalidateQueries({ queryKey: ["platform-tenants"] });
      setWizardStep(1);
      toast.success("Tenant berhasil dibuat.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal membuat tenant."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: Partial<TenantDto> }) => tenantApi.update(payload.id, payload.data),
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["platform-tenants"] });
      toast.success("Tenant berhasil diperbarui.");
    },
    onError: (error) => {
      toast.error(errorMessageForCode(error, {}, "Gagal memperbarui tenant."));
    },
  });

  const rows = tenantsQuery.data?.data ?? [];
  const meta = tenantsQuery.data?.meta;

  const kpis = useMemo(() => {
    let totalUsers = 0;
    let totalQuota = 0;
    let totalAIUsed = 0;
    let totalAIQuota = 0;
    const activeTenants = rows.filter((row) => row.is_active).length;

    for (const row of rows) {
      totalUsers += row.users_count;
      totalQuota += row.users_quota;
      totalAIUsed += row.ai_credits_used;
      totalAIQuota += row.ai_credits_quota;
    }

    return {
      activeTenants,
      totalTenants: rows.length,
      userUsagePct: totalQuota > 0 ? (totalUsers / totalQuota) * 100 : 0,
      aiUsagePct: totalAIQuota > 0 ? (totalAIUsed / totalAIQuota) * 100 : 0,
      totalUsers,
      totalQuota,
      totalAIUsed,
      totalAIQuota,
    };
  }, [rows]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Tenant",
        render: (row: TenantDto) => (
          <div className="stack gap-xs">
            <strong>{row.name}</strong>
            <span className="state-text text-mono">{row.slug}</span>
          </div>
        ),
      },
      { key: "plan", header: "Plan", render: (row: TenantDto) => <span className="pill p-neu">{row.plan}</span> },
      {
        key: "status",
        header: "Status",
        render: (row: TenantDto) => <StatusBadge value={row.is_active ? "active" : "inactive"} />,
      },
      {
        key: "quota",
        header: "Quota",
        render: (row: TenantDto) => (
          <div className="stack gap-xs">
            <span className="state-text">Users {row.users_count}/{row.users_quota}</span>
            <span className="state-text">AI {row.ai_credits_used}/{row.ai_credits_quota}</span>
          </div>
        ),
      },
      {
        key: "switch",
        header: "Switch",
        render: (row: TenantDto) => (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setActiveTenantId(activeTenantId === row.id ? null : row.id)}
          >
            {activeTenantId === row.id ? "Active Scope" : "Use Scope"}
          </button>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: TenantDto) => (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(row)}>
            Edit
          </button>
        ),
      },
    ],
    [activeTenantId, setActiveTenantId],
  );

  return (
    <section className="panel-grid">
      <section className="card onboarding-tour">
        <p className="section-eyebrow">Platform Control</p>
        <h2 className="section-title">Onboarding Sekolah Baru</h2>
        <p className="state-text">
          Kelola tenant, pantau kuota global, dan aktifkan tenant scope untuk validasi lintas sekolah.
        </p>
      </section>

      <section className="metric-grid">
        <KpiCard
          label="Active Tenants"
          value={`${kpis.activeTenants} / ${kpis.totalTenants}`}
          caption="Tenant yang aktif di platform saat ini."
        />
        <KpiCard
          label="Total Users Platform"
          value={kpis.totalUsers}
          caption={`${kpis.totalQuota} kuota total`}
          progress={kpis.userUsagePct}
        />
        <KpiCard
          label="AI Credits Used"
          value={kpis.totalAIUsed}
          caption={`${kpis.totalAIQuota} limit total`}
          progress={kpis.aiUsagePct}
        />
        <section className="card metric-card card-muted">
          <p className="section-eyebrow">Action</p>
          <h3 className="section-title-sm">Tambah Tenant</h3>
          <p className="state-text">Lompat ke wizard onboarding tenant baru.</p>
          <button
            className="btn"
            onClick={() => document.getElementById("create-tenant-section")?.scrollIntoView({ behavior: "smooth" })}
          >
            New School
          </button>
        </section>
      </section>

      <section className="card" id="create-tenant-section">
        <p className="section-eyebrow">Tenant Onboarding</p>
        <h3 className="section-title">Wizard Registrasi Tenant</h3>

        <div className="wizard-stepper">
          <span className={`wizard-step ${wizardStep > 1 ? "done" : wizardStep === 1 ? "current" : "todo"}`}>1. Detail</span>
          <span className={`wizard-step ${wizardStep > 2 ? "done" : wizardStep === 2 ? "current" : "todo"}`}>2. Paket</span>
          <span className={`wizard-step ${wizardStep === 3 ? "current" : "todo"}`}>3. Konfirmasi</span>
        </div>

        {wizardStep === 1 ? (
          <div className="grid-2">
            <FormField label="Nama Sekolah / Institusi">
              <input
                className="input"
                placeholder="Misal: SMA Negeri 1 Jakarta"
                value={form.name}
                onChange={(e) => setForm((value) => ({ ...value, name: e.target.value }))}
              />
            </FormField>
            <FormField label="Slug Tenant" hint="Digunakan sebagai identitas URL unik tenant.">
              <input
                className="input"
                placeholder="sman1-jkt"
                value={form.slug}
                onChange={(e) => setForm((value) => ({ ...value, slug: e.target.value }))}
              />
            </FormField>
            <div className="inline-actions" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setWizardStep(2)} disabled={!form.name || !form.slug}>
                Selanjutnya
              </button>
            </div>
          </div>
        ) : null}

        {wizardStep === 2 ? (
          <div className="stack">
            <FormField label="Paket Langganan">
              <select
                className="input"
                value={form.plan}
                onChange={(e) => {
                  const plan = e.target.value;
                  let usersQuota = 500;
                  let aiQuota = 200;
                  if (plan === "professional") {
                    usersQuota = 2000;
                    aiQuota = 1000;
                  }
                  if (plan === "enterprise") {
                    usersQuota = 5000;
                    aiQuota = 5000;
                  }
                  setForm((value) => ({
                    ...value,
                    plan,
                    users_quota: usersQuota,
                    ai_credits_quota: aiQuota,
                  }));
                }}
              >
                <option value="starter">Starter (500 users)</option>
                <option value="professional">Professional (2000 users)</option>
                <option value="enterprise">Enterprise (5000+ users)</option>
              </select>
            </FormField>

            <div className="grid-2">
              <FormField label="Limit Kuota User">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.users_quota}
                  onChange={(e) => setForm((value) => ({ ...value, users_quota: Number(e.target.value || 1) }))}
                />
              </FormField>
              <FormField label="Limit Kuota AI">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.ai_credits_quota}
                  onChange={(e) =>
                    setForm((value) => ({ ...value, ai_credits_quota: Number(e.target.value || 0) }))
                  }
                />
              </FormField>
            </div>

            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <button className="btn btn-ghost" onClick={() => setWizardStep(1)}>
                Kembali
              </button>
              <button className="btn" onClick={() => setWizardStep(3)}>
                Tinjau Konfirmasi
              </button>
            </div>
          </div>
        ) : null}

        {wizardStep === 3 ? (
          <div className="stack">
            <div className="surface-muted">
              <p className="section-eyebrow">Review</p>
              <ul className="stack gap-xs" style={{ margin: 0, paddingLeft: 18 }}>
                <li><strong>Nama:</strong> {form.name}</li>
                <li><strong>Slug:</strong> {form.slug}</li>
                <li><strong>Paket:</strong> {form.plan.toUpperCase()}</li>
                <li><strong>User Quota:</strong> {form.users_quota} akun</li>
                <li><strong>AI Credits:</strong> {form.ai_credits_quota} point</li>
              </ul>
            </div>

            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <button className="btn btn-ghost" onClick={() => setWizardStep(2)}>
                Perbaiki
              </button>
              <button className="btn" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Sedang Menyimpan..." : "Daftarkan Tenant"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {latestCreatedTenantId ? (
        <section className="card card-muted">
          <p className="section-eyebrow">Next Action</p>
          <h3 className="section-title-sm">Tenant baru siap masuk billing</h3>
          <p className="state-text">
            Scope tenant terbaru sudah diaktifkan. Lanjutkan ke billing untuk membuat checkout plan awal.
          </p>
          <a className="btn" href="/app/platform/billing">
            Lanjut ke Billing
          </a>
        </section>
      ) : null}

      <DataTable
        title="Tenant Management"
        columns={columns}
        rows={rows}
        loading={tenantsQuery.isLoading}
        error={tenantsQuery.isError ? errorMessageForCode(tenantsQuery.error, {}, "Gagal memuat tenant.") : null}
        actions={
          <div className="inline-actions">
            <input
              className="input"
              style={{ maxWidth: 320 }}
              placeholder="Search tenant"
              value={query.search ?? ""}
              onChange={(e) => setQuery((value) => ({ ...value, page: 1, search: e.target.value }))}
            />
            <button
              className="btn btn-ghost"
              disabled={(query.page ?? 1) <= 1}
              onClick={() => setQuery((value) => ({ ...value, page: Math.max(1, (value.page ?? 1) - 1) }))}
            >
              Prev
            </button>
            <button
              className="btn btn-ghost"
              disabled={!meta || meta.page * meta.page_size >= meta.total}
              onClick={() => setQuery((value) => ({ ...value, page: (value.page ?? 1) + 1 }))}
            >
              Next
            </button>
          </div>
        }
      />

      {editing ? (
        <section className="card">
          <p className="section-eyebrow">Tenant Editor</p>
          <h3 className="section-title">Edit Tenant</h3>
          <div className="grid-3">
            <FormField label="Nama">
              <input
                className="input"
                value={editing.name}
                onChange={(e) => setEditing((value) => (value ? { ...value, name: e.target.value } : value))}
              />
            </FormField>
            <FormField label="Slug">
              <input
                className="input"
                value={editing.slug}
                onChange={(e) => setEditing((value) => (value ? { ...value, slug: e.target.value } : value))}
              />
            </FormField>
            <FormField label="Plan">
              <select
                className="input"
                value={editing.plan}
                onChange={(e) => setEditing((value) => (value ? { ...value, plan: e.target.value } : value))}
              >
                <option value="starter">starter</option>
                <option value="professional">professional</option>
                <option value="enterprise">enterprise</option>
              </select>
            </FormField>
            <FormField label="Users Quota">
              <input
                className="input"
                type="number"
                min={1}
                value={editing.users_quota}
                onChange={(e) =>
                  setEditing((value) => (value ? { ...value, users_quota: Number(e.target.value || 1) } : value))
                }
              />
            </FormField>
            <FormField label="AI Credits Quota">
              <input
                className="input"
                type="number"
                min={0}
                value={editing.ai_credits_quota}
                onChange={(e) =>
                  setEditing((value) =>
                    value ? { ...value, ai_credits_quota: Number(e.target.value || 0) } : value,
                  )
                }
              />
            </FormField>
            <FormField label="AI Credits Used">
              <input
                className="input"
                type="number"
                min={0}
                value={editing.ai_credits_used}
                onChange={(e) =>
                  setEditing((value) => (value ? { ...value, ai_credits_used: Number(e.target.value || 0) } : value))
                }
              />
            </FormField>
          </div>

          <label className="inline-actions" style={{ marginTop: 12 }}>
            <input
              className="checkbox"
              type="checkbox"
              checked={editing.is_active}
              onChange={(e) => setEditing((value) => (value ? { ...value, is_active: e.target.checked } : value))}
            />
            <span>Tenant aktif</span>
          </label>

          <div className="inline-actions" style={{ marginTop: 16 }}>
            <button
              className="btn"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: editing.id, data: editing })}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function KpiCard({
  label,
  value,
  caption,
  progress,
}: {
  label: string;
  value: string | number;
  caption: string;
  progress?: number;
}) {
  return (
    <section className="card metric-card">
      <p className="section-eyebrow">{label}</p>
      <h3 className="metric-value">{value}</h3>
      <p className="state-text">{caption}</p>
      {progress !== undefined ? (
        <div className="progress-bar">
          <div style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      ) : null}
    </section>
  );
}
