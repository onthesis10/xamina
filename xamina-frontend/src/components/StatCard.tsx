import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  caption?: string;
  icon?: ReactNode;
  accent?: "primary" | "success" | "warning" | "info" | "violet" | "teal" | "danger";
  progress?: number;
  trend?: number; // positive = up (good), negative = down
  sparkData?: number[]; // points for mini sparkline
  className?: string;
  delay?: number;
}

const ACCENT_STYLES: Record<NonNullable<StatCardProps["accent"]>, { bg: string; fg: string }> = {
  primary: { bg: "var(--primary-bg)", fg: "var(--primary)" },
  success: { bg: "var(--success-bg)", fg: "var(--success)" },
  warning: { bg: "var(--warning-bg)", fg: "var(--warning)" },
  info: { bg: "var(--info-bg)", fg: "var(--info)" },
  violet: { bg: "var(--violet-bg)", fg: "var(--violet)" },
  teal: { bg: "var(--teal-bg)", fg: "var(--teal)" },
  danger: { bg: "var(--danger-bg)", fg: "var(--danger)" },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 80;
  const H = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(" ");
  const gradId = `sp-${color.replace(/[^a-z0-9]/gi, "")}-${Math.random().toString(36).slice(2, 5)}`;
  const areaPath = `M0,${H} L${data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(" L")} L${W},${H} Z`;

  return (
    <svg className="stat-sparkline" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
        d={areaPath}
        fill={`url(#${gradId})`}
      />
      <motion.polyline
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: "easeInOut" }}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  caption,
  icon,
  accent = "primary",
  progress,
  trend,
  sparkData,
  className,
  delay = 0,
}: StatCardProps) {
  const { bg, fg } = ACCENT_STYLES[accent];
  const hasTrend = typeof trend === "number";
  const isUp = hasTrend && trend >= 0;

  return (
    <motion.section
      className={`card stat-card ${className ?? ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: "easeOut" }}
    >
      <div className="stat-card-head">
        {/* Icon */}
        <div className="stat-icon" style={{ background: bg, color: fg }}>
          {icon}
        </div>

        {/* Trend badge */}
        {hasTrend && (
          <span className={`stat-trend ${isUp ? "up" : "down"}`}>
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      {/* Value */}
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value-lg" style={{ color: "var(--text-0)" }}>{value}</p>
        {caption && <p className="stat-trend" style={{ marginTop: 3, fontSize: 11, fontWeight: 500, color: "var(--text-2)", padding: 0, background: "none" }}>{caption}</p>}
      </div>

      {/* Sparkline */}
      {sparkData && sparkData.length > 1 && (
        <Sparkline data={sparkData} color={fg} />
      )}

      {/* Progress bar */}
      {typeof progress === "number" && (
        <div className="stat-progress">
          <div className="progress-bar">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
              transition={{ duration: 0.8, ease: "circOut", delay: delay + 0.3 }}
              style={{ background: fg }}
            />
          </div>
        </div>
      )}
    </motion.section>
  );
}
