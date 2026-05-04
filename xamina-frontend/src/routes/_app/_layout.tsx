import { Outlet, redirect } from "@tanstack/react-router";

import { Sidebar } from "@/components/Sidebar";
import { ToastViewport } from "@/components/ToastViewport";
import { Topbar } from "@/components/Topbar";
import { TenantErrorBoundary } from "@/components/TenantErrorBoundary";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";

export function appBeforeLoad() {
  const user = useAuthStore.getState().user;
  if (!user) throw redirect({ to: "/auth/login" });
}

export function AppLayoutPage() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <div className="app-shell" data-sidebar-collapsed={sidebarCollapsed || undefined}>
      <Sidebar />
      <main className="app-main">
        <Topbar />
        <ToastViewport />
        <div className="app-content">
          <TenantErrorBoundary>
            <Outlet />
          </TenantErrorBoundary>
        </div>
      </main>
    </div>
  );
}
