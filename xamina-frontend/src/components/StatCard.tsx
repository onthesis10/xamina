import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  caption?: string;
  icon?: ReactNode;
  accent?: "primary" | "success" | "warning" | "info" | "violet" | "teal";
  progress?: number;
  trend?: number; // positive = up (good), negative = down
  sparkData?: number[]; // 8 data points for mini sparkline
  className?: string;
}

const ACCENT_STYLES: Record<NonNullable<StatCardProps["accent"]>, { bg: string; fg: string }> = {
  primary: { bg: "var(--primary-bg)", fg: "var(--primary)" },
  success: { bg: "var(--success-bg)", fg: "var(--success)" },
  warning: { bg: "var(--warning-bg)", fg: "var(--warning)" },
  info: { bg: "var(--info-bg)", fg: "var(--info)" },
  violet: { bg: "var(--violet-bg)", fg: "var(--violet)" },
  teal: { bg: "var(--teal-bg)", fg: "var(--teal)" },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 72;
  const height = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(" ");

  // Area fill
  const firstX = 0;
  const lastX = width;
  const areaPath = `M${firstX},${height} L${data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(" L")} L${lastX},${height} Z`;

  return (
    <svg
      className="stat-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-fill-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        fill={`url(#spark-fill-${color.replace(/[^a-z0-9]/gi, "")})`}
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
      {/* Last point dot */}
      {data.length > 0 && (
        <circle
          cx={(data.length - 1) / (data.length - 1) * width}
          cy={height - ((data[data.length - 1] - min) / range) * height}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}

function TrendArrow({ up }: { up: boolean }) {
  return up ? (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
      <polyline points="1,7 4.5,2 8,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
      <polyline points="1,2 4.5,7 8,2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
}: StatCardProps) {
  const accentStyle = ACCENT_STYLES[accent];
  const hasTrend = typeof trend === "number";
  const isUp = hasTrend && trend >= 0;
  const sparkColor = accentStyle.fg;

  return (
    <section className={`card stat-card stat-card-hoverable${className ? ` ${className}` : ""}`}>
      <div className="stat-card-head">
        <div>
          <p className="stat-label">{label}</p>
          <h3 className="metric-value">{value}</h3>
        </div>
        {icon ? (
          <div className="stat-icon" style={{ background: accentStyle.bg, color: accentStyle.fg }}>
            {icon}
          </div>
        ) : null}
      </div>

      {caption ? <p className="stat-trend">{caption}</p> : null}

      {/* Trend + Sparkline row */}
      {(hasTrend || sparkData) && (
        <div className="stat-trend-block">
          {hasTrend && (
            <span className={`stat-trend-badge ${isUp ? "up" : "down"}`}>
              <TrendArrow up={isUp} />
              {Math.abs(trend)}%
            </span>
          )}
          {sparkData && sparkData.length > 1 && (
            <Sparkline data={sparkData} color={sparkColor} />
          )}
        </div>
      )}

      {typeof progress === "number" ? (
        <div className="progress-bar stat-progress" aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
        </div>
      ) : null}
    </section>
  );
}
