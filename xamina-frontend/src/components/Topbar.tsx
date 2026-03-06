import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notificationApi } from "@/features/analytics/analytics.api";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";

type PushState = "checking" | "enabled" | "disabled" | "unsupported" | "denied";

export function Topbar() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const title = useUiStore((s) => s.pageTitle);
  const installPromptState = useUiStore((s) => s.installPromptState);
  const activeTenantId = useUiStore((s) => s.activeTenantId);
  const deferredInstallPrompt = useUiStore((s) => s.deferredInstallPrompt);
  const setActiveTenantId = useUiStore((s) => s.setActiveTenantId);
  const setInstallPromptState = useUiStore((s) => s.setInstallPromptState);
  const setDeferredInstallPrompt = useUiStore((s) => s.setDeferredInstallPrompt);
  const [openNotif, setOpenNotif] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");

  const notificationQuery = useQuery({
    queryKey: ["notifications-topbar"],
    queryFn: () => notificationApi.list({ page: 1, page_size: 8 }),
    enabled: !!user,
    refetchInterval: 30000,
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
        applicationServerKey: appServerKey,
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

  const unreadCount = useMemo(
    () => notificationQuery.data?.meta.unread_count ?? 0,
    [notificationQuery.data],
  );

  const pushLabel = useMemo(() => {
    if (pushState === "enabled") return "Push: On";
    if (pushState === "disabled") return "Push: Off";
    if (pushState === "denied") return "Push: Denied";
    if (pushState === "unsupported") return "Push: N/A";
    return "Push: ...";
  }, [pushState]);

  const installLabel =
    installPromptState === "available"
      ? "Install App"
      : installPromptState === "installed"
        ? "App Installed"
        : installPromptState === "unsupported"
          ? "Install N/A"
          : "Install Dismissed";

  return (
    <header className="topbar">
      <div>
        <h2 className="page-title">{title}</h2>
        <p className="page-subtitle">{user?.name} · {user?.role}</p>
      </div>
      <div className="row gap-sm topbar-actions">
        <button
          className="btn btn-ghost"
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
          }}
        >
          {installLabel}
        </button>
        <button className="btn btn-ghost notif-btn" onClick={() => setOpenNotif((v) => !v)}>
          Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => pushMutation.mutate()}
          disabled={pushMutation.isPending || pushState === "unsupported" || pushState === "denied"}
        >
          {pushLabel}
        </button>
        {user?.role === "super_admin" ? (
          <button className="btn btn-ghost" onClick={() => setActiveTenantId(null)}>
            Tenant Scope: {activeTenantId ? `${activeTenantId.slice(0, 8)}...` : "Global"}
          </button>
        ) : null}
        {openNotif ? (
          <section className="notif-dropdown card">
            <div className="row gap-sm" style={{ justifyContent: "space-between" }}>
              <strong>Notifications</strong>
              <button
                className="btn btn-ghost"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                Read All
              </button>
            </div>
            <div className="notif-list">
              {(notificationQuery.data?.data ?? []).map((item) => (
                <div key={item.id} className={`notif-item ${item.is_read ? "read" : "unread"}`}>
                  <div>
                    <p className="notif-title">{item.title}</p>
                    <p className="state-text">{item.message}</p>
                    <p className="state-text">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  {!item.is_read ? (
                    <button
                      className="btn btn-ghost"
                      onClick={() => markReadMutation.mutate(item.id)}
                      disabled={markReadMutation.isPending}
                    >
                      Read
                    </button>
                  ) : null}
                </div>
              ))}
              {!notificationQuery.isLoading && (notificationQuery.data?.data ?? []).length === 0 ? (
                <p className="state-text">No notifications.</p>
              ) : null}
            </div>
          </section>
        ) : null}
        <button className="btn btn-ghost" onClick={clearSession}>Logout</button>
      </div>
    </header>
  );
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
