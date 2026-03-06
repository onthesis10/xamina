import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const rateLimitedResponses = new Counter("ai_rate_limited_responses");
const successResponses = new Counter("ai_success_responses");

const API_URL = __ENV.API_URL || "http://localhost:8080/api/v1";
const TENANT_SLUG = __ENV.TENANT_SLUG || "default";
const EMAIL = __ENV.EMAIL || "guru@xamina.local";
const PASSWORD = __ENV.PASSWORD || "Guru123!";

export const options = {
  vus: Number(__ENV.VUS || 1),
  duration: __ENV.DURATION || "15s",
  thresholds: {
    checks: ["rate>0.95"],
    ai_rate_limited_responses: ["count>0"],
  },
};

export function setup() {
  const loginRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({
      tenant_slug: TENANT_SLUG,
      email: EMAIL,
      password: PASSWORD,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(loginRes, {
    "login status is 200": (r) => r.status === 200,
  });

  const body = loginRes.json();
  const token = body?.data?.access_token;
  if (!token) {
    throw new Error("missing access token from login response");
  }
  return { token };
}

export default function (data) {
  const payload = {
    topic: "K6 Rate Limit",
    context: "Rate limit validation",
    question_type: "multiple_choice",
    difficulty: "easy",
    count: 1,
  };

  const res = http.post(`${API_URL}/ai/generate`, JSON.stringify(payload), {
    headers: {
      Authorization: `Bearer ${data.token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 429) {
    rateLimitedResponses.add(1);
  } else if (res.status === 200) {
    successResponses.add(1);
  }

  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.15);
}
