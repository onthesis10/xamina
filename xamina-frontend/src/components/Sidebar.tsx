import { Link, useRouterState } from "@tanstack/react-router";

import { useAuthStore } from "@/store/auth.store";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiSuccess, DashboardStatsDto } from "@/types/api.types";

type NavItem = {
  to: string;
  label: string;
  roles: Array<"admin" | "guru" | "siswa" | "super_admin">;
};

const navItems: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", roles: ["admin", "guru", "siswa", "super_admin"] },
  { to: "/app/users", label: "Users", roles: ["admin"] },
  { to: "/app/classes", label: "Classes", roles: ["admin"] },
  { to: "/app/question-bank", label: "Question Bank", roles: ["admin", "guru"] },
  { to: "/app/exams", label: "Exams", roles: ["admin", "guru"] },
  { to: "/app/reports", label: "Reports", roles: ["admin", "guru"] },
  { to: "/app/my-exams", label: "My Exams", roles: ["siswa"] },
  { to: "/app/my-certificates", label: "My Certificates", roles: ["siswa"] },
  { to: "/app/platform/tenants", label: "Platform Tenants", roles: ["super_admin"] },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = navItems.filter((item) => user && item.roles.includes(user.role));

  return (
    <aside className="sidebar">
      <div className="brand">Xamina</div>
      <nav className="side-nav">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={pathname === item.to || pathname.startsWith(`${item.to}/`) ? "side-link active" : "side-link"}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {user && user.role !== "super_admin" && (
        <div style={{ padding: "1rem", marginTop: "auto", borderTop: "1px solid var(--app-color-border)" }}>
          <QuotaIndicator />
        </div>
      )}
    </aside>
  );
}

function QuotaIndicator() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<DashboardStatsDto>>("/dashboard/stats");
      return data.data;
    },
    staleTime: 60000,
  });

  if (!stats?.tenant) return null;

  const { users_count, users_quota, ai_credits_used, ai_credits_quota } = stats.tenant;
  const userPct = users_quota > 0 ? (users_count / users_quota) * 100 : 0;
  const aiPct = ai_credits_quota > 0 ? (ai_credits_used / ai_credits_quota) * 100 : 0;

  return (
    <div className="stack gap-sm text-xs">
      <h6 className="text-dimmed mb-1">Tenant Quota</h6>
      <div>
        <div className="row justify-between mb-1">
          <span>Users</span>
          <span>{users_count} / {users_quota}</span>
        </div>
        <div className="progress-bar" style={{ height: 4, background: "var(--app-color-border)" }}>
          <div style={{ height: "100%", width: `${userPct}%`, background: userPct > 90 ? "red" : "var(--app-color-primary)" }} />
        </div>
      </div>
      <div className="mt-2">
        <div className="row justify-between mb-1">
          <span>AI Credits</span>
          <span>{ai_credits_used} / {ai_credits_quota}</span>
        </div>
        <div className="progress-bar" style={{ height: 4, background: "var(--app-color-border)" }}>
          <div style={{ height: "100%", width: `${aiPct}%`, background: aiPct > 90 ? "red" : "var(--app-color-primary)" }} />
        </div>
      </div>
    </div>
  );
}
