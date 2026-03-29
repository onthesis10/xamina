import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Chart from "chart.js/auto";
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  BrainCircuit,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

import { CorePageTour } from "@/components/CorePageTour";
import { DataTable } from "@/components/DataTable";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { tenantApi } from "@/features/superadmin/tenant.api";
import { errorMessageForCode } from "@/lib/axios";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import type {
  DashboardAdminSummaryDto,
  DashboardGuruSummaryDto,
  DashboardSiswaSummaryDto,
  DashboardStatsDto,
  StudentRecentResultDto,
  StudentUpcomingExamDto,
  TenantDto,
  TrendPointDto,
} from "@/types/api.types";

import { analyticsApi } from "./analytics.api";

type TrendRow = TrendPointDto & { id: string };
type RecentResultRow = StudentRecentResultDto & { id: string };
type UpcomingExamRow = StudentUpcomingExamDto & { id: string };
type TenantUsageRow = TenantDto & { usage_pct: number; ai_usage_pct: number };

// ─── Utilities ──────────────────────────────────────────────────────────────

function readChartPalette() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue("--primary").trim() || "#FF6B00",
    primarySoft: styles.getPropertyValue("--primary-bg").trim() || "rgba(255,107,0,0.16)",
    success: styles.getPropertyValue("--success").trim() || "#16A34A",
    successSoft: styles.getPropertyValue("--success-bg").trim() || "rgba(22,163,74,0.16)",
    textMuted: styles.getPropertyValue("--text-2").trim() || "#9C7A58",
    border: styles.getPropertyValue("--border").trim() || "#EAE0D4",
  };
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "Tidak dijadwalkan";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) : "-";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  { bg: "var(--primary-bg)", fg: "var(--primary)" },
  { bg: "var(--info-bg)", fg: "var(--info)" },
  { bg: "var(--success-bg)", fg: "var(--success)" },
  { bg: "var(--violet-bg)", fg: "var(--violet)" },
  { bg: "var(--teal-bg)", fg: "var(--teal)" },
  { bg: "var(--warning-bg)", fg: "var(--warning)" },
];

function DashAvatar({
  name,
  size = "md",
  colorIndex = 0,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  colorIndex?: number;
}) {
  const { bg, fg } = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  return (
    <span
      className={`dash-avatar dash-avatar-${size}`}
      style={{ background: bg, color: fg }}
      aria-label={name}
    >
      {getInitials(name)}
    </span>
  );
}

// ─── Trend Chart ─────────────────────────────────────────────────────────────

function TrendChart({ title, points }: { title: string; points: TrendPointDto[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeMode = useUiStore((state) => state.themeMode);

  useEffect(() => {
    if (!canvasRef.current) return;
    const palette = readChartPalette();
    const chart = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: points.map((item) => item.day),
        datasets: [
          {
            label: "Submissions",
            data: points.map((item) => item.submissions),
            borderColor: palette.primary,
            backgroundColor: palette.primarySoft,
            yAxisID: "y",
            borderRadius: 5,
          },
          {
            label: "Pass Rate (%)",
            data: points.map((item) => item.pass_rate),
            borderColor: palette.success,
            backgroundColor: palette.successSoft,
            yAxisID: "y1",
            borderRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: palette.textMuted } },
        },
        scales: {
          x: { ticks: { color: palette.textMuted }, grid: { color: palette.border } },
          y: { beginAtZero: true, position: "left", ticks: { color: palette.textMuted }, grid: { color: palette.border } },
          y1: { beginAtZero: true, position: "right", min: 0, max: 100, ticks: { color: palette.textMuted }, grid: { color: "transparent" } },
        },
      },
    });
    return () => chart.destroy();
  }, [points, themeMode]);

  return (
    <section className="card dashboard-card-fill">
      <p className="section-eyebrow">Primary View</p>
      <h3 className="section-title-sm">{title}</h3>
      <p className="state-text">Ritme submission dan pass rate 7 hari terakhir.</p>
      <div className="chart-wrap" style={{ marginTop: 12 }}>
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}

// ─── DashboardGreeting (shared for all roles) ────────────────────────────────

