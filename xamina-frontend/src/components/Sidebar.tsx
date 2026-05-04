import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  CreditCard,
  HardDrive,
  MonitorSmartphone,
  FileCheck,
  Globe,
  GraduationCap,
  LayoutGrid,
  Library,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  BellRing,
  ScrollText,
  Settings,
  Terminal,
  Users,
  X,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { BrandLogo } from "@/components/BrandLogo";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import { analyticsApi, notificationApi } from "@/features/analytics/analytics.api";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { TenantSettingsDialog } from "./TenantSettingsDialog";

type PushState = "checking" | "enabled" | "disabled" | "unsupported" | "denied";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Array<"admin" | "guru" | "siswa" | "super_admin">;
};

const navItems: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutGrid, roles: ["admin", "guru", "siswa", "super_admin"] },
  { to: "/app/billing", label: "Billing", icon: CreditCard, roles: ["admin"] },
  { to: "/app/users", label: "Users", icon: Users, roles: ["admin"] },
  { to: "/app/classes", label: "Classes", icon: GraduationCap, roles: ["admin"] },
  { to: "/app/subjects", label: "Subjects", icon: Library, roles: ["admin"] },
  { to: "/app/teacher-assignments", label: "Assignments", icon: UserCheck, roles: ["admin"] },
  { to: "/app/question-bank", label: "Question Bank", icon: BookOpen, roles: ["admin", "guru"] },
  { to: "/app/exams", label: "Exams", icon: FileCheck, roles: ["admin", "guru"] },
  { to: "/app/reports", label: "Reports", icon: BarChart3, roles: ["admin", "guru"] },
  { to: "/app/my-exams", label: "My Exams", icon: PenLine, roles: ["siswa"] },
  { to: "/app/my-certificates", label: "Certificates", icon: Award, roles: ["siswa"] },
  { to: "/app/privacy", label: "Privacy", icon: Lock, roles: ["admin", "guru", "siswa", "super_admin"] },
  { to: "/app/platform/console", label: "Console", icon: Terminal, roles: ["super_admin"] },
  { to: "/app/platform/audit-logs", label: "Audit Logs", icon: ScrollText, roles: ["super_admin"] },
  { to: "/app/platform/tenants", label: "Tenants", icon: Building2, roles: ["super_admin"] },
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

  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const installPromptState = useUiStore((state) => state.installPromptState);
  const deferredInstallPrompt = useUiStore((state) => state.deferredInstallPrompt);
  const setActiveTenantId = useUiStore((state) => state.setActiveTenantId);
  const setInstallPromptState = useUiStore((state) => state.setInstallPromptState);
  const setDeferredInstallPrompt = useUiStore((state) => state.setDeferredInstallPrompt);

  const [openUserMenu, setOpenUserMenu] = useState(false);
  const [openQuota, setOpenQuota] = useState(false);
  const [openTenantSettings, setOpenTenantSettings] = useState(false);
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

  const items = navItems.filter((item) => user && item.roles.includes(user.role));
  const workspaceItems = items.filter((item) => WORKSPACE_ROUTES.has(item.to));
  const managementItems = items.filter((item) => !WORKSPACE_ROUTES.has(item.to));

  return (
    <aside className={`sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      {/* Brand + Collapse Toggle */}
      <div className="brand">
        <div className="brand-row">
          {!sidebarCollapsed && <BrandLogo />}
          <button
            className="btn-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </div>

      <nav className="side-nav">
        {!sidebarCollapsed && workspaceItems.length > 0 ? (
          <p className="brand-badge">Workspace</p>
        ) : null}
        {workspaceItems.map((item) => {
          const IconComp = item.icon;
          const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={isActive ? "side-link active" : "side-link"}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="side-link-icon">
                <IconComp size={18} />
              </span>
              {!sidebarCollapsed && <span className="side-link-label">{item.label}</span>}
            </Link>
          );
        })}

        {!sidebarCollapsed && managementItems.length > 0 ? (
          <p className="brand-badge" style={{ marginTop: 8 }}>Management</p>
        ) : (
          managementItems.length > 0 ? <div className="side-divider" /> : null
        )}
        {managementItems.map((item) => {
          const IconComp = item.icon;
          const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={isActive ? "side-link active" : "side-link"}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="side-link-icon">
                <IconComp size={18} />
              </span>
              {!sidebarCollapsed && <span className="side-link-label">{item.label}</span>}
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
            {!sidebarCollapsed && (
              <>
                <div className="user-info-lite">
                  <span className="user-name">{user?.name}</span>
                  <span className="user-role-label">{formatRole(user?.role)}</span>
                </div>
                <ChevronDown size={14} className={`transition-transform ${openUserMenu ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>

          {openUserMenu && (
            <div className="user-menu-dropdown sidebar-user-dropdown card">
              <div className="menu-group">
                <div className="menu-label">Settings</div>
                <div className="menu-item justify-between">
                  <span>Theme</span>
                  <ThemeModeToggle compact />
                </div>
                {user?.role === "admin" && (
                  <button className="menu-item" onClick={() => { setOpenQuota(true); setOpenUserMenu(false); }}>
                    <BarChart3 size={16} />
                    <span>Tenant Snapshot</span>
                  </button>
                )}
                {user?.role === "guru" && (
                  <button className="menu-item" onClick={() => { setOpenQuota(true); setOpenUserMenu(false); }}>
                    <HardDrive size={16} />
                    <span>Tenant Quota</span>
                  </button>
                )}
                {user?.role === "super_admin" && (
                  <button className="menu-item" onClick={() => { setActiveTenantId(null); setOpenUserMenu(false); }}>
                    <Globe size={16} />
                    <span>Global Scope</span>
                  </button>
                )}
                {(user?.role === "admin" || user?.role === "super_admin") && (
                  <button className="menu-item" onClick={() => { setOpenTenantSettings(true); setOpenUserMenu(false); }}>
                    <Settings size={16} />
                    <span>School Settings</span>
                  </button>
                )}
                {pushState !== "unsupported" && pushState !== "denied" && (
                  <button
                    className="menu-item"
                    onClick={() => pushMutation.mutate()}
                    disabled={pushMutation.isPending}
                  >
                    <BellRing size={16} />
                    <span>{pushLabel}</span>
                  </button>
                )}
                {installPromptState === "available" && (
                  <button
                    className="menu-item"
                    disabled={!deferredInstallPrompt}
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
                    <MonitorSmartphone size={16} />
                    <span>Install App</span>
                  </button>
                )}
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

      {openQuota && <TenantSnapshotModal onClose={() => setOpenQuota(false)} />}
      <TenantSettingsDialog
        open={openTenantSettings}
        onClose={() => setOpenTenantSettings(false)}
      />
    </aside>
  );
}

function TenantSnapshotModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "admin";
  const isGuru = user?.role === "guru";

  const { data: stats, isLoading: loadingStats, isError: errorStats } = useQuery({
    queryKey: ["dashboard-stats-dashboard", user?.role],
    queryFn: () => analyticsApi.stats(),
    enabled: isAdmin || isGuru,
    staleTime: 30_000,
  });

  const { data: summary, isLoading: loadingSummary, isError: errorSummary } = useQuery({
    queryKey: ["dashboard-summary", user?.role],
    queryFn: () => analyticsApi.summary(),
    enabled: isAdmin || isGuru,
    staleTime: 30_000,
  });

  const isLoading = (loadingStats && !stats) || (loadingSummary && !summary);
  const isError = errorStats || errorSummary;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content quota-dialog">
        <div className="row justify-between align-center" style={{ marginBottom: 20 }}>
          <div className="brand-badge" style={{ fontSize: 13 }}>{isAdmin ? "Tenant Snapshot" : "Tenant Quota"}</div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center">
            <p className="state-text animate-pulse">Loading diagnostics...</p>
          </div>
        ) : isError ? (
          <div className="py-8 text-center stack gap-sm">
             <p className="state-text text-danger">Failed to load snapshot data.</p>
             <button className="btn btn-ghost btn-sm mx-auto" onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <>
            <p className="state-text" style={{ marginBottom: 24 }}>
              {isAdmin 
                ? "Quick diagnostics of your institution performance and capacity." 
                : "Monitor your account capacity and active tenant limits."
              }
            </p>

            <div className="stack gap-md">
              {stats?.tenant && (
                <>
                  <div className="quota-card-item">
                    <div className="quota-label">
                      <strong>Active Users</strong>
                      <span className="text-mono">
                        {stats.tenant.users_count} / {stats.tenant.users_quota}
                      </span>
                    </div>
                    <div className="progress-bar" style={{ height: 10, marginTop: 8 }}>
                      <div
                        style={{
                          width: `${Math.min((stats.tenant.users_count / stats.tenant.users_quota) * 100, 100)}%`,
                          background: (stats.tenant.users_count / stats.tenant.users_quota) > 0.9 ? "var(--danger)" : undefined,
                        }}
                      />
                    </div>
                  </div>

                  <div className="quota-card-item">
                    <div className="quota-label">
                      <strong>AI Credits Used</strong>
                      <span className="text-mono">
                        {stats.tenant.ai_credits_used} / {stats.tenant.ai_credits_quota}
                      </span>
                    </div>
                    <div className="progress-bar" style={{ height: 10, marginTop: 8 }}>
                      <div
                        style={{
                          width: `${Math.min((stats.tenant.ai_credits_used / stats.tenant.ai_credits_quota) * 100, 100)}%`,
                          background: (stats.tenant.ai_credits_used / stats.tenant.ai_credits_quota) > 0.9 ? "var(--danger)" : undefined,
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              {isAdmin && summary && (
                <div className="row gap-md" style={{ marginTop: 8 }}>
                   <div className="quota-card-item" style={{ flex: 1 }}>
                      <p className="stat-label" style={{ marginBottom: 4 }}>Total Exams</p>
                      <p className="stat-value-lg" style={{ fontSize: 24 }}>{(summary as any).exams_total ?? 0}</p>
                   </div>
                   <div className="quota-card-item" style={{ flex: 1 }}>
                      <p className="stat-label" style={{ marginBottom: 4 }}>Submissions</p>
                      <p className="stat-value-lg" style={{ fontSize: 24 }}>{(summary as any).submissions_total ?? 0}</p>
                   </div>
                </div>
              )}
              
              {!stats?.tenant && !isError && (
                <p className="state-text text-center py-4">No tenant data available.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}



function formatRole(role?: string) {
  if (!role) return "-";
  if (role === "super_admin") return "Super Admin";
  if (role === "guru") return "Teacher";
  if (role === "siswa") return "Student";
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
