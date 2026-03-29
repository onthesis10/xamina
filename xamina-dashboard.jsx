import { useState, useEffect } from "react";

// ─── ICONS (Lucide-style inline SVGs) ───────────────────────────────────────
const Icon = ({ name, size = 18, className = "" }) => {
  const icons = {
    sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
    layout: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    school: <><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></>,
    fileText: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    trendingUp: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
    checkCircle: <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    bookOpen: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    barChart: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    cpu: <><rect x="9" y="9" width="6" height="6"/><path d="M9 1v2M15 1v2M9 21v2M15 21v2M1 9h2M1 15h2M21 9h2M21 15h2"/><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></>,
    helpCircle: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    plusCircle: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    arrowUp: <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    arrowDown: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></>,
    pencil: <><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    messageSquare: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    logOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    menu: <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    chevronDown: <polyline points="6 9 12 15 18 9"/>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    edit3: <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>,
    repeat: <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>,
    hash: <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></>,
    percent: <><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
    flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>,
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      {icons[name] || null}
    </svg>
  );
};

// ─── LOGO ────────────────────────────────────────────────────────────────────
const XaminaLogo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="url(#logoGrad)"/>
    <path d="M11 11L20 20M20 20L29 11M20 20L11 29M20 20L29 29" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
    <circle cx="20" cy="20" r="3" fill="white" fillOpacity="0.9"/>
    <circle cx="11" cy="11" r="2.2" fill="white" fillOpacity="0.7"/>
    <circle cx="29" cy="11" r="2.2" fill="white" fillOpacity="0.7"/>
    <circle cx="11" cy="29" r="2.2" fill="white" fillOpacity="0.7"/>
    <circle cx="29" cy="29" r="2.2" fill="white" fillOpacity="0.7"/>
    <defs>
      <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF6B00"/>
        <stop offset="1" stopColor="#FF9A3C"/>
      </linearGradient>
    </defs>
  </svg>
);

// ─── THEME CONFIG ─────────────────────────────────────────────────────────────
const themes = {
  light: {
    bg: "#FFFBF7",
    bgSecondary: "#FFF4EA",
    bgCard: "#FFFFFF",
    bgSidebar: "#FFFFFF",
    bgCardHover: "#FFFBF7",
    border: "#F0E8DF",
    borderStrong: "#E5D8CC",
    text: "#1A0F00",
    textSecondary: "#7A5C42",
    textMuted: "#B59A84",
    primary: "#FF6B00",
    primaryLight: "#FFF0E6",
    primaryMid: "#FFD4B0",
    accent: "#FF9A3C",
    success: "#16A34A",
    successBg: "#DCFCE7",
    warning: "#D97706",
    warningBg: "#FEF3C7",
    danger: "#DC2626",
    dangerBg: "#FEE2E2",
    info: "#2563EB",
    infoBg: "#DBEAFE",
    violet: "#7C3AED",
    violetBg: "#EDE9FE",
    shadow: "0 1px 3px rgba(255,107,0,0.08), 0 4px 12px rgba(0,0,0,0.06)",
    shadowMd: "0 4px 20px rgba(255,107,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
    sidebarActive: "#FFF0E6",
    navHover: "#FFF7F0",
    inputBg: "#FFF7F0",
    badgeBg: "rgba(255,107,0,0.1)",
  },
  dark: {
    bg: "#0F0800",
    bgSecondary: "#170D02",
    bgCard: "#1C1004",
    bgSidebar: "#130B01",
    bgCardHover: "#221506",
    border: "#2A1A08",
    borderStrong: "#3D2810",
    text: "#FFF4EA",
    textSecondary: "#C4977A",
    textMuted: "#7A5438",
    primary: "#FF7A1A",
    primaryLight: "#261200",
    primaryMid: "#4A2000",
    accent: "#FFB060",
    success: "#34D399",
    successBg: "#052E16",
    warning: "#FBBF24",
    warningBg: "#1C0F00",
    danger: "#F87171",
    dangerBg: "#2D0000",
    info: "#60A5FA",
    infoBg: "#1E1B4B",
    violet: "#A78BFA",
    violetBg: "#2E1065",
    shadow: "0 1px 3px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)",
    shadowMd: "0 4px 20px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
    sidebarActive: "#261200",
    navHover: "#1C1004",
    inputBg: "#1C1004",
    badgeBg: "rgba(255,122,26,0.15)",
  }
};

