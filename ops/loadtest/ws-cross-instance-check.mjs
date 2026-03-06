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
      socket.addEventListener("error", (ev) => reject(new Error(`${label} socket error: ${ev.type}`)), {
        once: true,
      });
    }),
    delay(timeoutMs).then(() => {
      throw new Error(`${label} socket open timeout after ${timeoutMs}ms`);
    }),
  ]);
}

async function main() {
  const args = parseArgs(process.argv);

  const apiA = args.apiAUrl ?? process.env.API_A_URL ?? "http://127.0.0.1:8080";
  const apiB = args.apiBUrl ?? process.env.API_B_URL ?? "http://127.0.0.1:8081";
  const tenantSlug = args.tenantSlug ?? process.env.TENANT_SLUG ?? "ws-multi";
  const monitorEmail = args.monitorEmail ?? process.env.MONITOR_EMAIL ?? "ws-monitor@xamina.local";
  const monitorPassword = args.monitorPassword ?? process.env.MONITOR_PASSWORD ?? "WsPass123!";
  const studentEmail = args.studentEmail ?? process.env.STUDENT_EMAIL ?? "ws-student@xamina.local";
  const studentPassword = args.studentPassword ?? process.env.STUDENT_PASSWORD ?? "WsPass123!";
  const examId = args.examId ?? process.env.EXAM_ID ?? "00000000-0000-0000-0000-000000000001";
  const timeoutMs = Number(args.timeoutMs ?? process.env.TIMEOUT_MS ?? "20000");

  const logs = [];
  const startAt = new Date().toISOString();
  logs.push(`start_at=${startAt}`);
  logs.push(`api_a=${apiA}`);
  logs.push(`api_b=${apiB}`);
  logs.push(`tenant_slug=${tenantSlug}`);
  logs.push(`exam_id=${examId}`);

  const monitorAuth = await login(apiB, tenantSlug, monitorEmail, monitorPassword);
  const studentAuth = await login(apiA, tenantSlug, studentEmail, studentPassword);

  const wsA = apiToWsBase(apiA);
  const wsB = apiToWsBase(apiB);

  const monitorUrl = `${wsB}/ws/exam/${examId}?token=${encodeURIComponent(monitorAuth.access_token)}`;
  const studentUrl = `${wsA}/ws/exam/${examId}?token=${encodeURIComponent(studentAuth.access_token)}`;

  const monitorSocket = new WebSocket(monitorUrl);
  await waitForSocketOpen(monitorSocket, timeoutMs, "monitor");
  logs.push("monitor_socket_opened=true");

  const studentConnectedPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout waiting StudentConnected for ${studentAuth.user.id}`));
    }, timeoutMs);

    monitorSocket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        logs.push(`monitor_event=${payload.type}`);
        if (
          payload?.type === "StudentConnected" &&
          payload?.data?.student_id === studentAuth.user.id
        ) {
          clearTimeout(timer);
          resolve(payload);
        }
      } catch (_err) {
        // ignore invalid frames
      }
    });
  });

  const studentSocket = new WebSocket(studentUrl);
  await waitForSocketOpen(studentSocket, timeoutMs, "student");
  logs.push("student_socket_opened=true");

  const studentConnected = await studentConnectedPromise;

  monitorSocket.close();
  studentSocket.close();

  const result = {
    success: true,
    started_at: startAt,
    finished_at: new Date().toISOString(),
    api_a: apiA,
    api_b: apiB,
    exam_id: examId,
    monitor_user_id: monitorAuth.user.id,
    student_user_id: studentAuth.user.id,
    received_event: studentConnected,
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
