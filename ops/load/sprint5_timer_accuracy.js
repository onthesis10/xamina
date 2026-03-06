import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

export const options = {
  vus: 1,
  iterations: Number(__ENV.ITERATIONS || 20),
  thresholds: {
    http_req_failed: ["rate<0.01"],
    timer_drift_seconds: [`p(95)<=${Number(__ENV.TIMER_DRIFT_MAX || 2)}`],
  },
};

const timerDriftSeconds = new Trend("timer_drift_seconds");

const baseUrl = __ENV.API_BASE_URL || "http://localhost:8080/api/v1";
const submissionId = __ENV.SUBMISSION_ID || "";
const bearer = __ENV.ACCESS_TOKEN || "";

if (!submissionId || !bearer) {
  throw new Error("SUBMISSION_ID and ACCESS_TOKEN are required.");
}

let previousRemaining = null;
let previousTimestamp = null;

export default function () {
  const response = http.get(`${baseUrl}/submissions/${submissionId}`, {
    headers: {
      Authorization: `Bearer ${bearer}`,
    },
  });

  check(response, {
    "session endpoint status 200": (r) => r.status === 200,
    "session payload success=true": (r) => {
      const body = r.json();
      return body && body.success === true;
    },
  });

  const now = Date.now();
  const currentRemaining = Number(response.json("data.remaining_seconds"));

  if (previousRemaining !== null && previousTimestamp !== null) {
    const expectedDrop = Math.round((now - previousTimestamp) / 1000);
    const actualDrop = previousRemaining - currentRemaining;
    const drift = Math.abs(actualDrop - expectedDrop);
    timerDriftSeconds.add(drift);
  }

  previousRemaining = currentRemaining;
  previousTimestamp = now;
  sleep(1);
}
