import type { Page, Route } from "@playwright/test";

function ok(data: unknown, meta?: unknown) {
  return meta === undefined
    ? { success: true, data }
    : { success: true, data, meta };
}

function notFound() {
  return {
    status: 404,
    body: {
      success: false,
      error: { code: "NOT_FOUND", message: "Not found", details: null },
    },
  };
}

export async function registerMvpApiMocks(page: Page) {
  let examStatus: "draft" | "published" = "draft";
  let attachedQuestionIds: string[] = [];
  let reorderState: string[] = [];

  const questionRows = [
    {
      id: "q-1",
      tenant_id: "tenant-1",
      created_by: "teacher-1",
      type: "multiple_choice",
      content: "Ibu kota Indonesia adalah?",
      options_jsonb: [
        { id: "A", label: "Jakarta" },
        { id: "B", label: "Bandung" },
      ],
      answer_key: "A",
      topic: "Geografi",
      difficulty: "easy",
      image_url: null,
      is_active: true,
    },
    {
      id: "q-2",
      tenant_id: "tenant-1",
      created_by: "teacher-1",
      type: "true_false",
      content: "2 + 2 = 4",
      options_jsonb: [{ value: true }, { value: false }],
      answer_key: true,
      topic: "Matematika",
      difficulty: "easy",
      image_url: null,
      is_active: true,
    },
  ];

  const sessionPayload = {
    submission_id: "sub-1",
    exam_id: "exam-1",
    exam_title: "Ujian E2E",
    status: "in_progress",
    started_at: "2026-02-24T08:00:00Z",
    deadline_at: "2026-02-24T09:00:00Z",
    finished_at: null,
    remaining_seconds: 2400,
    questions: [
      {
        question_id: "q-1",
        type: "multiple_choice",
        content: "Ibu kota Indonesia adalah?",
        options_jsonb: [
          { id: "A", label: "Jakarta" },
          { id: "B", label: "Bandung" },
        ],
        topic: "Geografi",
        difficulty: "easy",
        image_url: null,
      },
    ],
    answers: [],
  };

  const resultPayload = {
    submission_id: "sub-1",
    exam_id: "exam-1",
    status: "finished",
    score: 100,
    correct_count: 1,
    total_questions: 1,
    pass_score: 70,
    passed: true,
    finished_at: "2026-02-24T08:40:00Z",
    breakdown: [
      {
        question_id: "q-1",
        question_type: "multiple_choice",
        is_correct: true,
        submitted_answer: "A",
      },
    ],
  };
  const certificatePayload = {
    id: "cert-1",
    tenant_id: "tenant-1",
    submission_id: "sub-1",
    exam_id: "exam-1",
    student_id: "student-1",
    certificate_no: "CERT-20260305-ABCD1234",
    score: 100,
    issued_at: "2026-03-05T09:00:00Z",
    file_url: "http://localhost:3000/mock/certificate.pdf",
  };

  await page.route("**/api/v1/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const { pathname, searchParams } = url;
    const method = route.request().method();

    if (pathname.endsWith("/notifications") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok([], { page: 1, page_size: 8, total: 0, unread_count: 0 })),
      });
    }
    if (pathname.includes("/notifications/") && method === "PATCH") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (pathname.endsWith("/notifications/read-all") && method === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({ updated: 0 })) });
    }
    if (pathname.endsWith("/notifications/broadcast") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({
          targeted_users: 1,
          created_notifications: 1,
          enqueued_push_jobs: 1,
          push_job_ids: ["push-job-1"],
        })),
      });
    }
    if (pathname.endsWith("/notifications/push/public-key") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ public_key: "BElocal-test-vapid-public-key-placeholder" })),
      });
    }
    if (pathname.endsWith("/notifications/push/subscribe") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ id: "sub-1" })),
      });
    }
    if (pathname.endsWith("/notifications/push/subscribe") && method === "DELETE") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ deleted: 1 })),
      });
    }
    if (pathname.endsWith("/dashboard/summary") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            role: "guru",
            exams_total: 1,
            published_exams_total: examStatus === "published" ? 1 : 0,
            submissions_total: 0,
            avg_score: 0,
            pass_rate: 0,
            trend_7d: [],
          }),
        ),
      });
    }

    if (pathname.endsWith("/questions") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(questionRows, { page: 1, page_size: 200, total: questionRows.length })),
      });
    }
    if (pathname.endsWith("/questions") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ ...questionRows[0], id: "q-new", content: "Generated Question" })),
      });
    }
    if (pathname.includes("/questions/") && method === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(questionRows[0])),
      });
    }
    if (pathname.includes("/questions/") && method === "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (pathname.endsWith("/questions/bulk-delete") && method === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (pathname.endsWith("/uploads/question-image") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ image_url: "http://localhost:8080/uploads/question-images/tenant-1/dummy.png" })),
      });
    }

    if (pathname.endsWith("/exams") && method === "GET") {
      const rows = [
        {
          id: "exam-1",
          tenant_id: "tenant-1",
          created_by: "teacher-1",
          title: "Ujian E2E",
          description: "Flow publish e2e",
          duration_minutes: 60,
          pass_score: 70,
          status: examStatus,
          shuffle_questions: false,
          shuffle_options: false,
          start_at: "2026-03-01T09:00:00Z",
          end_at: "2026-03-01T10:00:00Z",
        },
      ];
      if (searchParams.get("search")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(rows, { page: 1, page_size: 50, total: rows.length })),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(rows, { page: 1, page_size: 50, total: rows.length })),
      });
    }
    if (pathname.endsWith("/exams") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            id: "exam-created",
            tenant_id: "tenant-1",
            created_by: "teacher-1",
            title: "Created from wizard",
            description: "Created",
            duration_minutes: 60,
            pass_score: 70,
            status: "draft",
            shuffle_questions: false,
            shuffle_options: false,
            start_at: "2026-03-02T09:00:00Z",
            end_at: "2026-03-02T10:00:00Z",
          }),
        ),
      });
    }
    if (/\/api\/v1\/exams\/[^/]+$/.test(pathname) && method === "GET") {
      const examId = pathname.split("/").at(-1);
      if (!examId) return route.fulfill({ status: 404, body: JSON.stringify(notFound().body) });
      const questions = (reorderState.length ? reorderState : attachedQuestionIds).map((questionId, index) => ({
        question_id: questionId,
        order_no: index + 1,
      }));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            exam: {
              id: examId,
              tenant_id: "tenant-1",
              created_by: "teacher-1",
              title: "Ujian E2E",
              description: "Flow publish e2e",
              duration_minutes: 60,
              pass_score: 70,
              status: examStatus,
              shuffle_questions: false,
              shuffle_options: false,
              start_at: "2026-03-01T09:00:00Z",
              end_at: "2026-03-01T10:00:00Z",
            },
            questions,
          }),
        ),
      });
    }
    if (/\/api\/v1\/exams\/[^/]+\/questions$/.test(pathname) && method === "POST") {
      const payload = (route.request().postDataJSON() as { question_ids?: string[] }) ?? {};
      attachedQuestionIds = payload.question_ids ?? [];
      reorderState = [...attachedQuestionIds];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (/\/api\/v1\/exams\/[^/]+\/questions\/reorder$/.test(pathname) && method === "PATCH") {
      const payload = (route.request().postDataJSON() as { question_ids?: string[] }) ?? {};
      reorderState = payload.question_ids ?? [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            exam_id: "exam-1",
            questions: reorderState.map((questionId, index) => ({ question_id: questionId, order_no: index + 1 })),
          }),
        ),
      });
    }
    if (/\/api\/v1\/exams\/[^/]+\/questions\/[^/]+$/.test(pathname) && method === "DELETE") {
      const questionId = pathname.split("/").at(-1);
      attachedQuestionIds = attachedQuestionIds.filter((id) => id !== questionId);
      reorderState = reorderState.filter((id) => id !== questionId);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (/\/api\/v1\/exams\/[^/]+\/publish-precheck$/.test(pathname) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            exam_id: "exam-1",
            publishable: true,
            status: examStatus,
            question_count: attachedQuestionIds.length > 0 ? attachedQuestionIds.length : 1,
            issues: [],
          }),
        ),
      });
    }
    if (/\/api\/v1\/exams\/[^/]+\/publish$/.test(pathname) && method === "POST") {
      examStatus = "published";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({ status: examStatus })) });
    }
    if (/\/api\/v1\/exams\/[^/]+\/unpublish$/.test(pathname) && method === "POST") {
      examStatus = "draft";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({ status: examStatus })) });
    }

    if (pathname.endsWith("/me/exams") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok([
            {
              exam_id: "exam-1",
              title: "Ujian E2E",
              start_at: "2026-03-01T09:00:00Z",
              end_at: "2026-03-01T10:00:00Z",
              duration_minutes: 60,
              pass_score: 70,
              submission_id: "sub-1",
              submission_status: "in_progress",
              can_start: true,
            },
          ]),
        ),
      });
    }
    if (/\/api\/v1\/exams\/[^/]+\/start$/.test(pathname) && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ submission_id: "sub-1", status: "in_progress", remaining_seconds: 2400, resumed: false })),
      });
    }
    if (/\/api\/v1\/submissions\/[^/]+$/.test(pathname) && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok(sessionPayload)) });
    }
    if (/\/api\/v1\/submissions\/[^/]+\/answers$/.test(pathname) && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ submission_id: "sub-1", saved_count: 1 })),
      });
    }
    if (/\/api\/v1\/submissions\/[^/]+\/anomalies$/.test(pathname) && method === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (/\/api\/v1\/submissions\/[^/]+\/finish$/.test(pathname) && method === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok(resultPayload)) });
    }
    if (/\/api\/v1\/submissions\/[^/]+\/result$/.test(pathname) && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok(resultPayload)) });
    }
    if (/\/api\/v1\/submissions\/[^/]+\/certificate$/.test(pathname) && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok(certificatePayload)) });
    }
    if (pathname.endsWith("/certificates/my") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok([certificatePayload], { page: 1, page_size: 10, total: 1 })),
      });
    }

    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: {
          code: "UNMOCKED",
          message: `Unmocked route: ${method} ${pathname}`,
          details: null,
        },
      }),
    });
  });
}