// ─── ROLE CONFIG ──────────────────────────────────────────────────────────────
const roles = [
  { id: "superadmin", label: "Super Admin", color: "#7C3AED", icon: "shield" },
  { id: "admin", label: "Admin Sekolah", color: "#2563EB", icon: "school" },
  { id: "guru", label: "Guru", color: "#FF6B00", icon: "bookOpen" },
  { id: "siswa", label: "Siswa", color: "#16A34A", icon: "user" },
];

// ─── MINI BAR CHART ───────────────────────────────────────────────────────────
const MiniBarChart = ({ data, color, theme }) => {
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 36 }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, background: i === data.length - 1 ? color : themes[theme].borderStrong,
          borderRadius: 3, height: `${(v / max) * 100}%`,
          transition: "height 0.3s ease",
          opacity: i === data.length - 1 ? 1 : 0.5
        }} />
      ))}
    </div>
  );
};

// ─── MINI SPARKLINE ───────────────────────────────────────────────────────────
const Sparkline = ({ data, color, width = 80, height = 30 }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
};

// ─── DONUT CHART ─────────────────────────────────────────────────────────────
const DonutChart = ({ value, total, color, size = 56 }) => {
  const r = 20, circ = 2 * Math.PI * r;
  const pct = (value / total) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeWidth="5" opacity="0.12"/>
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${pct} ${circ}`} strokeDashoffset={circ * 0.25}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }}/>
      <text x="24" y="28" textAnchor="middle" fill={color} fontSize="11" fontWeight="700" fontFamily="DM Sans">
        {Math.round((value / total) * 100)}%
      </text>
    </svg>
  );
};

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
const Progress = ({ value, color, theme }) => (
  <div style={{ height: 6, background: themes[theme].border, borderRadius: 99, overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
  </div>
);

// ─── STAT CARD ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon, color, bg, trend, sparkData, theme }) => {
  const t = themes[theme];
  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16,
      padding: "18px 20px", boxShadow: t.shadow, transition: "all 0.2s",
      cursor: "default",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = t.shadowMd; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = t.shadow; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color }}>
          <Icon name={icon} size={18} />
        </div>
        {trend !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600,
            color: trend >= 0 ? t.success : t.danger }}>
            <Icon name={trend >= 0 ? "arrowUp" : "arrowDown"} size={12} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: t.text, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: sparkData ? 8 : 0 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 2 }}>{sub}</div>}
      {sparkData && <Sparkline data={sparkData} color={color} />}
    </div>
  );
};

// ─── AVATAR ──────────────────────────────────────────────────────────────────
const Avatar = ({ name, color, size = 34 }) => {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: color + "22",
      border: `2px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 700, color, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

// ─── BADGE ───────────────────────────────────────────────────────────────────
const Badge = ({ label, color, bg }) => (
  <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 99,
    background: bg, color, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
    {label}
  </span>
);

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const sidebarItems = {
  superadmin: [
    { icon: "layout", label: "Dashboard", active: true },
    { icon: "school", label: "Sekolah" },
    { icon: "users", label: "Pengguna" },
    { icon: "database", label: "Sistem" },
    { icon: "barChart", label: "Analitik" },
    { icon: "shield", label: "Keamanan" },
    { icon: "settings", label: "Pengaturan" },
  ],
  admin: [
    { icon: "layout", label: "Dashboard", active: true },
    { icon: "users", label: "Guru & Staf" },
    { icon: "hash", label: "Kelas" },
    { icon: "fileText", label: "Laporan" },
    { icon: "calendar", label: "Jadwal" },
    { icon: "bell", label: "Pengumuman" },
    { icon: "settings", label: "Pengaturan" },
  ],
  guru: [
    { icon: "layout", label: "Dashboard", active: true },
    { icon: "clipboard", label: "Bank Soal" },
    { icon: "zap", label: "Buat Ujian" },
    { icon: "barChart", label: "Hasil Ujian" },
    { icon: "users", label: "Siswa Saya" },
    { icon: "calendar", label: "Jadwal" },
    { icon: "settings", label: "Pengaturan" },
  ],
  siswa: [
    { icon: "layout", label: "Dashboard", active: true },
    { icon: "clipboard", label: "Ujian Saya" },
    { icon: "award", label: "Nilai" },
    { icon: "trophy", label: "Leaderboard" },
    { icon: "book", label: "Materi" },
    { icon: "calendar", label: "Jadwal" },
    { icon: "helpCircle", label: "Bantuan" },
  ],
};

// ─── SUPERADMIN DASHBOARD ────────────────────────────────────────────────────
const SuperAdminDashboard = ({ theme }) => {
  const t = themes[theme];
  const schools = [
    { name: "SMAN 1 Jakarta", students: 1240, exams: 34, active: true, plan: "Enterprise" },
    { name: "SMKN 2 Bandung", students: 890, exams: 21, active: true, plan: "Pro" },
    { name: "SMA Al-Azhar", students: 650, exams: 18, active: false, plan: "Starter" },
    { name: "SMAN 5 Surabaya", students: 1100, exams: 29, active: true, plan: "Pro" },
    { name: "SMK Telkom Medan", students: 420, exams: 11, active: true, plan: "Starter" },
  ];
  const systemHealth = [
    { label: "API Response", value: 98, color: t.success },
    { label: "Database", value: 100, color: t.success },
    { label: "AI Service", value: 94, color: t.warning },
    { label: "Storage", value: 72, color: t.primary },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
            Selamat pagi, Hendra 👋
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
            Platform overview — Rabu, 25 Februari 2026
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard,
            color: t.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="database" size={14} /> Export Data
          </button>
          <button style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: t.primary,
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="plusCircle" size={14} /> Tambah Sekolah
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <StatCard label="Total Sekolah" value="47" sub="3 sekolah baru bulan ini" icon="school" color={t.violet} bg={t.violetBg} trend={6} sparkData={[30,32,35,38,40,43,45,47]} theme={theme} />
        <StatCard label="Total Siswa" value="62.4K" sub="Aktif di platform" icon="users" color={t.primary} bg={t.primaryLight} trend={12} sparkData={[48,51,53,55,57,59,61,62.4]} theme={theme} />
        <StatCard label="Ujian Hari Ini" value="134" sub="Sedang berlangsung" icon="zap" color={t.success} bg={t.successBg} trend={8} sparkData={[80,95,100,110,115,125,130,134]} theme={theme} />
        <StatCard label="MRR" value="Rp 128M" sub="Dari 47 sekolah aktif" icon="trendingUp" color={t.warning} bg={t.warningBg} trend={18} sparkData={[85,90,95,100,108,115,122,128]} theme={theme} />
      </div>

      {/* Mid Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* Schools Table */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, overflow: "hidden", boxShadow: t.shadow }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Sekolah Aktif</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 10px" }}>
              <Icon name="search" size={13} style={{ color: t.textMuted }} />
              <span style={{ fontSize: 12, color: t.textMuted }}>Cari sekolah...</span>
            </div>
          </div>
          <div style={{ overflow: "hidden" }}>
            {schools.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: i < schools.length - 1 ? `1px solid ${t.border}` : "none",
                transition: "background 0.15s", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = t.navHover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <Avatar name={s.name} color={t.violet} size={36} />
                <div style={{ marginLeft: 12, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{s.students.toLocaleString()} siswa · {s.exams} ujian</div>
                </div>
                <Badge label={s.plan} color={s.plan === "Enterprise" ? t.violet : s.plan === "Pro" ? t.primary : t.textSecondary}
                  bg={s.plan === "Enterprise" ? t.violetBg : s.plan === "Pro" ? t.primaryLight : t.border} />
                <div style={{ marginLeft: 12, width: 8, height: 8, borderRadius: 4, background: s.active ? t.success : t.danger }} />
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Status Sistem</div>
            {systemHealth.map((item, i) => (
              <div key={i} style={{ marginBottom: i < systemHealth.length - 1 ? 14 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: t.textSecondary }}>{item.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.value}%</span>
                </div>
                <Progress value={item.value} color={item.color} theme={theme} />
              </div>
            ))}
          </div>

          <div style={{ background: `linear-gradient(135deg, ${t.primary}15, ${t.primary}05)`, border: `1px solid ${t.primary}22`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: t.primary, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>AI USAGE</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: t.text, marginBottom: 2 }}>2.4M</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>Token OpenAI bulan ini</div>
            <Progress value={64} color={t.primary} theme={theme} />
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>64% dari limit bulanan (Rp 5.8M)</div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Recent Activity */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Aktivitas Terbaru</div>
          {[
            { icon: "school", color: t.violet, text: "SMAN 3 Depok mendaftar paket Enterprise", time: "5 mnt lalu" },
            { icon: "users", color: t.success, text: "1,240 siswa berhasil login ujian nasional", time: "12 mnt lalu" },
            { icon: "zap", color: t.warning, text: "AI generate 450 soal baru untuk SMKN 7", time: "1 jam lalu" },
            { icon: "shield", color: t.danger, text: "Percobaan akses tidak sah terblokir (x3)", time: "2 jam lalu" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < 3 ? 12 : 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: item.color + "18", display: "flex", alignItems: "center", justifyContent: "center", color: item.color, flexShrink: 0 }}>
                <Icon name={item.icon} size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: t.text, lineHeight: 1.4 }}>{item.text}</div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{item.time}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Revenue Chart */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>Pendapatan 7 Hari</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 14 }}>Total Rp 128M ARR</div>
          <MiniBarChart data={[85, 92, 88, 95, 105, 110, 128]} color={t.primary} theme={theme} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Ming"].map(d => (
              <span key={d} style={{ fontSize: 10, color: t.textMuted }}>{d}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
const AdminDashboard = ({ theme }) => {
  const t = themes[theme];
  const upcomingExams = [
    { name: "UTS Matematika XII IPA", date: "Besok, 08.00", class: "XII IPA 1 & 2", students: 72, status: "ready" },
    { name: "Ujian Bahasa Inggris", date: "Kamis, 10.00", class: "XI IPS 1", students: 36, status: "draft" },
    { name: "UAS Kimia XII", date: "Jumat, 09.00", class: "XII IPA 1-3", students: 108, status: "ready" },
  ];
  const teachers = [
    { name: "Budi Santoso", subject: "Matematika", exams: 12, avgScore: 78, color: t.primary },
    { name: "Sari Dewi", subject: "Bahasa Inggris", exams: 8, avgScore: 82, color: t.info },
    { name: "Rudi Hartono", subject: "Kimia", exams: 15, avgScore: 74, color: t.success },
    { name: "Andi Pratama", subject: "Fisika", exams: 10, avgScore: 80, color: t.violet },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
            Dashboard Sekolah 🏫
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>SMAN 1 Jakarta · Semester Genap 2025/2026</div>
        </div>
        <button style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: t.primary,
          color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="fileText" size={14} /> Unduh Laporan
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <StatCard label="Total Siswa" value="1,240" icon="users" color={t.info} bg={t.infoBg} trend={3} theme={theme} />
        <StatCard label="Guru Aktif" value="52" icon="bookOpen" color={t.primary} bg={t.primaryLight} trend={0} theme={theme} />
        <StatCard label="Ujian Bulan Ini" value="34" icon="clipboard" color={t.success} bg={t.successBg} trend={15} theme={theme} />
        <StatCard label="Rata-rata Nilai" value="76.4" icon="target" color={t.warning} bg={t.warningBg} trend={4} theme={theme} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* Upcoming Exams */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Ujian Mendatang</div>
          {upcomingExams.map((exam, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderRadius: 12, marginBottom: 8, background: t.bgSecondary, border: `1px solid ${t.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3 }}>{exam.name}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: t.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name="calendar" size={11} />{exam.date}
                  </span>
                  <span style={{ fontSize: 11, color: t.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name="users" size={11} />{exam.students} siswa
                  </span>
                </div>
              </div>
              <Badge label={exam.status === "ready" ? "Siap" : "Draft"}
                color={exam.status === "ready" ? t.success : t.warning}
                bg={exam.status === "ready" ? t.successBg : t.warningBg} />
            </div>
          ))}
        </div>

        {/* Class Distribution */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Distribusi Kelas</div>
          {[
            { label: "Kelas X", value: 420, total: 1240, color: t.primary },
            { label: "Kelas XI", value: 390, total: 1240, color: t.info },
            { label: "Kelas XII", value: 430, total: 1240, color: t.success },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: i < 2 ? 14 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: t.text, fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: 12, color: t.textMuted }}>{item.value} siswa</span>
              </div>
              <Progress value={(item.value / item.total) * 100} color={item.color} theme={theme} />
            </div>
          ))}
          <div style={{ marginTop: 18, padding: "12px 14px", background: t.primaryLight, borderRadius: 10, border: `1px solid ${t.primary}22` }}>
            <div style={{ fontSize: 11, color: t.primary, fontWeight: 700, marginBottom: 2 }}>🎯 Target Semester</div>
            <div style={{ fontSize: 12, color: t.text }}>Rata-rata nilai ≥ 80 untuk semua kelas</div>
            <Progress value={76} color={t.primary} theme={theme} />
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>76% menuju target</div>
          </div>
        </div>
      </div>

      {/* Teachers Performance */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, overflow: "hidden", boxShadow: t.shadow }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Performa Guru</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
          {teachers.map((teacher, i) => (
            <div key={i} style={{ padding: "16px 20px", borderRight: i < 3 ? `1px solid ${t.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Avatar name={teacher.name} color={teacher.color} size={38} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{teacher.name}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{teacher.subject}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: teacher.color }}>{teacher.exams}</div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>Ujian</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: t.text }}>{teacher.avgScore}</div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>Avg. Nilai</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── GURU DASHBOARD ──────────────────────────────────────────────────────────
const GuruDashboard = ({ theme }) => {
  const t = themes[theme];
  const myExams = [
    { name: "UTS Matematika XII IPA 1", date: "Besok, 08.00", duration: "90 mnt", questions: 40, status: "ready", students: 36 },
    { name: "Kuis Bab 3 - Trigonometri", date: "Kamis, 13.00", duration: "45 mnt", questions: 20, status: "draft", students: 36 },
    { name: "UTS Matematika XII IPA 2", date: "Jumat, 08.00", duration: "90 mnt", questions: 40, status: "ready", students: 34 },
  ];
  const recentResults = [
    { name: "Andi Prasetyo", score: 92, class: "XII IPA 1", grade: "A" },
    { name: "Bela Kusuma", score: 88, class: "XII IPA 1", grade: "A" },
    { name: "Candra Wijaya", score: 74, class: "XII IPA 1", grade: "B" },
    { name: "Dewi Lestari", score: 68, class: "XII IPA 2", grade: "C" },
    { name: "Eka Putra", score: 95, class: "XII IPA 2", grade: "A" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
            Halo, Pak Budi! ✏️
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>Matematika · 3 kelas aktif · 106 siswa total</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard,
            color: t.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="clipboard" size={14} /> Bank Soal
          </button>
          <button style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: t.primary,
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="zap" size={14} /> Buat Ujian AI
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <StatCard label="Total Siswa" value="106" icon="users" color={t.primary} bg={t.primaryLight} trend={0} theme={theme} />
        <StatCard label="Ujian Aktif" value="3" icon="zap" color={t.success} bg={t.successBg} trend={0} theme={theme} />
        <StatCard label="Avg. Nilai" value="78.4" icon="target" color={t.warning} bg={t.warningBg} trend={5} theme={theme} />
        <StatCard label="Soal di Bank" value="340" icon="clipboard" color={t.info} bg={t.infoBg} trend={8} theme={theme} />
      </div>

      {/* AI Banner */}
      <div style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})`, borderRadius: 16, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600, marginBottom: 4 }}>✨ AI Generator Tersedia</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Buat 40 soal matematika dalam 30 detik</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>Kurikulum Merdeka · Kelas XII · Pilihan Ganda & Essay</div>
        </div>
        <button style={{ padding: "11px 22px", borderRadius: 10, border: "2px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)",
          color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", backdropFilter: "blur(8px)", whiteSpace: "nowrap" }}>
          Generate Soal →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* My Exams */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            Ujian Saya
            <span style={{ fontSize: 11, color: t.primary, fontWeight: 600, cursor: "pointer" }}>Lihat semua →</span>
          </div>
          {myExams.map((exam, i) => (
            <div key={i} style={{ padding: "14px 16px", background: t.bgSecondary, borderRadius: 12, marginBottom: 8, border: `1px solid ${t.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{exam.name}</div>
                <Badge label={exam.status === "ready" ? "Siap" : "Draft"}
                  color={exam.status === "ready" ? t.success : t.warning}
                  bg={exam.status === "ready" ? t.successBg : t.warningBg} />
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                {[
                  { icon: "calendar", text: exam.date },
                  { icon: "clock", text: exam.duration },
                  { icon: "hash", text: `${exam.questions} soal` },
                  { icon: "users", text: `${exam.students} siswa` },
                ].map((item, j) => (
                  <span key={j} style={{ fontSize: 11, color: t.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name={item.icon} size={11} />{item.text}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Results */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Hasil Terbaru</div>
          {recentResults.map((result, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < recentResults.length - 1 ? 10 : 0 }}>
              <Avatar name={result.name} color={result.score >= 90 ? t.success : result.score >= 75 ? t.primary : t.warning} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{result.name}</div>
                <div style={{ fontSize: 10, color: t.textMuted }}>{result.class}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: result.score >= 90 ? t.success : result.score >= 75 ? t.primary : t.warning }}>{result.score}</div>
                <div style={{ fontSize: 10, color: t.textMuted }}>Grade {result.grade}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Chart */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Distribusi Nilai — UTS Matematika</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>XII IPA 1 · 36 siswa</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["A (90-100)", "B (75-89)", "C (60-74)", "D (<60)"].map((l, i) => (
              <Badge key={i} label={l}
                color={[t.success, t.primary, t.warning, t.danger][i]}
                bg={[t.successBg, t.primaryLight, t.warningBg, t.dangerBg][i]} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
          {[3, 5, 8, 12, 5, 2, 1].map((v, i) => (
            <div key={i} style={{ flex: 1, background: [t.danger, t.warning, t.warning, t.primary, t.primary, t.success, t.success][i],
              borderRadius: "4px 4px 0 0", height: `${(v / 12) * 100}%`, opacity: 0.8, position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
              <span style={{ fontSize: 9, color: "#fff", fontWeight: 700, marginTop: 3 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {["<50","50-59","60-69","70-79","80-89","90-95","96-100"].map(r => (
            <span key={r} style={{ fontSize: 9, color: t.textMuted, flex: 1, textAlign: "center" }}>{r}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── SISWA DASHBOARD ─────────────────────────────────────────────────────────
const SiswaDashboard = ({ theme }) => {
  const t = themes[theme];
  const upcomingTests = [
    { name: "UTS Matematika", subject: "Matematika", date: "Besok, 08.00", duration: "90 mnt", questions: 40, urgent: true },
    { name: "Ujian Bahasa Inggris", subject: "B. Inggris", date: "Kamis, 10.00", duration: "60 mnt", questions: 30, urgent: false },
    { name: "UAS Kimia", subject: "Kimia", date: "Jumat, 09.00", duration: "90 mnt", questions: 35, urgent: false },
  ];
  const myScores = [
    { subject: "Matematika", score: 88, prev: 82, grade: "A-", color: t.primary },
    { subject: "B. Indonesia", score: 91, prev: 89, grade: "A", color: t.success },
    { subject: "B. Inggris", score: 78, prev: 75, grade: "B+", color: t.info },
    { subject: "Kimia", score: 72, prev: 68, grade: "B", color: t.warning },
    { subject: "Fisika", score: 85, prev: 80, grade: "A-", color: t.violet },
  ];
  const leaderboard = [
    { rank: 1, name: "Eka Putra", score: 95.2, avatar: "EP", color: "#F59E0B" },
    { rank: 2, name: "Andi Prasetyo", score: 92.1, avatar: "AP", color: "#6B7280" },
    { rank: 3, name: "Kamu", score: 88.4, avatar: "KM", color: t.primary, isMe: true },
    { rank: 4, name: "Bela Kusuma", score: 87.9, avatar: "BK", color: "#92400E" },
    { rank: 5, name: "Candra Wijaya", score: 85.3, avatar: "CW", color: "#374151" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
            Hai, Andi! 🎓
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>XII IPA 1 · SMAN 1 Jakarta · Semester Genap 2025/2026</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: t.primaryLight, border: `1px solid ${t.primary}33`, borderRadius: 10 }}>
          <Icon name="trophy" size={16} style={{ color: t.primary }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: t.primary }}>Peringkat #3 di kelas</span>
        </div>
      </div>

      {/* Urgent exam banner */}
      <div style={{ background: `linear-gradient(135deg, #DC2626, #F97316)`, borderRadius: 16, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="clock" size={22} style={{ color: "#fff" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ujian Besok!</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>UTS Matematika — 08.00 WIB</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>90 menit · 40 soal · Pastikan kamu siap</div>
          </div>
        </div>
        <button style={{ padding: "10px 20px", borderRadius: 10, border: "2px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)",
          color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Detail →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <StatCard label="Avg. Nilai" value="82.8" icon="star" color={t.warning} bg={t.warningBg} trend={7} theme={theme} />
        <StatCard label="Ujian Selesai" value="18" icon="checkCircle" color={t.success} bg={t.successBg} trend={0} theme={theme} />
        <StatCard label="Peringkat" value="#3" icon="trophy" color={t.primary} bg={t.primaryLight} trend={2} theme={theme} />
        <StatCard label="Ujian Mendatang" value="3" icon="calendar" color={t.info} bg={t.infoBg} trend={0} theme={theme} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Upcoming Tests */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Ujian Mendatang</div>
          {upcomingTests.map((test, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i < upcomingTests.length - 1 ? 10 : 0,
              padding: "12px 14px", background: test.urgent ? t.dangerBg : t.bgSecondary, borderRadius: 12,
              border: `1px solid ${test.urgent ? t.danger + "33" : t.border}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: test.urgent ? t.danger + "22" : t.primaryLight,
                display: "flex", alignItems: "center", justifyContent: "center", color: test.urgent ? t.danger : t.primary }}>
                <Icon name="clipboard" size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{test.name}</div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                  {test.date} · {test.duration} · {test.questions} soal
                </div>
              </div>
              {test.urgent && <span style={{ fontSize: 9, fontWeight: 800, color: t.danger, background: t.dangerBg, padding: "3px 7px", borderRadius: 6, border: `1px solid ${t.danger}33` }}>SEGERA</span>}
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="trophy" size={15} style={{ color: t.warning }} /> Leaderboard Kelas
          </div>
          {leaderboard.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < leaderboard.length - 1 ? 8 : 0,
              padding: "9px 12px", background: item.isMe ? t.primaryLight : "transparent", borderRadius: 10,
              border: item.isMe ? `1px solid ${t.primary}33` : "1px solid transparent" }}>
              <div style={{ width: 22, textAlign: "center", fontSize: 13, fontWeight: 800,
                color: i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#92400E" : t.textMuted }}>
                {i < 3 ? ["🥇","🥈","🥉"][i] : item.rank}
              </div>
              <Avatar name={item.name} color={item.color} size={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: item.isMe ? 700 : 500, color: item.isMe ? t.primary : t.text }}>
                  {item.name} {item.isMe && "(Kamu)"}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: item.isMe ? t.primary : t.text }}>{item.score}</div>
            </div>
          ))}
        </div>
      </div>

      {/* My Scores */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: t.shadow }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Nilai Per Mata Pelajaran</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
          {myScores.map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "16px 12px", background: t.bgSecondary, borderRadius: 14, border: `1px solid ${t.border}` }}>
              <DonutChart value={s.score} total={100} color={s.color} />
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginTop: 8 }}>{s.subject}</div>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>Grade {s.grade}</div>
              <div style={{ fontSize: 10, color: s.score > s.prev ? t.success : t.danger, marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <Icon name={s.score > s.prev ? "arrowUp" : "arrowDown"} size={9} />
                {Math.abs(s.score - s.prev)} dari ujian lalu
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function XaminaDashboard() {
  const [theme, setTheme] = useState("light");
  const [role, setRole] = useState("siswa");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);

  const t = themes[theme];
  const currentRole = roles.find(r => r.id === role);
  const navItems = sidebarItems[role];

  const dashboards = {
    superadmin: <SuperAdminDashboard theme={theme} />,
    admin: <AdminDashboard theme={theme} />,
    guru: <GuruDashboard theme={theme} />,
    siswa: <SiswaDashboard theme={theme} />,
  };

  const roleLabels = { superadmin: "Hendra Kusuma", admin: "Dr. Siti Rahayu", guru: "Budi Santoso, S.Pd.", siswa: "Andi Prasetyo" };
  const roleSubLabels = { superadmin: "Super Administrator", admin: "Admin · SMAN 1 Jakarta", guru: "Guru Matematika", siswa: "XII IPA 1 · NIS 12345" };

  return (
    <div style={{ display: "flex", height: "100vh", background: t.bg, fontFamily: "'DM Sans', 'Plus Jakarta Sans', sans-serif", overflow: "hidden" }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: ${t.borderStrong}; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* SIDEBAR */}
      <div style={{ width: sidebarOpen ? 220 : 66, minWidth: sidebarOpen ? 220 : 66, background: t.bgSidebar,
        borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column",
        transition: "width 0.25s ease, min-width 0.25s ease", overflow: "hidden", flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: "16px 14px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <XaminaLogo size={34} />
          {sidebarOpen && (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: t.text, fontFamily: "'DM Serif Display', serif", letterSpacing: "-0.02em" }}>
                Xamin<span style={{ color: t.primary }}>a</span>
              </div>
              <div style={{ fontSize: 9, color: t.textMuted, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>EDUKASI DIGITAL</div>
            </div>
          )}
        </div>

        {/* Role Switcher (dev) */}
        {sidebarOpen && (
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 9, color: t.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>ROLE PREVIEW</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {roles.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${role === r.id ? r.color + "44" : "transparent"}`,
                    background: role === r.id ? r.color + "15" : "transparent", color: role === r.id ? r.color : t.textSecondary,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name={r.icon} size={12} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto" }}>
          {navItems.map((item, i) => (
            <button key={i}
              style={{ width: "100%", padding: sidebarOpen ? "9px 12px" : "9px", marginBottom: 2, borderRadius: 10,
                border: "none", background: item.active ? t.sidebarActive : "transparent",
                color: item.active ? t.primary : t.textSecondary,
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                fontSize: 12, fontWeight: item.active ? 700 : 500, transition: "all 0.15s",
                justifyContent: sidebarOpen ? "flex-start" : "center", position: "relative" }}
              onMouseEnter={e => { if (!item.active) e.currentTarget.style.background = t.navHover; }}
              onMouseLeave={e => { if (!item.active) e.currentTarget.style.background = "transparent"; }}>
              {item.active && (
                <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  width: 3, height: 18, background: t.primary, borderRadius: "0 3px 3px 0" }} />
              )}
              <Icon name={item.icon} size={16} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "12px", borderTop: `1px solid ${t.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 10,
            background: t.bgSecondary, border: `1px solid ${t.border}`, cursor: "pointer" }}>
            <Avatar name={roleLabels[role]} color={currentRole.color} size={32} />
            {sidebarOpen && (
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {roleLabels[role]}
                </div>
                <div style={{ fontSize: 10, color: t.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {roleSubLabels[role]}
                </div>
              </div>
            )}
            {sidebarOpen && <Icon name="logOut" size={14} style={{ color: t.textMuted, flexShrink: 0 }} />}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* TOPBAR */}
        <div style={{ height: 56, background: t.bgSidebar, borderBottom: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", padding: "0 20px", gap: 12, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgCard,
              color: t.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name={sidebarOpen ? "x" : "menu"} size={15} />
          </button>

          {/* Search */}
          <div style={{ flex: 1, maxWidth: 380, display: "flex", alignItems: "center", gap: 8, background: t.inputBg,
            border: `1px solid ${t.border}`, borderRadius: 10, padding: "7px 12px" }}>
            <Icon name="search" size={14} style={{ color: t.textMuted }} />
            <span style={{ fontSize: 12, color: t.textMuted }}>Cari ujian, siswa, laporan...</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: t.textMuted, background: t.border, padding: "2px 6px", borderRadius: 5 }}>⌘K</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {/* Role Badge */}
            <div style={{ padding: "5px 12px", borderRadius: 8, background: currentRole.color + "15",
              border: `1px solid ${currentRole.color}33`, color: currentRole.color, fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 5 }}>
              <Icon name={currentRole.icon} size={12} />
              {currentRole.label}
            </div>

            {/* Notif */}
            <button onClick={() => setNotifOpen(!notifOpen)}
              style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard,
                color: t.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
              <Icon name="bell" size={16} />
              <span style={{ position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: 4, background: t.danger, border: `2px solid ${t.bgSidebar}` }} />
            </button>

            {/* Theme Toggle */}
            <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard,
                color: t.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", background: t.bg }}>
          {dashboards[role]}
        </div>
      </div>

      {/* Notification Dropdown */}
      {notifOpen && (
        <div style={{ position: "fixed", top: 62, right: 20, width: 300, background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: 14, boxShadow: t.shadowMd, zIndex: 1000, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Notifikasi</span>
            <span style={{ fontSize: 11, color: t.primary, cursor: "pointer", fontWeight: 600 }}>Tandai semua dibaca</span>
          </div>
          {[
            { icon: "zap", color: t.warning, text: "Ujian UTS Matematika besok 08.00", time: "1 jam lalu", unread: true },
            { icon: "checkCircle", color: t.success, text: "Nilai Kimia sudah keluar: 72", time: "3 jam lalu", unread: true },
            { icon: "bell", color: t.info, text: "Pengumuman baru dari Admin", time: "1 hari lalu", unread: false },
          ].map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px",
              background: n.unread ? t.primaryLight : "transparent", borderBottom: `1px solid ${t.border}`,
              cursor: "pointer", transition: "background 0.15s" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: n.color + "18", display: "flex", alignItems: "center", justifyContent: "center", color: n.color, flexShrink: 0 }}>
                <Icon name={n.icon} size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: t.text, lineHeight: 1.4 }}>{n.text}</div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>{n.time}</div>
              </div>
              {n.unread && <span style={{ width: 7, height: 7, borderRadius: 4, background: t.primary, flexShrink: 0, marginTop: 4 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
