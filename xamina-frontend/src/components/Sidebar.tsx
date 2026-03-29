import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
  ChevronDown,
  CreditCard,
  Download,
  LogOut,
  Radio,
  X,
  Database,
  Globe,
  type LucideIcon,
} from "lucide-react";

import { BrandLogo } from "@/components/BrandLogo";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import { api } from "@/lib/axios";
import { notificationApi } from "@/features/analytics/analytics.api";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import type { ApiSuccess, DashboardStatsDto } from "@/types/api.types";

type PushState = "checking" | "enabled" | "disabled" | "unsupported" | "denied";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Array<"admin" | "guru" | "siswa" | "super_admin">;
};

const navItems: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "guru", "siswa", "super_admin"] },
  { to: "/app/billing", label: "Billing", icon: CreditCard, roles: ["admin"] },
  { to: "/app/users", label: "Users", icon: Users, roles: ["admin"] },
  { to: "/app/classes", label: "Classes", icon: GraduationCap, roles: ["admin"] },
  { to: "/app/question-bank", label: "Question Bank", icon: BookOpen, roles: ["admin", "guru"] },
  { to: "/app/exams", label: "Exams", icon: ClipboardList, roles: ["admin", "guru"] },
  { to: "/app/reports", label: "Reports", icon: BarChart3, roles: ["admin", "guru"] },
  { to: "/app/my-exams", label: "My Exams", icon: Sparkles, roles: ["siswa"] },
  { to: "/app/my-certificates", label: "My Certificates", icon: Award, roles: ["siswa"] },
  { to: "/app/privacy", label: "Privacy", icon: ShieldCheck, roles: ["admin", "guru", "siswa", "super_admin"] },
  { to: "/app/platform/console", label: "Platform Console", icon: ShieldCheck, roles: ["super_admin"] },
  { to: "/app/platform/audit-logs", label: "Audit Logs", icon: ClipboardList, roles: ["super_admin"] },
  { to: "/app/platform/tenants", label: "Platform Tenants", icon: ShieldCheck, roles: ["super_admin"] },
  { to: "/app/platform/billing", label: "Platform Billing", icon: CreditCard, roles: ["super_admin"] },
];

const WORKSPACE_ROUTES = new Set([
  "/app/dashboard",
  "/app/question-bank",
  "/app/exams",
  "/app/reports",
  "/app/my-exams",
  "/app/my-certificates",
]);

