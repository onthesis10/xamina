const CACHE_NAME = "xamina-app-shell-v2";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];
const PUSH_RECEIPT_ENDPOINT = "/api/v1/notifications/push/receipt";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/uploads/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match("/index.html");
      }),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Xamina", body: event.data.text() };
  }
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const data = safePayload.data && typeof safePayload.data === "object" ? safePayload.data : {};
  const title = safePayload.title || "Xamina Notification";
  const options = {
    body: safePayload.body || "Ada notifikasi baru.",
    data: {
      ...data,
      url:
        (typeof data.url === "string" && data.url) ||
        (typeof safePayload.url === "string" && safePayload.url) ||
        "/app/dashboard",
    },
    icon: "/icon.svg",
    badge: "/icon.svg",
  };
  event.waitUntil(
    Promise.allSettled([
      sendPushReceipt("received", options.data),
      self.registration.showNotification(title, options),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const target = data.url || "/app/dashboard";
  event.waitUntil(
    Promise.allSettled([sendPushReceipt("clicked", data), clients.openWindow(target)]),
  );
});

async function sendPushReceipt(eventType, data) {
  const receiptToken = typeof data?.receipt_token === "string" ? data.receipt_token : "";
  if (!receiptToken) return;

  const payload = {
    receipt_token: receiptToken,
    event_type: eventType,
    event_at: new Date().toISOString(),
    metadata: {
      push_job_id:
        typeof data?.push_job_id === "string" || typeof data?.push_job_id === "number"
          ? data.push_job_id
          : null,
      url: typeof data?.url === "string" ? data.url : null,
      source: "service_worker",
    },
  };

  try {
    await fetch(PUSH_RECEIPT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Receipt logging is best-effort; notification display must stay reliable.
  }
}