function DashboardGreeting(props: {
  title: string;
  sub: string;
  badge?: string;
  actions?: Array<{ label: string; variant?: "ghost"; onClick: () => void }>;
}) {
  return (
    <div className="dash-greeting">
      <div className="dash-greeting-copy">
        <h2 className="dash-greeting-title">{props.title}</h2>
        <p className="dash-greeting-sub">{props.sub}</p>
      </div>
      <div className="dash-greeting-actions">
        {props.badge && <span className="dash-greeting-badge">{props.badge}</span>}
        {props.actions?.map((a) => (
          <button
            key={a.label}
            className={a.variant === "ghost" ? "btn btn-ghost" : "btn"}
            onClick={a.onClick}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── DashboardHero (section card wrapper for hero) ───────────────────────────

function DashboardHero(props: { children: ReactNode }) {
  return (
    <section className="card dashboard-hero page-hero">
      {props.children}
    </section>
  );
}

// ─── InsightCard ─────────────────────────────────────────────────────────────

function InsightCard({
  eyebrow,
  title,
  description,
  items,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{ label: string; value: string; tone?: "default" | "accent" }>;
}) {
  return (
    <section className="card dashboard-card-fill">
      <p className="section-eyebrow">{eyebrow}</p>
      <h3 className="section-title-sm">{title}</h3>
      <p className="state-text">{description}</p>
      <div className="dashboard-list">
        {items.map((item) => (
          <div key={`${item.label}-${item.value}`} className="dashboard-list-item">
            <span className="state-text">{item.label}</span>
            <strong className={item.tone === "accent" ? "text-primary" : ""}>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CompactListCard ─────────────────────────────────────────────────────────

function CompactListCard({
  eyebrow,
  title,
  description,
  items,
  emptyLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{ id: string; title: string; meta: string; trailing?: string; status?: ReactNode }>;
  emptyLabel: string;
}) {
  return (
    <section className="card dashboard-card-fill">
      <p className="section-eyebrow">{eyebrow}</p>
      <h3 className="section-title-sm">{title}</h3>
      <p className="state-text">{description}</p>
      <div className="dashboard-list">
        {items.length === 0 ? <p className="state-text">{emptyLabel}</p> : null}
        {items.map((item) => (
          <article key={item.id} className="dashboard-list-card">
            <div className="dashboard-list-head">
              <strong>{item.title}</strong>
              {item.status ?? (item.trailing ? <span className="pill p-neu">{item.trailing}</span> : null)}
            </div>
            <p className="state-text">{item.meta}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─── DashboardSkeleton / Error ────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <section className="panel-grid dashboard-shell" data-tour="dashboard">
      <CorePageTour
        page="dashboard"
        title="Mulai dari Dashboard"
        description="Dashboard merangkum performa tenant aktif dan membantu validasi cepat setelah publish ujian."
        bullets={[
          "Pantau metrik utama dan trend 7 hari tanpa pindah halaman.",
          "Gunakan struktur yang sama untuk seluruh role supaya navigasi tetap familiar.",
          "Dashboard ini adalah langkah pertama pada tour beta Sprint 12.",
        ]}
      />
      <section className="page-hero card dashboard-hero">
        <LoadingSkeleton card lines={3} />
      </section>
      <div className="metric-grid">
        <LoadingSkeleton card lines={2} />
        <LoadingSkeleton card lines={2} />
        <LoadingSkeleton card lines={2} />
        <LoadingSkeleton card lines={2} />
      </div>
      <div className="dashboard-grid">
        <LoadingSkeleton card lines={5} />
        <LoadingSkeleton card lines={5} />
      </div>
      <div className="dashboard-grid">
        <LoadingSkeleton card lines={5} />
        <LoadingSkeleton card lines={5} />
      </div>
    </section>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <section className="panel-grid dashboard-shell" data-tour="dashboard">
      <section className="card surface-muted accent">
        <p className="section-eyebrow">Dashboard State</p>
        <h3 className="section-title-sm">Dashboard belum bisa dimuat</h3>
        <p className="state-text error">{message}</p>
      </section>
    </section>
  );
}

// ─── SUPER ADMIN DASHBOARD ───────────────────────────────────────────────────

function SystemHealthCard() {
  const health = [
    { label: "API Response", value: 98, color: "var(--success)" },
    { label: "Database", value: 100, color: "var(--success)" },
    { label: "AI Service", value: 94, color: "var(--warning)" },
    { label: "Storage", value: 72, color: "var(--primary)" },
  ];

  return (
    <section className="card">
      <p className="section-eyebrow">System</p>
      <h3 className="section-title-sm">Status Sistem</h3>
      <div className="dash-health-list">
        {health.map((item) => (
          <div key={item.label} className="dash-health-row">
            <div className="dash-health-label-row">
              <p className="dash-health-label">{item.label}</p>
              <p className="dash-health-value" style={{ color: item.color }}>{item.value}%</p>
            </div>
            <div className="progress-bar">
              <div style={{ width: `${item.value}%`, background: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlatformActivityCard() {
  const activities = [
    { icon: Building2, color: "var(--violet)", bg: "var(--violet-bg)", text: "SMAN 3 Depok mendaftar paket Enterprise", time: "5 mnt lalu" },
    { icon: Users, color: "var(--success)", bg: "var(--success-bg)", text: "1,240 siswa berhasil login ujian nasional", time: "12 mnt lalu" },
    { icon: Sparkles, color: "var(--warning)", bg: "var(--warning-bg)", text: "AI generate 450 soal baru untuk SMKN 7", time: "1 jam lalu" },
    { icon: ShieldCheck, color: "var(--danger)", bg: "var(--danger-bg)", text: "Percobaan akses tidak sah terblokir (×3)", time: "2 jam lalu" },
  ];

  return (
    <section className="card">
      <p className="section-eyebrow">Live Feed</p>
      <h3 className="section-title-sm">Aktivitas Terbaru</h3>
      <div className="dash-activity-list">
        {activities.map((item) => {
          const IconComp = item.icon;
          return (
            <div key={item.text} className="dash-activity-item">
              <span
                className="dash-activity-icon"
                style={{ background: item.bg, color: item.color }}
              >
                <IconComp size={14} />
              </span>
              <div className="dash-activity-copy">
                <p className="dash-activity-text">{item.text}</p>
                <p className="dash-activity-time">{item.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AiUsageCard({ usageRows }: { usageRows: TenantUsageRow[] }) {
  const totalAiUsed = usageRows.reduce((acc, row) => acc + row.ai_credits_used, 0);
  const totalAiQuota = usageRows.reduce((acc, row) => acc + row.ai_credits_quota, 0);
  const pct = totalAiQuota > 0 ? Math.round((totalAiUsed / totalAiQuota) * 100) : 0;

  return (
    <div className="dash-ai-usage-card">
      <p className="dash-ai-kicker">AI Usage Platform</p>
      <p className="dash-ai-value">{totalAiUsed.toLocaleString("id-ID")}</p>
      <p className="dash-ai-desc">Total AI credits terpakai di seluruh tenant aktif.</p>
      <div className="progress-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="dash-activity-time">{pct}% dari limit platform ({totalAiQuota.toLocaleString("id-ID")} total)</p>
    </div>
  );
}

function SuperAdminDashboard({
  rows,
  activeTenantId,
  onOpenTenants,
  onClearScope,
}: {
  rows: TenantDto[];
  activeTenantId: string | null;
  onOpenTenants: () => void;
  onClearScope: () => void;
}) {
  const usageRows = useMemo<TenantUsageRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        usage_pct: row.users_quota > 0 ? (row.users_count / row.users_quota) * 100 : 0,
        ai_usage_pct: row.ai_credits_quota > 0 ? (row.ai_credits_used / row.ai_credits_quota) * 100 : 0,
      })),
    [rows],
  );

  const totalUsers = usageRows.reduce((acc, r) => acc + r.users_count, 0);
  const totalUsersQuota = usageRows.reduce((acc, r) => acc + r.users_quota, 0);
  const totalAiUsed = usageRows.reduce((acc, r) => acc + r.ai_credits_used, 0);
  const totalAiQuota = usageRows.reduce((acc, r) => acc + r.ai_credits_quota, 0);
  const activeTenants = usageRows.filter((r) => r.is_active).length;
  const watchlistRows = [...usageRows].sort((a, b) => b.usage_pct - a.usage_pct).slice(0, 5);

  return (
    <>
      {/* Hero */}
      <DashboardHero>
        <DashboardGreeting
          title="Platform Overview — Super Admin 🛡️"
          sub={
            activeTenantId
              ? `Tenant scope aktif: ${activeTenantId.slice(0, 8)}... · Dashboard global tetap tersedia.`
              : `${rows.length} tenant terdaftar · ${activeTenants} aktif · Minggu, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
          }
          actions={[
            ...(activeTenantId ? [{ label: "Clear Scope", variant: "ghost" as const, onClick: onClearScope }] : []),
            { label: "Platform Tenants →", onClick: onOpenTenants },
          ]}
        />
        <div className="surface-muted dashboard-hero-note" style={{ marginTop: 4 }}>
          <p className="stat-label">Platform Scope</p>
          <p className="state-text">
            {activeTenantId
              ? `Scopeed ke tenant ${activeTenantId.slice(0, 8)}. Dashboard tetap membaca overview global dari /platform/tenants.`
              : "Tidak ada tenant scope aktif. Menampilkan gambaran global seluruh tenant di platform."}
          </p>
        </div>
      </DashboardHero>

      {/* KPI Stats */}
      <section className="metric-grid">
        <StatCard
          label="Total Tenants"
          value={usageRows.length}
          caption="Tenant terdaftar di platform."
          icon={<Building2 size={20} />}
          accent="violet"
          trend={6}
          sparkData={[30, 32, 35, 38, 40, 43, 45, usageRows.length]}
        />
        <StatCard
          label="Active Tenants"
          value={activeTenants}
          caption="Tenant aktif dan bisa dioperasikan."
          icon={<ShieldCheck size={20} />}
          accent="success"
          trend={0}
        />
        <StatCard
          label="Platform Users"
          value={totalUsers.toLocaleString("id-ID")}
          caption={`${totalUsersQuota.toLocaleString("id-ID")} kuota tersedia.`}
          icon={<Users size={20} />}
          accent="info"
          progress={totalUsersQuota > 0 ? (totalUsers / totalUsersQuota) * 100 : 0}
          trend={12}
          sparkData={[48, 51, 53, 55, 57, 59, 61, totalUsers]}
        />
        <StatCard
          label="AI Credits Used"
          value={totalAiUsed.toLocaleString("id-ID")}
          caption={`${totalAiQuota.toLocaleString("id-ID")} limit kredit AI.`}
          icon={<BrainCircuit size={20} />}
          accent="warning"
          progress={totalAiQuota > 0 ? (totalAiUsed / totalAiQuota) * 100 : 0}
          trend={18}
        />
      </section>

      {/* Mid Grid: Tenant table + System */}
      <section className="dashboard-grid">
        {/* Tenant table */}
        <section className="card">
          <p className="section-eyebrow">Tenant Overview</p>
          <h3 className="section-title-sm">Sekolah Aktif</h3>
          <div style={{ marginTop: 10 }}>
            {usageRows.slice(0, 6).map((row, i) => (
              <div key={row.id} className="dash-tenant-row">
                <DashAvatar name={row.name} size="md" colorIndex={i} />
                <div className="dash-tenant-info">
                  <p className="dash-tenant-name">{row.name}</p>
                  <p className="dash-tenant-slug">{row.slug}</p>
                </div>
                <div className="dash-tenant-tail">
                  <span className="pill p-neu">{row.plan}</span>
                  <span
                    className={`dash-status-dot ${row.is_active ? "active" : "inactive"}`}
                    title={row.is_active ? "Aktif" : "Nonaktif"}
                  />
                </div>
              </div>
            ))}
            {usageRows.length === 0 && (
              <p className="state-text" style={{ padding: "16px" }}>Belum ada tenant.</p>
            )}
          </div>
        </section>

        {/* Right: System Health + AI Usage */}
        <div className="panel-grid">
          <SystemHealthCard />
          <AiUsageCard usageRows={usageRows} />
        </div>
      </section>

      {/* Bottom: Watchlist + Activity */}
      <section className="dashboard-grid">
        <DataTable
          title="Capacity Watchlist"
          rows={watchlistRows}
          columns={[
            { key: "tenant", header: "Tenant", render: (row) => row.name },
            { key: "users", header: "User%", render: (row) => `${Math.round(row.usage_pct)}%` },
            { key: "ai", header: "AI%", render: (row) => `${Math.round(row.ai_usage_pct)}%` },
            { key: "status", header: "Status", render: (row) => <StatusBadge value={row.is_active ? "active" : "inactive"} /> },
          ]}
          emptyLabel="Belum ada tenant pada watchlist."
        />
        <PlatformActivityCard />
      </section>
    </>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────

const ADMIN_TEACHERS = [
  { name: "Budi Santoso", subject: "Matematika", exams: 12, avgScore: 78, colorIndex: 0 },
  { name: "Sari Dewi", subject: "Bahasa Inggris", exams: 8, avgScore: 82, colorIndex: 1 },
  { name: "Rudi Hartono", subject: "Kimia", exams: 15, avgScore: 74, colorIndex: 2 },
  { name: "Andi Pratama", subject: "Fisika", exams: 10, avgScore: 80, colorIndex: 3 },
];

const CLASS_DIST = [
  { label: "Kelas X", value: 420, total: 1240, accentColor: "var(--primary)" },
  { label: "Kelas XI", value: 390, total: 1240, accentColor: "var(--info)" },
  { label: "Kelas XII", value: 430, total: 1240, accentColor: "var(--success)" },
];

function TeacherPerformanceSection() {
  return (
    <section className="card">
      <p className="section-eyebrow">Performa</p>
      <h3 className="section-title-sm">Performa Guru</h3>
      <div className="dash-teacher-grid">
        {ADMIN_TEACHERS.map((t) => (
          <div key={t.name} className="dash-teacher-card">
            <div className="dash-teacher-head">
              <DashAvatar name={t.name} size="md" colorIndex={t.colorIndex} />
              <div className="dash-teacher-info">
                <p className="dash-teacher-name">{t.name}</p>
                <p className="dash-teacher-subject">{t.subject}</p>
              </div>
            </div>
            <div className="dash-teacher-stats">
              <div className="dash-teacher-stat">
                <span className="dash-teacher-stat-value" style={{ color: AVATAR_COLORS[t.colorIndex].fg }}>
                  {t.exams}
                </span>
                <span className="dash-teacher-stat-label">Ujian</span>
              </div>
              <div className="dash-teacher-stat">
                <span className="dash-teacher-stat-value">{t.avgScore}</span>
                <span className="dash-teacher-stat-label">Avg Nilai</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClassDistributionCard() {
  return (
    <section className="card">
      <p className="section-eyebrow">Distribusi</p>
      <h3 className="section-title-sm">Distribusi Kelas</h3>
      <div className="dash-class-dist">
        {CLASS_DIST.map((item) => (
          <div key={item.label} className="dash-class-dist-row">
            <div className="dash-class-dist-label-row">
              <span className="dash-class-dist-label">{item.label}</span>
              <span className="dash-class-dist-count">{item.value} siswa</span>
            </div>
            <div className="progress-bar">
              <div style={{ width: `${(item.value / item.total) * 100}%`, background: item.accentColor }} />
            </div>
          </div>
        ))}
      </div>
      <div className="dash-target-card">
        <p className="dash-target-kicker">🎯 Target Semester</p>
        <p className="dash-target-label">Rata-rata nilai ≥ 80 untuk semua kelas</p>
        <div className="progress-bar">
          <div style={{ width: "76%" }} />
        </div>
        <p className="dash-target-note">76% menuju target semester ini</p>
      </div>
    </section>
  );
}

// ─── GURU DASHBOARD ──────────────────────────────────────────────────────────

const GURU_RECENT_RESULTS = [
  { name: "Andi Prasetyo", score: 92, kelas: "XII IPA 1", grade: "A" },
  { name: "Bela Kusuma", score: 88, kelas: "XII IPA 1", grade: "A" },
  { name: "Candra Wijaya", score: 74, kelas: "XII IPA 1", grade: "B" },
  { name: "Dewi Lestari", score: 68, kelas: "XII IPA 2", grade: "C" },
  { name: "Eka Putra", score: 95, kelas: "XII IPA 2", grade: "A" },
];

function AiBannerGuru({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="dash-banner dash-banner-ai">
      <div className="dash-banner-icon">
        <Brain size={22} />
      </div>
      <div className="dash-banner-copy" style={{ flex: 1 }}>
        <p className="dash-banner-kicker">✨ AI Generator Tersedia</p>
        <h3 className="dash-banner-title">Buat 40 soal dalam 30 detik dengan AI</h3>
        <p className="dash-banner-desc">Kurikulum Merdeka · Kelas XII · Pilihan Ganda & Essay</p>
      </div>
      <button className="dash-banner-btn" onClick={onGenerate}>
        Generate Soal →
      </button>
    </div>
  );
}

function GuruRecentResultsCard() {
  return (
    <section className="card dashboard-card-fill">
      <p className="section-eyebrow">Nilai Terbaru</p>
      <h3 className="section-title-sm">Hasil Siswa</h3>
      <p className="state-text">Nilai terakhir dari ujian yang kamu kelola.</p>
      <div className="dash-result-list">
        {GURU_RECENT_RESULTS.map((r, i) => {
          const scoreColor =
            r.score >= 90 ? "var(--success)" : r.score >= 75 ? "var(--primary)" : "var(--warning)";
          return (
            <div key={r.name} className="dash-result-row">
              <DashAvatar name={r.name} size="sm" colorIndex={i} />
              <div className="dash-result-info">
                <p className="dash-result-name">{r.name}</p>
                <p className="dash-result-class">{r.kelas}</p>
              </div>
              <div className="dash-result-score">
                <p className="dash-score-value" style={{ color: scoreColor }}>{r.score}</p>
                <p className="dash-score-grade">Grade {r.grade}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── SISWA DASHBOARD ─────────────────────────────────────────────────────────

const SISWA_LEADERBOARD = [
  { rank: 1, name: "Eka Putra", score: 95.2, isMe: false },
  { rank: 2, name: "Andi Prasetyo", score: 92.1, isMe: false },
  { rank: 3, name: "Saya", score: 88.4, isMe: true },
  { rank: 4, name: "Bela Kusuma", score: 87.9, isMe: false },
  { rank: 5, name: "Candra Wijaya", score: 85.3, isMe: false },
];

function UrgentExamBanner({ exam }: { exam: { title: string; meta: string } | null }) {
  if (!exam) return null;
  return (
    <div className="dash-banner dash-banner-urgent">
      <div className="dash-banner-icon">
        <Clock size={22} />
      </div>
      <div className="dash-banner-copy" style={{ flex: 1 }}>
        <p className="dash-banner-kicker">⚠️ Ujian Besok!</p>
        <h3 className="dash-banner-title">{exam.title}</h3>
        <p className="dash-banner-desc">{exam.meta}</p>
      </div>
      <button className="dash-banner-btn">Detail →</button>
    </div>
  );
}

function LeaderboardCard() {
  return (
    <section className="card dashboard-card-fill">
      <p className="section-eyebrow">Peringkat</p>
      <h3 className="section-title-sm">
        <Trophy size={16} style={{ display: "inline", marginRight: 6, color: "var(--warning)" }} />
        Leaderboard Kelas
      </h3>
      <p className="state-text">Peringkat dari semua ujian di kelas aktif.</p>
      <div className="dash-leaderboard-list">
        {SISWA_LEADERBOARD.map((item) => (
          <div key={item.rank} className={`dash-leaderboard-row ${item.isMe ? "is-me" : ""}`}>
            <span className={`dash-rank rank-${item.rank}`}>
              {item.rank <= 3 ? ["🥇", "🥈", "🥉"][item.rank - 1] : `#${item.rank}`}
            </span>
            <DashAvatar name={item.name} size="sm" colorIndex={item.rank - 1} />
            <div className="dash-leaderboard-info">
              <p className="dash-leaderboard-name">{item.name}{item.isMe ? " (Kamu)" : ""}</p>
            </div>
            <p className="dash-leaderboard-score">{item.score.toFixed(1)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── ADMIN/GURU COMBINED DASHBOARD ───────────────────────────────────────────

function AdminGuruDashboard({
  data,
  stats,
  onOpenPrimary,
  onOpenSecondary,
  onNavigateAI,
}: {
  data: DashboardAdminSummaryDto | DashboardGuruSummaryDto;
  stats?: DashboardStatsDto;
  onOpenPrimary: () => void;
  onOpenSecondary: () => void;
  onNavigateAI: () => void;
}) {
  const trendRows: TrendRow[] = data.trend_7d.map((item) => ({ ...item, id: item.day }));
  const isAdmin = data.role === "admin";

  const guruData = data as DashboardGuruSummaryDto;
  const guruExam = guruData.exams_total;
  const guruPublished = guruData.published_exams_total;
  const adminData = data as DashboardAdminSummaryDto;

  return (
    <>
      {/* Hero */}
      <DashboardHero>
        <DashboardGreeting
          title={isAdmin ? "Dashboard Sekolah 🏫" : "Halo, Selamat datang! ✏️"}
          sub={
            isAdmin
              ? stats?.tenant
                ? `${stats.tenant.users_count} users · ${stats.tenant.users_quota} kuota · ${stats.tenant.ai_credits_used}/${stats.tenant.ai_credits_quota} AI credits`
                : "Platform Assessment Multi-Peran"
              : `${guruExam} ujian dibuat · ${guruPublished} dipublikasikan · 3 kelas aktif`
          }
          actions={
            isAdmin
              ? [
                { label: "Users", variant: "ghost", onClick: onOpenSecondary },
                { label: "Reports →", onClick: onOpenPrimary },
              ]
              : [
                { label: "Question Bank", variant: "ghost", onClick: onOpenSecondary },
                { label: "Exams →", onClick: onOpenPrimary },
              ]
          }
        />
      </DashboardHero>

      {/* AI Banner (guru only) */}
      {!isAdmin && <AiBannerGuru onGenerate={onNavigateAI} />}

      {/* KPI Stats */}
      <section className="metric-grid">
        {isAdmin ? (
          <>
            <StatCard
              label="Users"
              value={data.users_total}
              caption="Akun aktif pada tenant."
              icon={<Users size={20} />}
              accent="info"
              trend={3}
              sparkData={[180, 195, 210, 220, 230, 238, 245, data.users_total]}
            />
            <StatCard
              label="Classes"
              value={data.classes_total}
              caption="Ruang belajar aktif."
              icon={<GraduationCap size={20} />}
              accent="violet"
              trend={0}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Exams"
              value={guruExam}
              caption="Ujian yang kamu buat."
              icon={<ClipboardList size={20} />}
              accent="primary"
              trend={0}
            />
            <StatCard
              label="Published"
              value={guruPublished}
              caption="Ujian siap untuk siswa."
              icon={<Zap size={20} />}
              accent="success"
              trend={15}
              sparkData={[1, 1, 2, 3, 3, 4, 4, guruPublished]}
            />
          </>
        )}
        <StatCard
          label="Submissions"
          value={data.submissions_total}
          caption="Submission masuk periode aktif."
          icon={<ArrowUpRight size={20} />}
          accent="teal"
          trend={8}
          sparkData={[120, 134, 150, 160, 178, 190, 205, data.submissions_total]}
        />
        <StatCard
          label="Avg Score"
          value={data.avg_score.toFixed(1)}
          caption="Rata-rata skor tenant aktif."
          icon={<ArrowUpRight size={20} />}
          accent="warning"
          trend={4}
          sparkData={[70, 72, 73, 74, 75, 76, 76.4, data.avg_score]}
        />
        <StatCard
          label="Pass Rate"
          value={`${data.pass_rate.toFixed(1)}%`}
          caption="Persentase kelulusan aktif."
          icon={<ShieldCheck size={20} />}
          accent="success"
          trend={2}
          sparkData={[78, 79, 80, 81, 81, 82, 82, data.pass_rate]}
        />
      </section>

      {/* Primary Grid: Chart + Insight */}
      <section className="dashboard-grid">
        <TrendChart
          title={isAdmin ? "Trend 7 Hari Tenant" : "Trend 7 Hari Ujian Guru"}
          points={data.trend_7d}
        />
        <InsightCard
          eyebrow="Operational Focus"
          title={isAdmin ? "Snapshot Tenant Aktif" : "Teaching Pulse"}
          description={
            isAdmin
              ? "Quick diagnostic sebelum pindah ke halaman manajemen."
              : "Kondisi ujian guru tanpa mengubah struktur dashboard."
          }
          items={
            isAdmin
              ? [
                {
                  label: "Users vs Quota",
                  value: stats?.tenant ? `${stats.tenant.users_count}/${stats.tenant.users_quota}` : "Memuat…",
                  tone: "accent",
                },
                {
                  label: "AI Credits",
                  value: stats?.tenant ? `${stats.tenant.ai_credits_used}/${stats.tenant.ai_credits_quota}` : "Memuat…",
                },
                { label: "Exams", value: `${adminData.exams_total} total` },
                { label: "Submissions", value: `${data.submissions_total}` },
              ]
              : [
                {
                  label: "Published ratio",
                  value: guruExam > 0 ? `${Math.round((guruPublished / guruExam) * 100)}%` : "0%",
                  tone: "accent",
                },
                { label: "Submission volume", value: `${data.submissions_total} submission` },
                { label: "Trend data", value: `${trendRows.length} hari` },
                { label: "Next action", value: "Question bank & exams" },
              ]
          }
        />
      </section>

      {/* Secondary Grid: Table + teacher/class */}
      <section className="dashboard-grid">
        <DataTable
          title="Trend Detail"
          rows={trendRows}
          columns={[
            { key: "day", header: "Date", render: (row) => row.day },
            { key: "submissions", header: "Submissions", render: (row) => row.submissions },
            { key: "avg_score", header: "Avg Score", render: (row) => row.avg_score.toFixed(2) },
            { key: "pass_rate", header: "Pass Rate (%)", render: (row) => row.pass_rate.toFixed(2) },
          ]}
          emptyLabel="Belum ada data trend 7 hari."
        />
        {isAdmin ? <ClassDistributionCard /> : <GuruRecentResultsCard />}
      </section>

      {/* Admin-only: Teacher performance */}
      {isAdmin && <TeacherPerformanceSection />}
    </>
  );
}

// ─── STUDENT DASHBOARD ───────────────────────────────────────────────────────

function StudentDashboard({
  data,
  onOpenExams,
  onOpenCertificates,
}: {
  data: DashboardSiswaSummaryDto;
  onOpenExams: () => void;
  onOpenCertificates: () => void;
}) {
  const recentRows: RecentResultRow[] = data.recent_results.map((item) => ({
    ...item,
    id: `${item.exam_id}-${item.finished_at ?? "result"}`,
  }));
  const upcomingRows: UpcomingExamRow[] = data.upcoming_exams.map((item) => ({ ...item, id: item.exam_id }));

  // Pick the soonest upcoming as "urgent" if start_at is within 48h
  const urgentExam = upcomingRows
    .filter((r) => r.start_at && new Date(r.start_at).getTime() - Date.now() < 48 * 60 * 60 * 1000)
    .at(0);

  const urgentBanner = urgentExam
    ? { title: urgentExam.title, meta: `Mulai ${formatDate(urgentExam.start_at)} · Segera persiapkan dirimu!` }
    : null;

  return (
    <>
      {/* Hero */}
      <DashboardHero>
        <DashboardGreeting
          title="Halo, Selamat Datang! 🎓"
          sub="XII IPA 1 · Platform Ujian Digital"
          badge={`Peringkat #3 di kelas`}
          actions={[
            { label: "Sertifikat", variant: "ghost", onClick: onOpenCertificates },
            { label: "Ujian Saya →", onClick: onOpenExams },
          ]}
        />
      </DashboardHero>

      {/* Urgent Exam Banner */}
      <UrgentExamBanner exam={urgentBanner} />

      {/* KPI Stats */}
      <section className="metric-grid">
        <StatCard
          label="In Progress"
          value={data.in_progress_count}
          caption="Submission yang bisa dilanjutkan."
          icon={<CalendarClock size={20} />}
          accent="warning"
          trend={0}
        />
        <StatCard
          label="Finished"
          value={data.finished_count}
          caption="Ujian telah selesai & ternilai."
          icon={<Trophy size={20} />}
          accent="success"
          trend={2}
          sparkData={[12, 13, 14, 14, 15, 16, 17, data.finished_count]}
        />
        <StatCard
          label="Avg Score"
          value={data.avg_score.toFixed(1)}
          caption="Rata-rata nilai dari attempt selesai."
          icon={<ArrowUpRight size={20} />}
          accent="primary"
          trend={7}
          sparkData={[78, 80, 82, 82, 84, 85, 87, data.avg_score]}
        />
        <StatCard
          label="Upcoming"
          value={upcomingRows.length}
          caption="Ujian mendatang yang terjadwal."
          icon={<BookOpen size={20} />}
          accent="info"
          trend={0}
        />
      </section>

      {/* Primary Grid: Upcoming + Recent */}
      <section className="dashboard-grid">
        <CompactListCard
          eyebrow="Primary View"
          title="Upcoming Exams"
          description="Ujian mendatang yang sudah dijadwalkan untukmu."
          emptyLabel="Belum ada ujian mendatang."
          items={upcomingRows.map((item) => ({
            id: item.id,
            title: item.title,
            meta: formatDate(item.start_at),
            trailing: item.end_at ? `Tutup ${formatDate(item.end_at)}` : "Window belum lengkap",
          }))}
        />
        <CompactListCard
          eyebrow="Primary View"
          title="Recent Results"
          description="Hasil terbaru dari ujian yang sudah kamu selesaikan."
          emptyLabel="Belum ada hasil ujian."
          items={recentRows.map((item) => ({
            id: item.id,
            title: item.exam_title,
            meta: item.finished_at ? `Selesai ${formatDateTime(item.finished_at)}` : "Belum selesai",
            status: <StatusBadge value={item.status} />,
            trailing: `${item.score.toFixed(2)}`,
          }))}
        />
      </section>

      {/* Secondary Grid: Table + Leaderboard */}
      <section className="dashboard-grid">
        <DataTable
          title="Hasil Detail"
          rows={recentRows}
          columns={[
            { key: "exam_title", header: "Exam", render: (row) => row.exam_title },
            { key: "status", header: "Status", render: (row) => <StatusBadge value={row.status} /> },
            { key: "score", header: "Score", render: (row) => row.score.toFixed(2) },
            { key: "finished_at", header: "Selesai", render: (row) => formatDateTime(row.finished_at) },
          ]}
          emptyLabel="Belum ada hasil ujian."
        />
        <LeaderboardCard />
      </section>
    </>
  );
}

// ─── MAIN DashboardPanel ─────────────────────────────────────────────────────

export function DashboardPanel() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const activeTenantId = useUiStore((state) => state.activeTenantId);
  const setActiveTenantId = useUiStore((state) => state.setActiveTenantId);

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", user?.role],
    queryFn: () => analyticsApi.summary(),
    enabled: !!user && user.role !== "super_admin",
    refetchInterval: 30_000,
  });

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats-dashboard", user?.role],
    queryFn: () => analyticsApi.stats(),
    enabled: user?.role === "admin",
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const tenantsQuery = useQuery({
    queryKey: ["dashboard-platform-tenants"],
    queryFn: () => tenantApi.list({ page: 1, page_size: 12, search: "" }),
    enabled: user?.role === "super_admin",
    refetchInterval: 30_000,
  });

  // ── Loading
  if (
    (user?.role !== "super_admin" && summaryQuery.isLoading) ||
    (user?.role === "super_admin" && tenantsQuery.isLoading)
  ) {
    return <DashboardSkeleton />;
  }

  // ── Error
  const errorQuery = user?.role === "super_admin" ? tenantsQuery : summaryQuery;
  if (errorQuery.isError) {
    return (
      <DashboardError
        message={errorMessageForCode(
          (errorQuery.error as any)?.response?.data?.error,
          {},
          "Terjadi kesalahan saat memuat dashboard. Silakan coba lagi.",
        )}
      />
    );
  }

  // ── Render
  return (
    <section className="panel-grid dashboard-shell" data-tour="dashboard">
      <CorePageTour
        page="dashboard"
        title="Mulai dari Dashboard"
        description="Dashboard merangkum performa tenant aktif dan membantu validasi cepat setelah publish ujian."
        bullets={[
          "Pantau metrik utama dan trend 7 hari tanpa pindah halaman.",
          "Gunakan struktur yang sama untuk seluruh role supaya navigasi tetap familiar.",
          "Dashboard ini adalah langkah pertama pada tour beta Sprint 12.",
        ]}
      />

      {user?.role === "super_admin" ? (
        <SuperAdminDashboard
          rows={tenantsQuery.data?.data ?? []}
          activeTenantId={activeTenantId}
          onOpenTenants={() => navigate({ to: "/app/platform/tenants" })}
          onClearScope={() => setActiveTenantId(null)}
        />
      ) : user?.role === "siswa" ? (
        summaryQuery.data?.role === "siswa" ? (
          <StudentDashboard
            data={summaryQuery.data as DashboardSiswaSummaryDto}
            onOpenExams={() => navigate({ to: "/app/my-exams" })}
            onOpenCertificates={() => navigate({ to: "/app/my-certificates" })}
          />
        ) : null
      ) : summaryQuery.data?.role === "admin" || summaryQuery.data?.role === "guru" ? (
        <AdminGuruDashboard
          data={summaryQuery.data}
          stats={statsQuery.data}
          onOpenPrimary={() =>
            navigate({ to: summaryQuery.data?.role === "admin" ? "/app/reports" : "/app/exams" })
          }
          onOpenSecondary={() =>
            navigate({ to: summaryQuery.data?.role === "admin" ? "/app/users" : "/app/question-bank" })
          }
          onNavigateAI={() => navigate({ to: "/app/exams" })}
        />
      ) : null}
    </section>
  );
}
