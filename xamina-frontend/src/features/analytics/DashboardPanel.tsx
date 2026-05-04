import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import Chart from "chart.js/auto";
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  Crown,
  Medal,
  ShieldCheck,
  Trophy,
  Users,
  Wand2,
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
  StudentRecentResultDto,
  StudentUpcomingExamDto,
  TenantDto,
  TopScorerDto,
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
    card: styles.getPropertyValue("--card").trim() || "#fff",
  };
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "Not scheduled";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" }) : "-";
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
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const palette = readChartPalette();
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    // Parse the primary color to rgb for rgba usage if it's hex
    const isHex = palette.primary.startsWith('#');
    let r = 255, g = 107, b = 0;
    if (isHex && palette.primary.length === 7) {
      r = parseInt(palette.primary.slice(1, 3), 16);
      g = parseInt(palette.primary.slice(3, 5), 16);
      b = parseInt(palette.primary.slice(5, 7), 16);
    }

    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: points.map((item) => item.day),
        datasets: [
          {
            label: "Submissions",
            data: points.map((item) => item.submissions),
            borderColor: palette.primary,
            backgroundColor: gradient,
            fill: true,
            tension: 0.4, // smooth curve
            pointBackgroundColor: palette.primary,
            pointBorderColor: palette.card,
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: "y",
            borderWidth: 2.5,
          },
          {
            label: "Pass Rate (%)",
            data: points.map((item) => item.pass_rate),
            borderColor: palette.success,
            backgroundColor: "transparent",
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: palette.success,
            yAxisID: "y1",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: {
              color: palette.textMuted,
              usePointStyle: true,
              boxWidth: 6,
              font: { weight: "bold", size: 11, family: "'Plus Jakarta Sans', sans-serif" }
            }
          },
          tooltip: {
            backgroundColor: "rgba(10, 8, 6, 0.85)",
            padding: 14,
            titleFont: { size: 14, weight: "bold", family: "'Plus Jakarta Sans', sans-serif" },
            bodyFont: { size: 13, family: "'Plus Jakarta Sans', sans-serif" },
            cornerRadius: 12,
            displayColors: true,
            usePointStyle: true,
            boxPadding: 6,
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            // @ts-ignore
            backdropFilter: "blur(8px)",
          }
        },
        scales: {
          x: { 
            ticks: { color: palette.textMuted, font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" } }, 
            grid: { display: false } 
          },
          y: {
            beginAtZero: true,
            position: "left",
            ticks: { color: palette.textMuted, font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" } },
            grid: { color: "rgba(150,150,150,0.1)" },
            border: { display: false, dash: [4, 4] }
          },
          y1: {
            beginAtZero: true,
            position: "right",
            min: 0,
            max: 100,
            ticks: { display: false },
            grid: { display: false },
            border: { display: false }
          },
        },
      },
    });
    return () => chart.destroy();
  }, [points, themeMode]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card dashboard-card-fill glass"
      style={{ overflow: "hidden", padding: 0 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border)", marginBottom: 0 }}>
        <div>
          <p className="section-eyebrow" style={{ marginBottom: 4 }}>Performance Trend</p>
          <h3 className="section-title-sm">{title}</h3>
        </div>
        <span className="pill badge-green" style={{ fontSize: 9 }}>
          <ArrowUpRight size={11} /> LIVE
        </span>
      </div>
      <div style={{ padding: "20px 24px", height: 320 }}>
        <canvas ref={canvasRef} />
      </div>
    </motion.section>
  );
}

// ─── DashboardGreeting (shared for all roles) ────────────────────────────────

