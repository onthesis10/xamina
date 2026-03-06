/**
 * K6 WebSocket Load Test - Xamina Live Monitor
 *
 * Usage:
 *   k6 run ops/loadtest/k6-ws-loadtest.js
 *
 * Environment:
 *   WS_URL  (default: ws://localhost:8080)
 *   EXAM_ID (required)
 *   TOKEN   (required)
 */

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const wsConnections = new Counter("ws_connections_total");
const wsMessages = new Counter("ws_messages_received");
const wsErrors = new Counter("ws_errors_total");
const wsConnectDuration = new Trend("ws_connect_duration_ms");
const wsHeartbeatRtt = new Trend("ws_heartbeat_rtt_ms");
const wsHandshakeSuccess = new Rate("ws_handshake_success");

export const options = {
  scenarios: {
    student_connections: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 10 },
        { duration: "20s", target: 50 },
        { duration: "40s", target: 50 },
        { duration: "10s", target: 100 },
        { duration: "20s", target: 100 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    ws_connect_duration_ms: ["p(95)<700"],
    ws_heartbeat_rtt_ms: ["p(95)<400"],
    ws_handshake_success: ["rate>0.95"],
    ws_errors_total: ["count<50"],
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

  let lastHeartbeatAt = 0;

  const res = ws.connect(wsUrl, {}, (socket) => {
    const connectedAt = Date.now();
    wsConnectDuration.add(connectedAt - connectStart);
    wsConnections.add(1);

    socket.on("open", () => {
      socket.setInterval(() => {
        lastHeartbeatAt = Date.now();
        socket.send(
          JSON.stringify({
            type: "Heartbeat",
            data: { student_id: HEARTBEAT_USER_ID },
          }),
        );
      }, 5000);
    });

    socket.on("message", (raw) => {
      wsMessages.add(1);
      try {
        const event = JSON.parse(raw);
        if (event?.type === "HeartbeatAck" && lastHeartbeatAt > 0) {
          wsHeartbeatRtt.add(Date.now() - lastHeartbeatAt);
          lastHeartbeatAt = 0;
        }
      } catch (_err) {
        wsErrors.add(1);
      }
    });

    socket.on("error", () => {
      wsErrors.add(1);
    });

    socket.setTimeout(() => {
      socket.close();
    }, 30000);
  });

  const handshakeOk = !!res && res.status === 101;
  wsHandshakeSuccess.add(handshakeOk);
  check(res, { "ws handshake status 101": (r) => r && r.status === 101 });

  sleep(1);
}