export function Sidebar() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const installPromptState = useUiStore((state) => state.installPromptState);
  const deferredInstallPrompt = useUiStore((state) => state.deferredInstallPrompt);
  const setActiveTenantId = useUiStore((state) => state.setActiveTenantId);
  const setInstallPromptState = useUiStore((state) => state.setInstallPromptState);
  const setDeferredInstallPrompt = useUiStore((state) => state.setDeferredInstallPrompt);

  const [openUserMenu, setOpenUserMenu] = useState(false);
  const [openQuota, setOpenQuota] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");

  const pushMutation = useMutation({
    mutationFn: async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await notificationApi.unsubscribePush(existing.endpoint);
        await existing.unsubscribe();
        setPushState("disabled");
        return;
      }
      if (Notification.permission === "denied") {
        setPushState("denied");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const publicKey = await notificationApi.getPushPublicKey();
      const appServerKey = base64UrlToUint8Array(publicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
      await notificationApi.subscribePush(subscriptionToPayload(subscription));
      setPushState("enabled");
    },
  });

  useEffect(() => {
    let active = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (active) setPushState("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!active) return;
      if (existing) {
        setPushState("enabled");
      } else if (Notification.permission === "denied") {
        setPushState("denied");
      } else {
        setPushState("disabled");
      }
    })().catch(() => {
      if (active) setPushState("disabled");
    });
    return () => {
      active = false;
    };
  }, []);

  const pushLabel = useMemo(() => {
    if (pushState === "enabled") return "Push On";
    if (pushState === "disabled") return "Push Off";
    if (pushState === "denied") return "Block";
    if (pushState === "unsupported") return "N/A";
    return "...";
  }, [pushState]);

  const installLabel =
    installPromptState === "available"
      ? "App"
      : installPromptState === "installed"
        ? "Installed"
        : installPromptState === "unsupported"
          ? "N/A"
          : "Dismissed";

  const items = navItems.filter((item) => user && item.roles.includes(user.role));
  const workspaceItems = items.filter((item) => WORKSPACE_ROUTES.has(item.to));
  const managementItems = items.filter((item) => !WORKSPACE_ROUTES.has(item.to));

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandLogo />
      </div>

      <nav className="side-nav">
        {workspaceItems.length > 0 ? <p className="brand-badge">Workspace</p> : null}
        {workspaceItems.map((item) => {
          const IconComp = item.icon;
          const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={isActive ? "side-link active" : "side-link"}
            >
              <span className="side-link-icon">
                <IconComp size={16} />
              </span>
              {item.label}
            </Link>
          );
        })}

        {managementItems.length > 0 ? <p className="brand-badge" style={{ marginTop: 8 }}>Management</p> : null}
        {managementItems.map((item) => {
          const IconComp = item.icon;
          const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={isActive ? "side-link active" : "side-link"}
            >
              <span className="side-link-icon">
                <IconComp size={16} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="relative">
          <button
            className="user-menu-trigger sidebar-user-trigger"
            onClick={() => { setOpenUserMenu(!openUserMenu); }}
          >
            <div className="user-avatar">
              {user?.name?.slice(0, 1).toUpperCase()}
            </div>
            <div className="user-info-lite">
              <span className="user-name">{user?.name}</span>
              <span className="user-role-label">{formatRole(user?.role)}</span>
            </div>
            <ChevronDown size={14} className={`transition-transform ${openUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {openUserMenu && (
            <div className="user-menu-dropdown sidebar-user-dropdown card">
              <div className="menu-group">
                <div className="menu-label">Settings</div>
                <div className="menu-item justify-between">
                  <span>Theme</span>
                  <ThemeModeToggle compact />
                </div>
                {user?.role !== "super_admin" && (
                  <button className="menu-item" onClick={() => { setOpenQuota(true); setOpenUserMenu(false); }}>
                    <Database size={16} />
                    <span>Tenant Quota</span>
                  </button>
                )}
                {user?.role === "super_admin" && (
                  <button className="menu-item" onClick={() => { setActiveTenantId(null); setOpenUserMenu(false); }}>
                    <Globe size={16} />
                    <span>Global Scope</span>
                  </button>
                )}
                <button
                  className="menu-item"
                  onClick={() => pushMutation.mutate()}
                  disabled={pushMutation.isPending || pushState === "unsupported" || pushState === "denied"}
                >
                  <Radio size={16} />
                  <span>{pushLabel}</span>
                </button>
                <button
                  className="menu-item"
                  disabled={installPromptState !== "available" || !deferredInstallPrompt}
                  onClick={async () => {
                    if (!deferredInstallPrompt) return;
                    await deferredInstallPrompt.prompt();
                    const choice = await deferredInstallPrompt.userChoice;
                    if (choice.outcome === "accepted") {
                      setInstallPromptState("installed");
                      setDeferredInstallPrompt(null);
                    } else {
                      setInstallPromptState("dismissed");
                    }
                    setOpenUserMenu(false);
                  }}
                >
                  <Download size={16} />
                  <span>{installLabel}</span>
                </button>
              </div>

              <div className="menu-divider" />

              <button className="menu-item text-danger" onClick={clearSession}>
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {openQuota && <QuotaModal onClose={() => setOpenQuota(false)} />}
    </aside>
  );
}

function QuotaModal({ onClose }: { onClose: () => void }) {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<DashboardStatsDto>>("/dashboard/stats");
      return data.data;
    },
    staleTime: 60_000,
  });

  if (!stats?.tenant) return null;

  const { users_count, users_quota, ai_credits_used, ai_credits_quota } = stats.tenant;
  const userPct = users_quota > 0 ? (users_count / users_quota) * 100 : 0;
  const aiPct = ai_credits_quota > 0 ? (ai_credits_used / ai_credits_quota) * 100 : 0;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content quota-dialog">
        <div className="row justify-between align-center" style={{ marginBottom: 20 }}>
          <div className="brand-badge" style={{ fontSize: 13 }}>Tenant Quota</div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="state-text" style={{ marginBottom: 24 }}>Pantau kapasitas akun dan limit aktif tenant Anda.</p>

        <div className="stack gap-md">
          <div className="quota-card-item">
            <div className="quota-label">
              <strong>Users Active</strong>
              <span className="text-mono">
                {users_count} / {users_quota}
              </span>
            </div>
            <div className="progress-bar" style={{ height: 10, marginTop: 8 }}>
              <div
                style={{
                  width: `${Math.min(userPct, 100)}%`,
                  background: userPct > 90 ? "var(--danger)" : undefined,
                }}
              />
            </div>
          </div>

          <div className="quota-card-item">
            <div className="quota-label">
              <strong>AI Credits Used</strong>
              <span className="text-mono">
                {ai_credits_used} / {ai_credits_quota}
              </span>
            </div>
            <div className="progress-bar" style={{ height: 10, marginTop: 8 }}>
              <div
                style={{
                  width: `${Math.min(aiPct, 100)}%`,
                  background: aiPct > 90 ? "var(--danger)" : undefined,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRole(role?: string) {
  if (!role) return "-";
  if (role === "super_admin") return "Super Admin";
  if (role === "guru") return "Guru";
  if (role === "siswa") return "Siswa";
  return "Admin";
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function subscriptionToPayload(subscription: PushSubscription) {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) {
    throw new Error("push subscription keys missing");
  }
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: bufferToBase64(p256dh),
      auth: bufferToBase64(auth),
    },
    user_agent: navigator.userAgent,
  };
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}