function DashboardGreeting(props: {
  title: string;
  sub: string;
  badge?: string;
  actions?: Array<{ label: string; variant?: "ghost"; icon?: ReactNode; onClick: () => void }>;
}) {
  return (
    <div className="dashboard-hero-main">
      <div className="page-hero-copy">
        <motion.h2
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          className="section-title"
        >
          {props.title}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="section-desc"
        >
          {props.sub}
        </motion.p>
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15 }}
        className="row gap-sm dashboard-hero-actions page-actions"
      >
        {props.badge && (
          <span className="pill badge-orange">{props.badge}</span>
        )}
        {props.actions?.map((a) => (
          <button
            key={a.label}
            className={a.variant === "ghost" ? "btn btn-ghost" : "btn btn-primary"}
            onClick={a.onClick}
          >
            {a.icon}{a.label}
          </button>
        ))}
      </motion.div>
    </div>
  );
}

// ─── DashboardHero (section card wrapper for hero) ───────────────────────────

function DashboardHero(props: { children: ReactNode }) {
  return (
    <section className="card dashboard-hero page-hero bg-gradient-to-br from-[var(--surface-1)] to-[var(--surface-2)]">
      {props.children}
    </section>
  );
}

// ─── AdminPulseCard ────────────────────────────────────────────────────────────

