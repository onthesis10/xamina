import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  X,
} from "lucide-react";

import { notificationApi } from "@/features/analytics/analytics.api";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";

export function Topbar() {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const title = useUiStore((state) => state.pageTitle);
  const activeTenantId = useUiStore((state) => state.activeTenantId);

  const [openNotif, setOpenNotif] = useState(false);

  const notificationQuery = useQuery({
    queryKey: ["notifications-topbar"],
    queryFn: () => notificationApi.list({ page: 1, page_size: 8 }),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications-topbar"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notifications-topbar"] });
    },
  });

  const unreadCount = useMemo(() => notificationQuery.data?.meta.unread_count ?? 0, [notificationQuery.data]);
  const subtitle = useMemo(
    () => buildSubtitle(user?.role, activeTenantId),
    [activeTenantId, user?.role],
  );

  return (
    <header className="topbar">
      <div className="topbar-copy">
        <h2 className="page-title">{title}</h2>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      <div className="topbar-actions">
        <div className="relative">
          <button
            className={`btn btn-icon btn-ghost notif-trigger ${openNotif ? 'active' : ''}`}
            onClick={() => { setOpenNotif(!openNotif); }}
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={2.5} />
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>

          {openNotif && (
            <section className="notif-dropdown card">
              <div className="row gap-sm justify-between align-center" style={{ marginBottom: 12 }}>
                <strong>Notifications</strong>
                <div className="row gap-xs">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => markAllReadMutation.mutate()}
                    disabled={markAllReadMutation.isPending}
                  >
                    Read All
                  </button>
                  <button className="btn btn-icon btn-ghost btn-xs" onClick={() => setOpenNotif(false)}><X size={14} /></button>
                </div>
              </div>
              <div className="notif-list">
                {(notificationQuery.data?.data ?? []).map((item) => (
                  <div key={item.id} className={`notif-item ${item.is_read ? "read" : "unread"}`}>
                    <div>
                      <p className="notif-title">{item.title}</p>
                      <p className="state-text">{item.message}</p>
                    </div>
                    {!item.is_read && (
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => markReadMutation.mutate(item.id)}
                        disabled={markReadMutation.isPending}
                      >
                        Read
                      </button>
                    )}
                  </div>
                ))}
                {!(notificationQuery.data?.data ?? []).length && (
                  <p className="state-text text-center py-sm">No notifications.</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}

function buildSubtitle(role?: string, activeTenantId?: string | null) {
  const parts = [formatRole(role)];
  if (role === "super_admin") {
    parts.push(activeTenantId ? `Scope ${activeTenantId.slice(0, 8)}` : "Global Scope");
  }
  return parts.join(" | ");
}

function formatRole(role?: string) {
  if (!role) return "-";
  if (role === "super_admin") return "Super Admin";
  if (role === "guru") return "Guru";
  if (role === "siswa") return "Siswa";
  return "Admin";
}
