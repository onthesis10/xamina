/**
 * K6 WebSocket Latency Test - Xamina
 *
 * Usage:
 *   k6 run ops/loadtest/k6-ws-latency.js
 *
 * Environment:
 *   WS_URL  (default: ws://localhost:8080)
 *   EXAM_ID (required)
 *   TOKEN   (required)
 */

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const roundTripLatency = new Trend("ws_roundtrip_latency_ms", true);
const connectLatency = new Trend("ws_connect_latency_ms", true);
const messageSuccess = new Rate("ws_message_success_rate");
const totalMessages = new Counter("ws_latency_messages_sent");
const ackMessages = new Counter("ws_latency_messages_acked");

export const options = {
  scenarios: {
    latency_test: {
      executor: "constant-vus",
      vus: 5,
      duration: "60s",
    },
  },
  thresholds: {
    ws_roundtrip_latency_ms: ["p(50)<120", "p(95)<400", "p(99)<800"],
    ws_connect_latency_ms: ["p(95)<700"],
    ws_message_success_rate: ["rate>0.95"],
  },
};

const WS_URL = __ENV.WS_URL || "ws://localhost:8080";
const EXAM_ID = __ENV.EXAM_ID || "00000000-0000-0000-0000-000000000001";
const TOKEN = __ENV.TOKEN || "test-token";
const HEARTBEAT_USER_ID =
  __ENV.HEARTBEAT_USER_ID || "00000000-0000-0000-0000-000000000001";

export default function () {
  const wsUrl = `${WS_URL}/ws/exam/${EXAM_ID}?token=${encodeURIComponent(TOKEN)}`;
  const connectStart = Date.now();

  let pendingHeartbeatAt = null;

  const res = ws.connect(wsUrl, {}, (socket) => {
    socket.on("open", () => {
      connectLatency.add(Date.now() - connectStart);

      socket.setInterval(() => {
        if (pendingHeartbeatAt !== null) {
          messageSuccess.add(false);
        }

        pendingHeartbeatAt = Date.now();
        totalMessages.add(1);
        socket.send(
          JSON.stringify({
            type: "Heartbeat",
            data: { student_id: HEARTBEAT_USER_ID },
          }),
        );
      }, 1000);
    });

    socket.on("message", (raw) => {
      try {
        const event = JSON.parse(raw);
        if (event?.type === "HeartbeatAck" && pendingHeartbeatAt !== null) {
          roundTripLatency.add(Date.now() - pendingHeartbeatAt);
          messageSuccess.add(true);
          ackMessages.add(1);
          pendingHeartbeatAt = null;
        }
      } catch (_err) {
        messageSuccess.add(false);
      }
    });

    socket.on("error", () => {
      messageSuccess.add(false);
    });

    socket.on("close", () => {
      if (pendingHeartbeatAt !== null) {
        messageSuccess.add(false);
      }
    });

    socket.setTimeout(() => {
      socket.close();
    }, 25000);
  });

  check(res, { "ws latency handshake status 101": (r) => r && r.status === 101 });
  sleep(2);
}

export function handleSummary(data) {
  const p50 = data.metrics.ws_roundtrip_latency_ms?.values?.["p(50)"];
  const p95 = data.metrics.ws_roundtrip_latency_ms?.values?.["p(95)"];
  const p99 = data.metrics.ws_roundtrip_latency_ms?.values?.["p(99)"];
  const connectP95 = data.metrics.ws_connect_latency_ms?.values?.["p(95)"];
  const successRate = data.metrics.ws_message_success_rate?.values?.rate;

  const lines = [
    "Xamina WS Latency Test Report",
    `roundtrip_p50_ms=${p50?.toFixed(2) ?? "N/A"}`,
    `roundtrip_p95_ms=${p95?.toFixed(2) ?? "N/A"}`,
    `roundtrip_p99_ms=${p99?.toFixed(2) ?? "N/A"}`,
    `connect_p95_ms=${connectP95?.toFixed(2) ?? "N/A"}`,
    `message_success_rate=${successRate?.toFixed(4) ?? "N/A"}`,
  ].join("\n");

  return { stdout: `${lines}\n` };
}
