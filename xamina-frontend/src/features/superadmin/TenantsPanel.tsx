import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
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

  const tenantsQuery = useQuery({
    queryKey: ["platform-tenants", query],
    queryFn: () => tenantApi.list(query),
  });

  const createMutation = useMutation({
    mutationFn: () => tenantApi.create(form),
    onSuccess: async () => {
      setForm(EMPTY_FORM);
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
    const activeTenants = rows.filter(r => r.is_active).length;

    for (const r of rows) {
      totalUsers += r.users_count;
      totalQuota += r.users_quota;
      totalAIUsed += r.ai_credits_used;
      totalAIQuota += r.ai_credits_quota;
    }

    return {
      activeTenants,
      totalTenants: rows.length,
      userUsagePct: totalQuota > 0 ? (totalUsers / totalQuota * 100).toFixed(1) : 0,
      aiUsagePct: totalAIQuota > 0 ? (totalAIUsed / totalAIQuota * 100).toFixed(1) : 0,
      totalUsers,
      totalQuota,
      totalAIUsed,
      totalAIQuota
    };
  }, [rows]);

  const columns = useMemo(
    () => [
      { key: "name", header: "Tenant", render: (row: TenantDto) => `${row.name} (${row.slug})` },
      { key: "plan", header: "Plan", render: (row: TenantDto) => row.plan },
      { key: "status", header: "Status", render: (row: TenantDto) => (row.is_active ? "active" : "inactive") },
      {
        key: "quota",
        header: "Quota",
        render: (row: TenantDto) =>
          `users ${row.users_count}/${row.users_quota} | AI ${row.ai_credits_used}/${row.ai_credits_quota}`,
      },
      {
        key: "switch",
        header: "Switch",
        render: (row: TenantDto) => (
          <button
            className="btn btn-ghost"
            onClick={() => setActiveTenantId(activeTenantId === row.id ? null : row.id)}
          >
            {activeTenantId === row.id ? "Active" : "Use"}
          </button>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: TenantDto) => (
          <button className="btn btn-ghost" onClick={() => setEditing(row)}>
            Edit
          </button>
        ),
      },
    ],
    [activeTenantId, setActiveTenantId],
  );

  return (
    <div className="stack">
      {/* KPI Cards section */}
      <section className="grid grid-4 gap-md" style={{ marginBottom: "1rem" }}>
        <div className="card p-md" style={{ background: "var(--app-color-glass-surface)" }}>
          <h4 className="text-sm text-dimmed">Active Tenants</h4>
          <p className="text-xl font-bold">{kpis.activeTenants} / {kpis.totalTenants}</p>
        </div>
        <div className="card p-md" style={{ background: "var(--app-color-glass-surface)" }}>
          <h4 className="text-sm text-dimmed">Total Users Platform</h4>
          <p className="text-xl font-bold">{kpis.totalUsers} <span className="text-sm font-normal">/ {kpis.totalQuota} limit</span></p>
          <div className="progress-bar mt-sm" style={{ height: 4, background: "var(--app-color-border)" }}>
            <div style={{ height: "100%", width: `${kpis.userUsagePct}%`, background: "var(--app-color-primary)" }} />
          </div>
        </div>
        <div className="card p-md" style={{ background: "var(--app-color-glass-surface)" }}>
          <h4 className="text-sm text-dimmed">AI Credits Used</h4>
          <p className="text-xl font-bold">{kpis.totalAIUsed} <span className="text-sm font-normal">/ {kpis.totalAIQuota} limit</span></p>
          <div className="progress-bar mt-sm" style={{ height: 4, background: "var(--app-color-border)" }}>
            <div style={{ height: "100%", width: `${kpis.aiUsagePct}%`, background: "var(--app-color-primary)" }} />
          </div>
        </div>
        <div className="card p-md flex items-center justify-center p-md" style={{ background: "var(--app-color-glass-surface)" }}>
          <button
            className="btn btn-primary w-full h-full"
            onClick={() => document.getElementById("create-tenant-section")?.scrollIntoView({ behavior: 'smooth' })}
          >
            + New School
          </button>
        </div>
      </section>

      <section className="card" id="create-tenant-section">
        <h3 className="section-title">Onboarding Sekolah Baru</h3>

        <div className="row justify-between mb-md text-sm text-dimmed">
          <span className={wizardStep >= 1 ? "text-primary font-bold" : ""}>1. Detail Identitas</span>
          <span className={wizardStep >= 2 ? "text-primary font-bold" : ""}>2. Pilih Paket</span>
          <span className={wizardStep >= 3 ? "text-primary font-bold" : ""}>3. Konfirmasi</span>
        </div>

        {wizardStep === 1 && (
          <div className="stack gap-md">
            <div>
              <label className="text-sm font-medium mb-1 block">Nama Sekolah / Institusi</label>
              <input
                className="input w-full"
                placeholder="Misal: SMA Negeri 1 Jakarta"
                value={form.name}
                onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Slug (URL unik)</label>
              <input
                className="input w-full"
                placeholder="sman1-jkt"
                value={form.slug}
                onChange={(e) => setForm((v) => ({ ...v, slug: e.target.value }))}
              />
            </div>
            <div className="row justify-end mt-sm">
              <button
                className="btn btn-primary"
                onClick={() => setWizardStep(2)}
                disabled={!form.name || !form.slug}
              >Selanjutnya</button>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="stack gap-md">
            <div>
              <label className="text-sm font-medium mb-1 block">Paket Langganan</label>
              <select
                className="input w-full"
                value={form.plan}
                onChange={(e) => {
                  const plan = e.target.value;
                  let uq = 500, aq = 200;
                  if (plan === "professional") { uq = 2000; aq = 1000; }
                  if (plan === "enterprise") { uq = 5000; aq = 5000; }
                  setForm((v) => ({ ...v, plan, users_quota: uq, ai_credits_quota: aq }));
                }}
              >
                <option value="starter">Starter (500 users)</option>
                <option value="professional">Professional (2000 users)</option>
                <option value="enterprise">Enterprise (5000+ users)</option>
              </select>
            </div>
            <div className="grid grid-2 gap-md">
              <div>
                <label className="text-sm font-medium mb-1 block">Limit Kuota User</label>
                <input
                  className="input w-full"
                  type="number"
                  min={1}
                  value={form.users_quota}
                  onChange={(e) => setForm((v) => ({ ...v, users_quota: Number(e.target.value || 1) }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Limit Kuota AI</label>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  value={form.ai_credits_quota}
                  onChange={(e) => setForm((v) => ({ ...v, ai_credits_quota: Number(e.target.value || 0) }))}
                />
              </div>
            </div>
            <div className="row justify-between mt-sm">
              <button className="btn btn-ghost" onClick={() => setWizardStep(1)}>Kembali</button>
              <button className="btn btn-primary" onClick={() => setWizardStep(3)}>Tinjau Konfirmasi</button>
            </div>
          </div>
        )}

        {wizardStep === 3 && (
          <div className="stack gap-md">
            <div className="p-md" style={{ background: "var(--app-color-glass-surface)", borderRadius: 8 }}>
              <h4 className="font-bold mb-sm">Ringkasan Pendaftaran</h4>
              <ul className="text-sm stack gap-xs">
                <li><strong>Nama:</strong> {form.name}</li>
                <li><strong>Slug:</strong> {form.slug}</li>
                <li><strong>Paket:</strong> {form.plan.toUpperCase()}</li>
                <li><strong>User Quota:</strong> {form.users_quota} akun</li>
                <li><strong>AI Credits:</strong> {form.ai_credits_quota} point</li>
              </ul>
            </div>
            <div className="row justify-between mt-sm">
              <button className="btn btn-ghost" onClick={() => setWizardStep(2)}>Perbaiki</button>
              <button
                className="btn btn-primary"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Sedang Menyimpan..." : "Daftarkan Tenant"}
              </button>
            </div>
          </div>
        )}

      </section>

      <DataTable
        title="Tenant Management"
        columns={columns}
        rows={rows}
        loading={tenantsQuery.isLoading}
        error={tenantsQuery.isError ? errorMessageForCode(tenantsQuery.error, {}, "Gagal memuat tenant.") : null}
        actions={
          <div className="row gap-sm">
            <input
              className="input"
              placeholder="Search tenant"
              value={query.search ?? ""}
              onChange={(e) => setQuery((v) => ({ ...v, page: 1, search: e.target.value }))}
            />
            <button
              className="btn btn-ghost"
              disabled={(query.page ?? 1) <= 1}
              onClick={() => setQuery((v) => ({ ...v, page: Math.max(1, (v.page ?? 1) - 1) }))}
            >
              Prev
            </button>
            <button
              className="btn btn-ghost"
              disabled={!meta || (meta.page * meta.page_size >= meta.total)}
              onClick={() => setQuery((v) => ({ ...v, page: (v.page ?? 1) + 1 }))}
            >
              Next
            </button>
          </div>
        }
      />

      {editing ? (
        <section className="card">
          <h3 className="section-title">Edit Tenant</h3>
          <div className="grid grid-3">
            <input
              className="input"
              value={editing.name}
              onChange={(e) => setEditing((v) => (v ? { ...v, name: e.target.value } : v))}
            />
            <input
              className="input"
              value={editing.slug}
              onChange={(e) => setEditing((v) => (v ? { ...v, slug: e.target.value } : v))}
            />
            <select
              className="input"
              value={editing.plan}
              onChange={(e) => setEditing((v) => (v ? { ...v, plan: e.target.value } : v))}
            >
              <option value="starter">starter</option>
              <option value="professional">professional</option>
              <option value="enterprise">enterprise</option>
            </select>
            <input
              className="input"
              type="number"
              min={1}
              placeholder="Users quota"
              value={editing.users_quota}
              onChange={(e) => setEditing((v) => (v ? { ...v, users_quota: Number(e.target.value || 1) } : v))}
            />
            <input
              className="input"
              type="number"
              min={0}
              placeholder="AI credits quota"
              value={editing.ai_credits_quota}
              onChange={(e) =>
                setEditing((v) => (v ? { ...v, ai_credits_quota: Number(e.target.value || 0) } : v))
              }
            />
            <input
              className="input"
              type="number"
              min={0}
              placeholder="AI credits used"
              value={editing.ai_credits_used}
              onChange={(e) =>
                setEditing((v) => (v ? { ...v, ai_credits_used: Number(e.target.value || 0) } : v))
              }
            />
            <label className="row gap-sm">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing((v) => (v ? { ...v, is_active: e.target.checked } : v))}
              />
              Active
            </label>
          </div>
          <div className="row gap-sm" style={{ marginTop: 12 }}>
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
    </div>
  );
}
