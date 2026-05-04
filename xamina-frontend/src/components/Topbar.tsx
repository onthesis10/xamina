import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Menu,
  X,
} from "lucide-react";

import { notificationApi } from "@/features/analytics/analytics.api";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Topbar() {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const [openNotif, setOpenNotif] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting());

  useEffect(() => {
    const timer = setInterval(() => setGreeting(getGreeting()), 60000);
    return () => clearInterval(timer);
  }, []);

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

  return (
    <header className="topbar">
      {/* Left: Mobile sidebar toggle + Breadcrumb */}
      <div className="topbar-copy">
        <button
          className="btn btn-icon btn-ghost topbar-menu-btn"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>
        {user && (
          <div className="topbar-greeting">
            <h2 className="greeting-title">{greeting}, {user.name?.split(" ")[0]} 👋</h2>
            <p className="greeting-sub">{user.tenant_name}</p>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="topbar-actions ml-auto">
        <div className="relative">
          <button
            className={`btn btn-icon btn-ghost notif-trigger ${openNotif ? "active" : ""}`}
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