function AdminPulseCard({
  totalUsers,
  totalExams,
  totalSubmissions,
  trendDays,
}: {
  totalUsers: number;
  totalExams: number;
  totalSubmissions: number;
  trendDays: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{
        background: "linear-gradient(145deg, var(--bg-1) 0%, var(--card) 100%)",
        border: "1px solid var(--primary-border)",
        boxShadow: "var(--shadow-sm)",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Decorative background element */}
      <div
        style={{
          position: "absolute",
          top: -50,
          right: -50,
          width: 150,
          height: 150,
          background: "radial-gradient(circle, var(--info) 0%, transparent 70%)",
          opacity: 0.1,
          borderRadius: "50%",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p className="section-eyebrow">Platform Overview</p>
            <h3 className="section-title-sm" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              Institutional Pulse
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-info opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-info" />
              </span>
            </h3>
            <p className="state-text mt-1">Real-time capacity and engagement across your institution.</p>
          </div>
          <div
            style={{
              background: "var(--info-bg)",
              color: "var(--info)",
              padding: "10px 16px",
              borderRadius: 14,
              fontWeight: 900,
              fontSize: 26,
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              border: "1px solid color-mix(in srgb, var(--info) 20%, transparent)",
            }}
          >
            {totalUsers} <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Active Users</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: "auto" }}>
          {/* Metric 1 */}
          <div style={{ background: "var(--bg-0)", padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
            <p className="state-text font-bold mb-3 flex items-center gap-2 text-primary">
              <ClipboardList size={16} /> Total Exams
            </p>
            <div className="flex items-end gap-2">
              <strong className="text-3xl font-black text-primary leading-none">{totalExams}</strong>
              <span className="state-text font-medium text-primary/80 mb-1">created</span>
            </div>
          </div>

          {/* Metric 2 */}
          <div style={{ background: "var(--bg-0)", padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
            <p className="state-text font-bold mb-3 flex items-center gap-2 text-info">
              <ArrowUpRight size={16} /> Submission Volume
            </p>
            <div className="flex items-end gap-2">
              <strong className="text-3xl font-black text-info leading-none">{totalSubmissions}</strong>
              <span className="state-text font-medium text-info/80 mb-1">completed</span>
            </div>
          </div>

          {/* Metric 3 */}
          <div style={{ background: "var(--bg-0)", padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
            <p className="state-text font-bold mb-3 flex items-center gap-2 text-violet">
              <CalendarClock size={16} /> Trend Data
            </p>
            <div className="flex items-end gap-2">
              <strong className="text-3xl font-black text-violet leading-none">{trendDays}</strong>
              <span className="state-text font-medium text-violet/80 mb-1">days available</span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ─── TeachingPulseCard ─────────────────────────────────────────────────────────

function TeachingPulseCard({
  totalExams,
  publishedExams,
  totalSubmissions,
  trendDays,
}: {
  totalExams: number;
  publishedExams: number;
  totalSubmissions: number;
  trendDays: number;
}) {
  const publishRatio = totalExams > 0 ? Math.round((publishedExams / totalExams) * 100) : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{
        background: "linear-gradient(145deg, var(--bg-1) 0%, var(--card) 100%)",
        border: "1px solid var(--primary-border)",
        boxShadow: "var(--shadow-sm)",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Decorative background element */}
      <div
        style={{
          position: "absolute",
          top: -50,
          right: -50,
          width: 150,
          height: 150,
          background: "radial-gradient(circle, var(--primary-3) 0%, transparent 70%)",
          opacity: 0.15,
          borderRadius: "50%",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p className="section-eyebrow">Operational Focus</p>
            <h3 className="section-title-sm" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              Teaching Pulse
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
              </span>
            </h3>
            <p className="state-text mt-1">Real-time status of your active exams and engagement.</p>
          </div>
          <div
            style={{
              background: "var(--primary-bg)",
              color: "var(--primary)",
              padding: "10px 16px",
              borderRadius: 14,
              fontWeight: 900,
              fontSize: 26,
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              border: "1px solid var(--primary-border)",
            }}
          >
            {totalExams} <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Total Exams</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: "auto" }}>
          {/* Metric 1 */}
          <div style={{ background: "var(--bg-0)", padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
            <p className="state-text font-bold mb-3 flex items-center gap-2 text-success">
              <Zap size={16} /> Published Ratio
            </p>
            <div className="flex items-end gap-2 mb-3">
              <strong className="text-3xl font-black text-success leading-none">{publishRatio}%</strong>
              <span className="state-text font-medium text-success/80 mb-1">{publishedExams} active</span>
            </div>
            <div className="progress-bar" style={{ height: 6, background: "var(--success-bg)" }}>
              <div style={{ width: `${publishRatio}%`, background: "var(--success)" }} />
            </div>
          </div>

          {/* Metric 2 */}
          <div style={{ background: "var(--bg-0)", padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
            <p className="state-text font-bold mb-3 flex items-center gap-2 text-info">
              <ArrowUpRight size={16} /> Submission Volume
            </p>
            <div className="flex items-end gap-2">
              <strong className="text-3xl font-black text-info leading-none">{totalSubmissions}</strong>
              <span className="state-text font-medium text-info/80 mb-1">completed</span>
            </div>
          </div>

          {/* Metric 3 */}
          <div style={{ background: "var(--bg-0)", padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
            <p className="state-text font-bold mb-3 flex items-center gap-2 text-violet">
              <CalendarClock size={16} /> Trend Data
            </p>
            <div className="flex items-end gap-2">
              <strong className="text-3xl font-black text-violet leading-none">{trendDays}</strong>
              <span className="state-text font-medium text-violet/80 mb-1">days available</span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ─── TopScorersCard (Podium) ─────────────────────────────────────────────────

const PODIUM_CONFIG = [
  {
    rank: 1,
    emoji: "🥇",
    gradient: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
    shadow: "0 4px 24px rgba(255, 215, 0, 0.25)",
    border: "rgba(255, 215, 0, 0.4)",
    bg: "rgba(255, 215, 0, 0.08)",
    icon: Crown,
    label: "1st",
  },
  {
    rank: 2,
    emoji: "🥈",
    gradient: "linear-gradient(135deg, #C0C0C0 0%, #A8A8A8 100%)",
    shadow: "0 4px 20px rgba(192, 192, 192, 0.2)",
    border: "rgba(192, 192, 192, 0.35)",
    bg: "rgba(192, 192, 192, 0.06)",
    icon: Medal,
    label: "2nd",
  },
  {
    rank: 3,
    emoji: "🥉",
    gradient: "linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)",
    shadow: "0 4px 20px rgba(205, 127, 50, 0.2)",
    border: "rgba(205, 127, 50, 0.3)",
    bg: "rgba(205, 127, 50, 0.06)",
    icon: Medal,
    label: "3rd",
  },
];

function TopScorersCard({ scorers }: { scorers: TopScorerDto[] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="card glass"
      style={{ overflow: "hidden", padding: 0, height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <p className="section-eyebrow" style={{ marginBottom: 4 }}>
            Leaderboard
          </p>
          <h3 className="section-title-sm">Top 3 Performers</h3>
        </div>
        <span className="pill badge-green" style={{ fontSize: 9 }}>
          <ArrowUpRight size={11} /> LIVE
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: scorers.length >= 3 ? "1fr 1fr 1fr" : `repeat(${scorers.length}, 1fr)`,
          gap: 16,
          padding: "20px 24px",
          flex: 1,
          alignItems: "end",
        }}
      >
        {scorers.map((scorer, index) => {
          const config = PODIUM_CONFIG[index] ?? PODIUM_CONFIG[2];
          const IconComp = config.icon;
          return (
            <motion.div
              key={scorer.student_id + scorer.exam_title}
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.12 }}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                padding: "24px 16px 20px",
                borderRadius: 16,
                background: config.bg,
                border: `1px solid ${config.border}`,
                boxShadow: config.shadow,
                transition: "transform 0.25s ease, box-shadow 0.25s ease",
                cursor: "default",
              }}
              whileHover={{ y: -4, boxShadow: config.shadow.replace("0.2", "0.4").replace("0.25", "0.45") }}
            >
              {/* Rank badge */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: config.gradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 2px 12px rgba(0,0,0,0.15)`,
                }}
              >
                <IconComp size={20} color="#fff" strokeWidth={2.5} />
              </div>

              {/* Avatar */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--bg-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-1)",
                  border: "2px solid var(--border)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
              >
                {scorer.student_name.charAt(0).toUpperCase()}
              </div>

              {/* Name */}
              <strong
                style={{
                  fontSize: 14,
                  textAlign: "center",
                  lineHeight: 1.3,
                  color: "var(--text-0)",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {scorer.student_name}
              </strong>

              {/* Score */}
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  background: config.gradient,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  lineHeight: 1,
                }}
              >
                {scorer.score.toFixed(1)}
              </div>

              {/* Exam title */}
              <p
                className="state-text"
                style={{
                  fontSize: 11,
                  textAlign: "center",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginTop: -4,
                }}
              >
                {scorer.exam_title}
              </p>

              {/* Rank label */}
              <span
                className="pill"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: config.gradient,
                  color: "#fff",
                  border: "none",
                  padding: "2px 10px",
                }}
              >
                {config.emoji} {config.label}
              </span>
            </motion.div>
          );
        })}
      </div>
      {scorers.length === 0 && (
        <div style={{ padding: "32px 24px", textAlign: "center" }}>
          <Trophy size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p className="state-text">No scores available yet.</p>
        </div>
      )}
    </motion.section>
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
    <section className="card dashboard-card-fill glass hover:border-[var(--primary-border)] transition-colors duration-300">
      <p className="section-eyebrow">{eyebrow}</p>
      <h3 className="section-title-sm">{title}</h3>
      <p className="state-text">{description}</p>
      <div className="dashboard-list mt-4">
        {items.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-2)] flex items-center justify-center text-[var(--text-3)] mb-3">
              <ClipboardList size={24} />
            </div>
            <p className="state-text">{emptyLabel}</p>
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className="dashboard-list-card hover:-translate-y-0.5 transition-transform">
            <div className="dashboard-list-head">
              <strong className="text-[var(--text-0)]">{item.title}</strong>
              {item.status ?? (item.trailing ? <span className="pill p-neu">{item.trailing}</span> : null)}
            </div>
            <p className="state-text mt-1">{item.meta}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─── DashboardSkeleton / Error ────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <section className="panel-grid dashboard-shell">
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
    </section>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <section className="panel-grid dashboard-shell">
      <section className="card surface-muted accent">
        <p className="section-eyebrow">Dashboard State</p>
        <h3 className="section-title-sm">Failed to load dashboard</h3>
        <p className="state-text error">{message}</p>
      </section>
    </section>
  );
}

// ─── SUPER ADMIN DASHBOARD ───────────────────────────────────────────────────

function AiUsageCard({ usageRows }: { usageRows: TenantUsageRow[] }) {
  const totalAiUsed = usageRows.reduce((acc, row) => acc + row.ai_credits_used, 0);
  const totalAiQuota = usageRows.reduce((acc, row) => acc + row.ai_credits_quota, 0);
  const pct = totalAiQuota > 0 ? Math.round((totalAiUsed / totalAiQuota) * 100) : 0;

  return (
    <div className="dash-ai-usage-card hover:scale-[1.02] transition-transform h-full">
      <p className="dash-ai-kicker">Platform AI Usage</p>
      <p className="dash-ai-value">{totalAiUsed.toLocaleString("en-US")}</p>
      <p className="dash-ai-desc">Total AI credits consumed across all active tenants.</p>
      <div className="progress-bar mt-4">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="dash-activity-time mt-2">{pct}% of platform limit ({totalAiQuota.toLocaleString("en-US")} total)</p>
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

  // Real data for watchlists
  const watchlistRows = [...usageRows].sort((a, b) => b.usage_pct - a.usage_pct).slice(0, 5);

  return (
    <>
      <DashboardHero>
        <DashboardGreeting
          title="Platform Overview 🛡️"
          sub={
            activeTenantId
              ? `Active tenant scope: ${activeTenantId.slice(0, 8)}... · Global dashboard remains available.`
              : `${rows.length} registered tenants · ${activeTenants} active · ${new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
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
              ? `Scoped to tenant ${activeTenantId.slice(0, 8)}. Dashboard reads global overview from /platform/tenants.`
              : "No active tenant scope. Viewing global platform metrics."}
          </p>
        </div>
      </DashboardHero>

      <section className="metric-grid">
        <StatCard
          label="Total Tenants"
          value={usageRows.length}
          caption="Registered on platform."
          icon={<Building2 size={20} />}
          accent="violet"
          className="stat-card-hoverable"
          delay={0.1}
        />
        <StatCard
          label="Active Tenants"
          value={activeTenants}
          caption="Operational tenants."
          icon={<ShieldCheck size={20} />}
          accent="success"
          className="stat-card-hoverable"
          delay={0.2}
        />
        <StatCard
          label="Platform Users"
          value={totalUsers.toLocaleString("en-US")}
          caption={`${totalUsersQuota.toLocaleString("en-US")} available quota.`}
          icon={<Users size={20} />}
          accent="info"
          progress={totalUsersQuota > 0 ? (totalUsers / totalUsersQuota) * 100 : 0}
          className="stat-card-hoverable"
          delay={0.3}
        />
        <StatCard
          label="AI Credits Used"
          value={totalAiUsed.toLocaleString("en-US")}
          caption={`${totalAiQuota.toLocaleString("en-US")} credit limit.`}
          icon={<BrainCircuit size={20} />}
          accent="warning"
          progress={totalAiQuota > 0 ? (totalAiUsed / totalAiQuota) * 100 : 0}
          className="stat-card-hoverable"
          delay={0.4}
        />
      </section>

      <section className="dashboard-grid">
        <section className="card glass hover:border-[var(--primary-border)] transition-colors duration-300">
          <p className="section-eyebrow">Tenant Overview</p>
          <h3 className="section-title-sm">Active Organizations</h3>
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
                    title={row.is_active ? "Active" : "Inactive"}
                  />
                </div>
              </div>
            ))}
            {usageRows.length === 0 && (
              <div className="py-8 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-2)] flex items-center justify-center text-[var(--text-3)] mb-3">
                  <Building2 size={24} />
                </div>
                <p className="state-text">No tenants registered yet.</p>
              </div>
            )}
          </div>
        </section>

        <div className="panel-grid">
          <AiUsageCard usageRows={usageRows} />
        </div>
      </section>

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
          emptyLabel="No tenants on watchlist."
        />
      </section>
    </>
  );
}

// ─── ADMIN/GURU COMBINED DASHBOARD ───────────────────────────────────────────

function AiBannerAdmin({ onAction }: { onAction: () => void }) {
  return (
    <div className="dash-banner dash-banner-admin hover:-translate-y-1 transition-transform cursor-pointer" onClick={onAction}>
      <div className="dash-banner-icon bg-white/20">
        <Wand2 size={24} className="animate-pulse" />
      </div>
      <div className="dash-banner-copy" style={{ flex: 1 }}>
        <p className="dash-banner-kicker">🛡️ Institutional Management</p>
        <h3 className="dash-banner-title text-2xl font-black">Generate smart reports and manage your organization</h3>
        <p className="dash-banner-desc font-medium">Full diagnostic control over users, classes, and exams</p>
      </div>
      <button className="dash-banner-btn shadow-lg">
        Create New Exam →
      </button>
    </div>
  );
}

function AiBannerGuru({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="dash-banner dash-banner-guru hover:-translate-y-1 transition-transform cursor-pointer" onClick={onGenerate}>
      <div className="dash-banner-icon bg-white/20">
        <Wand2 size={24} className="animate-pulse" />
      </div>
      <div className="dash-banner-copy" style={{ flex: 1 }}>
        <p className="dash-banner-kicker">✨ AI Assistant</p>
        <h3 className="dash-banner-title text-2xl font-black">Generate questions with AI</h3>
        <p className="dash-banner-desc font-medium">Create and manage your exams faster with smart AI assistance</p>
      </div>
      <button className="dash-banner-btn shadow-lg">
        Generate Question →
      </button>
    </div>
  );
}

function AdminGuruDashboard({
  data,
  onNavigateAI,
}: {
  data: DashboardAdminSummaryDto | DashboardGuruSummaryDto;
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
      {isAdmin ? (
        <AiBannerAdmin onAction={onNavigateAI} />
      ) : (
        <AiBannerGuru onGenerate={onNavigateAI} />
      )}

      <section className="metric-grid" style={{ marginTop: 18 }}>
        <StatCard
          label="Submissions"
          value={data.submissions_total}
          caption="Completed assessments."
          icon={<ArrowUpRight size={20} />}
          accent="teal"
          className="stat-card-hoverable"
          delay={0.3}
        />
        <StatCard
          label="Avg Score"
          value={data.avg_score.toFixed(1)}
          caption="Avg exam performance."
          icon={<Trophy size={20} />}
          accent="warning"
          className="stat-card-hoverable"
          delay={0.4}
        />
        <StatCard
          label="Pass Rate"
          value={`${data.pass_rate.toFixed(1)}%`}
          caption="Overall success rate."
          icon={<ShieldCheck size={20} />}
          accent="success"
          className="stat-card-hoverable"
          delay={0.5}
        />
      </section>

      <section className="dashboard-grid" style={{ marginTop: 18 }}>
        <TopScorersCard scorers={data.top_scorers ?? []} />
        {isAdmin ? (
          <AdminPulseCard
            totalUsers={data.users_total}
            totalExams={adminData.exams_total}
            totalSubmissions={data.submissions_total}
            trendDays={trendRows.length}
          />
        ) : (
          <TeachingPulseCard
            totalExams={guruExam}
            publishedExams={guruPublished}
            totalSubmissions={data.submissions_total}
            trendDays={trendRows.length}
          />
        )}
      </section>

      <section className="dashboard-grid" style={{ marginTop: 18 }}>
        <TrendChart
          title={isAdmin ? "Tenant 7-Day Trend" : "Teacher 7-Day Trend"}
          points={data.trend_7d}
        />
        <DataTable
          title="Performance Detail"
          rows={trendRows}
          columns={[
            { key: "day", header: "Date", render: (row) => row.day },
            { key: "submissions", header: "Submissions", render: (row) => row.submissions },
            { key: "avg_score", header: "Avg Score", render: (row) => row.avg_score.toFixed(2) },
            { key: "pass_rate", header: "Pass Rate (%)", render: (row) => row.pass_rate.toFixed(2) },
          ]}
          emptyLabel="No 7-day trend data available."
        />
      </section>
    </>
  );
}

// ─── STUDENT DASHBOARD ───────────────────────────────────────────────────────

function UrgentExamBanner({ exam }: { exam: { title: string; meta: string } | null }) {
  if (!exam) return null;
  return (
    <div className="dash-banner dash-banner-urgent hover:-translate-y-1 transition-transform cursor-pointer">
      <div className="dash-banner-icon bg-white/20">
        <Clock size={24} className="animate-pulse" />
      </div>
      <div className="dash-banner-copy" style={{ flex: 1 }}>
        <p className="dash-banner-kicker">⚠️ Upcoming Exam!</p>
        <h3 className="dash-banner-title text-2xl font-black">{exam.title}</h3>
        <p className="dash-banner-desc font-medium">{exam.meta}</p>
      </div>
      <button className="dash-banner-btn shadow-lg">Enter Exam →</button>
    </div>
  );
}

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

  const urgentExam = upcomingRows
    .filter((r) => r.start_at && new Date(r.start_at).getTime() - Date.now() < 48 * 60 * 60 * 1000)
    .at(0);

  const urgentBanner = urgentExam
    ? { title: urgentExam.title, meta: `Starts ${formatDate(urgentExam.start_at)} · Prepare yourself!` }
    : null;

  return (
    <>
      <DashboardHero>
        <DashboardGreeting
          title="Hello, Welcome! 🎓"
          sub="Digital Assessment Platform"
          actions={[
            { label: "Certificates", variant: "ghost", onClick: onOpenCertificates },
            { label: "My Exams →", onClick: onOpenExams },
          ]}
        />
      </DashboardHero>

      <UrgentExamBanner exam={urgentBanner} />

      <section className="metric-grid">
        <StatCard
          label="In Progress"
          value={data.in_progress_count}
          caption="Exams you can resume."
          icon={<CalendarClock size={20} />}
          accent="warning"
          className="stat-card-hoverable"
        />
        <StatCard
          label="Finished"
          value={data.finished_count}
          caption="Completed assessments."
          icon={<Trophy size={20} />}
          accent="success"
          className="stat-card-hoverable"
        />
        <StatCard
          label="Avg Score"
          value={data.avg_score.toFixed(1)}
          caption="Average from finished attempts."
          icon={<ArrowUpRight size={20} />}
          accent="primary"
          className="stat-card-hoverable"
        />
        <StatCard
          label="Upcoming"
          value={upcomingRows.length}
          caption="Scheduled future exams."
          icon={<BookOpen size={20} />}
          accent="info"
          className="stat-card-hoverable"
        />
      </section>

      <section className="dashboard-grid">
        <CompactListCard
          eyebrow="Primary View"
          title="Upcoming Exams"
          description="Exams that have been scheduled for you."
          emptyLabel="No upcoming exams."
          items={upcomingRows.map((item) => ({
            id: item.id,
            title: item.title,
            meta: formatDate(item.start_at),
            trailing: item.end_at ? `Closes ${formatDate(item.end_at)}` : "Open window",
          }))}
        />
        <CompactListCard
          eyebrow="Primary View"
          title="Recent Results"
          description="Latest scores from your completed exams."
          emptyLabel="No recent results."
          items={recentRows.map((item) => ({
            id: item.id,
            title: item.exam_title,
            meta: item.finished_at ? `Finished ${formatDateTime(item.finished_at)}` : "Not finished",
            status: <StatusBadge value={item.status} />,
            trailing: `${item.score.toFixed(2)}`,
          }))}
        />
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
          "An error occurred while loading the dashboard. Please try again.",
        )}
      />
    );
  }

  // ── Render
  return (
    <section className="panel-grid dashboard-shell" data-tour="dashboard">
      <CorePageTour
        page="dashboard"
        title="Start from the Dashboard"
        description="The dashboard summarizes active tenant performance and helps validate operations."
        bullets={[
          "Monitor key metrics and 7-day trends without navigating away.",
          "Consistent structure across all roles ensures familiar navigation.",
          "This is the first step in the beta tour.",
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
          onNavigateAI={() => navigate({ to: "/app/exams" })}
        />
      ) : null}
    </section>
  );
}
