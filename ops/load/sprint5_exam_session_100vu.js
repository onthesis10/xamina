import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: Number(__ENV.VUS || 100),
  duration: __ENV.DURATION || "60s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const baseUrl = __ENV.API_BASE_URL || "http://localhost:8080/api/v1";
const submissionId = __ENV.SUBMISSION_ID || "";
const bearer = __ENV.ACCESS_TOKEN || "";

if (!submissionId || !bearer) {
  throw new Error("SUBMISSION_ID and ACCESS_TOKEN are required.");
}

export default function () {
  const payload = JSON.stringify({
    answers: [
      {
        question_id: __ENV.QUESTION_ID || "q-1",
        answer: "A",
        is_bookmarked: false,
      },
    ],
  });

  const response = http.post(`${baseUrl}/submissions/${submissionId}/answers`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
  });

  check(response, {
    "answers endpoint status 200": (r) => r.status === 200,
    "answers endpoint success=true": (r) => {
      const body = r.json();
      return body && body.success === true;
    },
  });

  sleep(0.3);
}
