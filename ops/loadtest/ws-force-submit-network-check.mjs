import { setTimeout as delay } from "node:timers/promises";

function parseArgs(argv) {
  const parsed = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      continue;
    }
    parsed[key.slice(2)] = value;
    i += 1;
  }
  return parsed;
}

function apiToWsBase(apiUrl) {
  const url = new URL(apiUrl);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}`;
}

async function login(apiUrl, tenantSlug, email, password) {
  const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant_slug: tenantSlug,
      email,
      password,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success !== true) {
    throw new Error(
      `login failed for ${email}: status=${res.status}, body=${JSON.stringify(body)}`,
    );
  }
  return body.data;
}

async function waitForSocketOpen(socket, timeoutMs, label) {
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener(
        "error",
        (ev) => reject(new Error(`${label} socket error: ${ev.type}`)),
        { once: true },
      );
    }),
    delay(timeoutMs).then(() => {
      throw new Error(`${label} socket open timeout after ${timeoutMs}ms`);
    }),
  ]);
}

function waitForEvent(socket, timeoutMs, predicate, label) {
  return Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          if (predicate(payload)) {
            clearTimeout(timer);
            resolve(payload);
          }
        } catch (_err) {
          // ignore invalid frames
        }
      });
    }),
    delay(timeoutMs + 50).then(() => {
      throw new Error(`${label} timeout after ${timeoutMs}ms`);
    }),
  ]);
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success !== true) {
    throw new Error(
      `request failed: ${options?.method ?? "GET"} ${url} status=${res.status} body=${JSON.stringify(body)}`,
    );
  }
  return body.data;
}

async function main() {
  const args = parseArgs(process.argv);

  const apiUrl = args.apiUrl ?? process.env.API_URL ?? "http://127.0.0.1:8080";
  const tenantSlug = args.tenantSlug ?? process.env.TENANT_SLUG ?? "ws-force";
  const monitorEmail = args.monitorEmail ?? process.env.MONITOR_EMAIL ?? "ws-monitor@xamina.local";
  const monitorPassword = args.monitorPassword ?? process.env.MONITOR_PASSWORD ?? "WsPass123!";
  const studentEmail = args.studentEmail ?? process.env.STUDENT_EMAIL ?? "ws-student@xamina.local";
  const studentPassword = args.studentPassword ?? process.env.STUDENT_PASSWORD ?? "WsPass123!";
  const examId = args.examId ?? process.env.EXAM_ID ?? "22222222-2222-2222-2222-222222222222";
  const timeoutMs = Number(args.timeoutMs ?? process.env.TIMEOUT_MS ?? "20000");

  const logs = [];
  const events = [];
  const startedAt = new Date().toISOString();
  logs.push(`start_at=${startedAt}`);
  logs.push(`api_url=${apiUrl}`);
  logs.push(`tenant_slug=${tenantSlug}`);
  logs.push(`exam_id=${examId}`);

  const monitorAuth = await login(apiUrl, tenantSlug, monitorEmail, monitorPassword);
  const studentAuth = await login(apiUrl, tenantSlug, studentEmail, studentPassword);

  const submission = await fetchJson(`${apiUrl}/api/v1/exams/${examId}/start`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${studentAuth.access_token}`,
    },
  });
  const submissionId = submission.submission_id;

  const wsBase = apiToWsBase(apiUrl);
  const monitorUrl = `${wsBase}/ws/exam/${examId}?token=${encodeURIComponent(
    monitorAuth.access_token,
  )}`;
  const studentUrl = `${wsBase}/ws/exam/${examId}?token=${encodeURIComponent(
    studentAuth.access_token,
  )}`;

  const monitorSocket = new WebSocket(monitorUrl);
  await waitForSocketOpen(monitorSocket, timeoutMs, "monitor");
  logs.push("monitor_socket_opened=true");

  monitorSocket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data));
      events.push({ at: new Date().toISOString(), ...payload });
    } catch (_err) {
      // ignore invalid frames
    }
  });

  const studentSocket = new WebSocket(studentUrl);
  await waitForSocketOpen(studentSocket, timeoutMs, "student");
  logs.push("student_socket_opened=true");

  await waitForEvent(
    monitorSocket,
    timeoutMs,
    (payload) =>
      payload?.type === "StudentConnected" && payload?.data?.student_id === studentAuth.user.id,
    "wait StudentConnected",
  );
  logs.push("student_connected_event_received=true");

  studentSocket.close();
  logs.push("student_socket_closed=true");
  await delay(500);

  monitorSocket.send(
    JSON.stringify({
      type: "ForceSubmit",
      data: { student_id: studentAuth.user.id },
    }),
  );
  logs.push("monitor_force_submit_sent=true");

  await waitForEvent(
    monitorSocket,
    timeoutMs,
    (payload) =>
      payload?.type === "StudentFinished" && payload?.data?.student_id === studentAuth.user.id,
    "wait StudentFinished",
  );
  logs.push("student_finished_event_received=true");

  const reconnectSocket = new WebSocket(studentUrl);
  await waitForSocketOpen(reconnectSocket, timeoutMs, "student_reconnect");
  logs.push("student_reconnected=true");
  reconnectSocket.close();

  await fetchJson(`${apiUrl}/api/v1/submissions/${submissionId}/result`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${studentAuth.access_token}`,
    },
  });
  logs.push("student_result_fetch_success=true");

  monitorSocket.close();

  const result = {
    success: true,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    api_url: apiUrl,
    exam_id: examId,
    submission_id: submissionId,
    monitor_user_id: monitorAuth.user.id,
    student_user_id: studentAuth.user.id,
    events,
    logs,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const result = {
    success: false,
    finished_at: new Date().toISOString(),
    error: String(error?.message ?? error),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(1);
});
