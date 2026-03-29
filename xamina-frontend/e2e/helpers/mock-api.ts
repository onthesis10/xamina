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

function roleFromRequest(route: Route) {
  const auth = route.request().headers()["authorization"] ?? "";
  if (auth.includes("super_admin")) return "super_admin";
  if (auth.includes("admin")) return "admin";
  if (auth.includes("guru")) return "guru";
  if (auth.includes("siswa")) return "siswa";
  return "guru";
}

export async function registerMvpApiMocks(page: Page) {
  let examStatus: "draft" | "published" = "draft";
  let attachedQuestionIds: string[] = [];
  let reorderState: string[] = [];
  let currentSubscription = {
    id: "sub-billing-1",
    tenant_id: "tenant-1",
    plan_code: "starter",
    status: "active",
    provider: "mock",
    provider_ref: "INV-20260309-STARTER",
    amount: 299000,
    currency: "IDR",
    period_start: "2026-03-01T00:00:00Z",
    period_end: "2026-03-31T23:59:59Z",
    latest_invoice_id: "invoice-1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-09T08:00:00Z",
  };
  const billingPlans = [
    {
      code: "starter",
      label: "Starter",
      amount: 299000,
      currency: "IDR",
      users_quota: 500,
      ai_credits_quota: 200,
      description: "Untuk sekolah kecil yang baru memulai operasional CBT.",
    },
    {
      code: "professional",
      label: "Professional",
      amount: 899000,
      currency: "IDR",
      users_quota: 2000,
      ai_credits_quota: 1000,
      description: "Untuk sekolah aktif dengan kebutuhan analitik dan AI lebih tinggi.",
    },
    {
      code: "enterprise",
      label: "Enterprise",
      amount: 1999000,
      currency: "IDR",
      users_quota: 5000,
      ai_credits_quota: 5000,
      description: "Untuk deployment multi-unit dengan kuota dan support tertinggi.",
    },
  ];
  const billingInvoices = [
    {
      id: "invoice-1",
      tenant_id: "tenant-1",
      subscription_id: "sub-billing-1",
      plan_code: "starter",
      status: "paid",
      provider: "mock",
      provider_ref: "INV-20260309-STARTER",
      amount: 299000,
      currency: "IDR",
      period_start: "2026-03-01T00:00:00Z",
      period_end: "2026-03-31T23:59:59Z",
      due_at: "2026-03-04T00:00:00Z",
      paid_at: "2026-03-02T09:00:00Z",
      attempt_count: 0,
      next_retry_at: null,
      checkout_url: "https://mock-billing.local/checkout/INV-20260309-STARTER",
      pdf_url: "http://localhost:8080/uploads/invoices/tenant-1/invoice-1.pdf",
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-02T09:00:00Z",
    },
  ];
  const tenantRows = [
    {
      id: "tenant-1",
      name: "SMA Negeri 1 Jakarta",
      slug: "sman1-jkt",
      plan: "professional",
      is_active: true,
      users_quota: 2000,
      ai_credits_quota: 1000,
      ai_credits_used: 230,
      users_count: 845,
      created_at: "2026-03-01T08:00:00Z",
      updated_at: "2026-03-06T10:00:00Z",
    },
    {
      id: "tenant-2",
      name: "SMK Negeri 4 Bandung",
      slug: "smkn4-bdg",
      plan: "starter",
      is_active: true,
      users_quota: 500,
      ai_credits_quota: 200,
      ai_credits_used: 72,
      users_count: 280,
      created_at: "2026-03-02T08:00:00Z",
      updated_at: "2026-03-06T10:00:00Z",
    },
  ];
  let platformAiConfig = {
    preferred_provider: "auto",
    openai_model: "gpt-4o-mini",
    groq_model: "llama-3.1-8b-instant",
    ai_mock_mode: false,
    generate_rate_limit_per_min: 12,
    grade_rate_limit_per_min: 30,
    extract_rate_limit_per_min: 10,
    updated_by: "super-admin-1",
    updated_at: "2026-03-09T08:00:00Z",
  };
  let platformAuditCounter = 1;
  const platformAuditLogs: Array<{
    id: string;
    tenant_id: string | null;
    actor_user_id: string | null;
    actor_role: string;
    actor_name: string | null;
    actor_email: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    metadata_jsonb: unknown;
    created_at: string;
  }> = [];
  const examSubmissionRows = [
    {
      submission_id: "sub-1",
      student_id: "student-1",
      student_name: "Siswa A",
      status: "in_progress",
      answered_count: 18,
      anomaly_count: 1,
      started_at: "2026-03-01T09:05:00Z",
      finished_at: null,
      score: null,
    },
    {
      submission_id: "sub-2",
      student_id: "student-2",
      student_name: "Siswa B",
      status: "finished",
      answered_count: 20,
      anomaly_count: 0,
      started_at: "2026-03-01T09:02:00Z",
      finished_at: "2026-03-01T09:45:00Z",
      score: 88.5,
    },
  ];
  const classRows = [
    {
      id: "class-1",
      tenant_id: "tenant-1",
      name: "XII IPA 1",
      grade: "XII",
      major: "IPA",
      is_active: true,
      created_at: "2026-03-01T08:00:00Z",
      updated_at: "2026-03-06T10:00:00Z",
    },
    {
      id: "class-2",
      tenant_id: "tenant-1",
      name: "XII IPS 2",
      grade: "XII",
      major: "IPS",
      is_active: true,
      created_at: "2026-03-01T08:00:00Z",
      updated_at: "2026-03-06T10:00:00Z",
    },
  ];
  const userRows = [
    {
      id: "user-1",
      tenant_id: "tenant-1",
      email: "admin@xamina.local",
      name: "Admin Xamina",
      role: "admin",
      class_id: null,
      is_active: true,
      created_at: "2026-03-01T08:00:00Z",
      updated_at: "2026-03-06T10:00:00Z",
    },
    {
      id: "user-2",
      tenant_id: "tenant-1",
      email: "guru@xamina.local",
      name: "Guru Xamina",
      role: "guru",
      class_id: null,
      is_active: true,
      created_at: "2026-03-01T08:00:00Z",
      updated_at: "2026-03-06T10:00:00Z",
    },
    {
      id: "user-3",
      tenant_id: "tenant-1",
      email: "siswa@xamina.local",
      name: "Siswa Xamina",
      role: "siswa",
      class_id: "class-1",
      is_active: true,
      created_at: "2026-03-01T08:00:00Z",
      updated_at: "2026-03-06T10:00:00Z",
    },
  ];
  const aiQuestions = [
    {
      question_text: "Planet terdekat dengan Matahari adalah?",
      question_type: "multiple_choice",
      options: [
        { text: "Merkurius", is_correct: true },
        { text: "Venus", is_correct: false },
        { text: "Bumi", is_correct: false },
      ],
      explanation: "Merkurius adalah planet paling dekat dengan Matahari.",
    },
    {
      question_text: "Air mendidih pada suhu 100 derajat Celsius.",
      question_type: "true_false",
      correct_answer_bool: true,
      explanation: "Dalam tekanan atmosfer normal, air mendidih pada 100°C.",
    },
  ];

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

  function billingTenantIdFor(pathname: string) {
    const match = pathname.match(/\/api\/v1\/platform\/tenants\/([^/]+)\/billing\//);
    return match?.[1] ?? "tenant-1";
  }

  function billingSummaryPayload(tenantId: string) {
    const outstandingInvoice =
      billingInvoices.find((item) => item.status === "pending" || item.status === "overdue") ?? null;
    return {
      tenant_id: tenantId,
      available_plans: billingPlans,
      current_subscription: currentSubscription,
      outstanding_invoice: outstandingInvoice,
      recent_invoices: billingInvoices.slice(0, 5),
    };
  }

  function createBillingInvoice(tenantId: string, planCode: string, createdAt: string) {
    const plan = billingPlans.find((item) => item.code === planCode) ?? billingPlans[0];
    return {
      id: `invoice-${billingInvoices.length + 1}`,
      tenant_id: tenantId,
      subscription_id: currentSubscription.id,
      plan_code: plan.code,
      status: "pending",
      provider: "mock",
      provider_ref: `INV-MOCK-${billingInvoices.length + 1}`,
      amount: plan.amount,
      currency: plan.currency,
      period_start: "2026-03-09T00:00:00Z",
      period_end: "2026-04-08T23:59:59Z",
      due_at: "2026-03-12T00:00:00Z",
      paid_at: null,
      attempt_count: 0,
      next_retry_at: null,
      checkout_url: `https://mock-billing.local/checkout/${plan.code}`,
      pdf_url: `http://localhost:8080/uploads/invoices/${tenantId}/invoice-${billingInvoices.length + 1}.pdf`,
      created_at: createdAt,
      updated_at: createdAt,
    };
  }

  function pushPlatformAudit(
    action: string,
    targetType: string,
    metadata: unknown,
    tenantId: string | null = null,
    targetId: string | null = null,
  ) {
    platformAuditLogs.unshift({
      id: `audit-${platformAuditCounter++}`,
      tenant_id: tenantId,
      actor_user_id: "super-admin-1",
      actor_role: "super_admin",
      actor_name: "Super Admin",
      actor_email: "sa@test.local",
      action,
      target_type: targetType,
      target_id: targetId,
      metadata_jsonb: metadata,
      created_at: new Date().toISOString(),
    });
  }

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
    if (pathname.endsWith("/notifications/push/receipt") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ recorded: true, push_job_id: "push-job-1" })),
      });
    }
    if (pathname.endsWith("/dashboard/summary") && method === "GET") {
      const role = roleFromRequest(route);
      if (role === "admin") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ok({
              role: "admin",
              users_total: 845,
              classes_total: classRows.length,
              exams_total: 12,
              submissions_total: 128,
              avg_score: 81.4,
              pass_rate: 84.2,
              trend_7d: [
                { day: "2026-03-01", submissions: 12, avg_score: 76.4, pass_rate: 75.0 },
                { day: "2026-03-02", submissions: 18, avg_score: 79.8, pass_rate: 77.8 },
                { day: "2026-03-03", submissions: 20, avg_score: 82.1, pass_rate: 80.0 },
                { day: "2026-03-04", submissions: 15, avg_score: 80.6, pass_rate: 80.0 },
                { day: "2026-03-05", submissions: 24, avg_score: 83.2, pass_rate: 87.5 },
                { day: "2026-03-06", submissions: 21, avg_score: 84.7, pass_rate: 85.7 },
                { day: "2026-03-07", submissions: 18, avg_score: 82.5, pass_rate: 83.3 },
              ],
            }),
          ),
        });
      }
      if (role === "siswa") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ok({
              role: "siswa",
              in_progress_count: 1,
              finished_count: 4,
              avg_score: 88.4,
              recent_results: [
                {
                  exam_id: "exam-1",
                  exam_title: "Ujian E2E",
                  status: "finished",
                  score: 100,
                  finished_at: "2026-02-24T08:40:00Z",
                },
                {
                  exam_id: "exam-2",
                  exam_title: "Kuis Matematika",
                  status: "auto_finished",
                  score: 76,
                  finished_at: "2026-03-05T10:30:00Z",
                },
              ],
              upcoming_exams: [
                {
                  exam_id: "exam-3",
                  title: "Ujian Bahasa Inggris",
                  start_at: "2026-03-10T08:00:00Z",
                  end_at: "2026-03-10T09:00:00Z",
                },
                {
                  exam_id: "exam-4",
                  title: "Tryout Sains",
                  start_at: "2026-03-12T07:30:00Z",
                  end_at: "2026-03-12T09:00:00Z",
                },
              ],
            }),
          ),
        });
      }
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
    if (pathname.endsWith("/dashboard/stats") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            tenant: {
              users_count: 845,
              users_quota: 2000,
              ai_credits_used: 230,
              ai_credits_quota: 1000,
            },
          }),
        ),
      });
    }
    if (pathname.endsWith("/classes") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(classRows)),
      });
    }
    if (pathname.endsWith("/classes") && method === "POST") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            id: "class-new",
            tenant_id: "tenant-1",
            name: String(payload.name ?? "Kelas Baru"),
            grade: String(payload.grade ?? "XII"),
            major: String(payload.major ?? "IPA"),
            is_active: true,
            created_at: "2026-03-08T10:00:00Z",
            updated_at: "2026-03-08T10:00:00Z",
          }),
        ),
      });
    }
    if (/\/api\/v1\/classes\/[^/]+$/.test(pathname) && method === "PATCH") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ ...classRows[0], ...payload, id: pathname.split("/").at(-1) })),
      });
    }
    if (/\/api\/v1\/classes\/[^/]+$/.test(pathname) && method === "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (pathname.endsWith("/users") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(userRows, { page: 1, page_size: 20, total: userRows.length })),
      });
    }
    if (pathname.endsWith("/users") && method === "POST") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            id: "user-new",
            tenant_id: "tenant-1",
            email: String(payload.email ?? "baru@xamina.local"),
            name: String(payload.name ?? "User Baru"),
            role: String(payload.role ?? "siswa"),
            class_id: payload.class_id ?? null,
            is_active: true,
            created_at: "2026-03-08T10:00:00Z",
            updated_at: "2026-03-08T10:00:00Z",
          }),
        ),
      });
    }
    if (/\/api\/v1\/users\/[^/]+$/.test(pathname) && method === "PATCH") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ ...userRows[0], ...payload, id: pathname.split("/").at(-1) })),
      });
    }
    if (/\/api\/v1\/users\/[^/]+$/.test(pathname) && method === "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok({})) });
    }
    if (pathname.endsWith("/users/import-csv-file") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ inserted: 2, failed: 1, errors: [{ line: 4, reason: "Email duplikat" }] })),
      });
    }
    if (pathname.endsWith("/reports/class-results") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok(
            [
              {
                class_id: "class-1",
                class_name: "X IPA 1",
                grade: "X",
                major: "IPA",
                exam_id: "exam-1",
                exam_title: "Ujian E2E",
                submission_count: 32,
                avg_score: 76.5,
                pass_rate: 71.88,
                last_submission_at: "2026-03-06T09:30:00Z",
              },
            ],
            { page: 1, page_size: 20, total: 1 },
          ),
        ),
      });
    }
    if (pathname.endsWith("/reports/class-results/export.csv") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: "class_id,class_name,grade,major,exam_id,exam_title,submission_count,avg_score,pass_rate,last_submission_at\nclass-1,X IPA 1,X,IPA,exam-1,Ujian E2E,32,76.50,71.88,2026-03-06T09:30:00Z\n",
      });
    }
    if (pathname.endsWith("/reports/exam-insights") && method === "GET") {
      const examId = searchParams.get("exam_id");
      if (!examId) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "exam_id is required for exam insights",
              details: null,
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            summary: {
              exam_id: examId,
              exam_title: "Ujian E2E",
              pass_score: 70,
              submission_count: 32,
              avg_score: 76.5,
              pass_rate: 71.88,
            },
            distribution: [
              { label: "0-9", lower_bound: 0, upper_bound: 9, count: 0 },
              { label: "10-19", lower_bound: 10, upper_bound: 19, count: 0 },
              { label: "20-29", lower_bound: 20, upper_bound: 29, count: 1 },
              { label: "30-39", lower_bound: 30, upper_bound: 39, count: 1 },
              { label: "40-49", lower_bound: 40, upper_bound: 49, count: 2 },
              { label: "50-59", lower_bound: 50, upper_bound: 59, count: 4 },
              { label: "60-69", lower_bound: 60, upper_bound: 69, count: 5 },
              { label: "70-79", lower_bound: 70, upper_bound: 79, count: 8 },
              { label: "80-89", lower_bound: 80, upper_bound: 89, count: 7 },
              { label: "90-100", lower_bound: 90, upper_bound: 100, count: 4 },
            ],
            time_series: [
              { day: "2026-03-04", submissions: 10, avg_score: 73.2, pass_rate: 70.0 },
              { day: "2026-03-05", submissions: 12, avg_score: 77.4, pass_rate: 75.0 },
              { day: "2026-03-06", submissions: 10, avg_score: 79.0, pass_rate: 70.0 },
            ],
            item_analysis: [
              {
                question_id: "q-1",
                question_type: "multiple_choice",
                question_content: "Ibu kota Indonesia adalah?",
                total_attempts: 32,
                correct_attempts: 27,
                p_value: 0.84375,
                point_biserial: 0.2265,
                recommendations: [],
              },
              {
                question_id: "q-2",
                question_type: "true_false",
                question_content: "2 + 2 = 4",
                total_attempts: 32,
                correct_attempts: 30,
                p_value: 0.9375,
                point_biserial: 0.045,
                recommendations: ["too_easy", "weak_discrimination"],
              },
            ],
          }),
        ),
      });
    }
    if (pathname.endsWith("/reports/exam-insights/export.xlsx") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Buffer.from("xlsx-mock-payload"),
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
    if (pathname.endsWith("/questions/import/preview") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({
          format: "xlsx",
          total_rows: 2,
          valid_rows: 1,
          invalid_rows: 1,
          questions: [
            {
              row_no: 2,
              question: {
                type: "multiple_choice",
                content: "Ibu kota Indonesia adalah?",
                options_jsonb: [
                  { id: "A", label: "Jakarta" },
                  { id: "B", label: "Bandung" },
                ],
                answer_key: "A",
                topic: "Geografi",
                difficulty: "easy",
                is_active: true,
              },
            },
          ],
          errors: [
            {
              row_no: 3,
              code: "VALIDATION_ERROR",
              message: "Missing required field: answer_key",
            },
          ],
        })),
      });
    }
    if (pathname.endsWith("/questions/import/commit") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ inserted_count: 1, question_ids: ["q-import-1"] })),
      });
    }
    if (pathname.endsWith("/questions/import/template.xlsx") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Buffer.from("xlsx-template-mock"),
      });
    }
    if (pathname.endsWith("/ai/extract-pdf") && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ text: "Mock PDF context extracted for AI generation." })),
      });
    }
    if (pathname.endsWith("/ai/generate/stream") && method === "POST") {
      const sseBody =
        "event: chunk\n" +
        "data: {\"text\":\"Generating questions...\"}\n\n" +
        `event: final\ndata: ${JSON.stringify(aiQuestions.length ? { questions: aiQuestions } : { questions: [] })}\n\n`;

      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
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
    if (/\/api\/v1\/exams\/[^/]+\/submissions$/.test(pathname) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(examSubmissionRows)),
      });
    }
    if (/\/api\/v1\/exams\/[^/]+\/submissions\/[^/]+\/force-finish$/.test(pathname) && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ forced: true })),
      });
    }
    if (pathname === "/api/v1/platform/analytics/overview" && method === "GET") {
      const totals = {
        tenants_total: tenantRows.length,
        active_tenants_total: tenantRows.filter((row) => row.is_active).length,
        users_total: userRows.length,
        exams_total: 3,
        submissions_total: 240,
        ai_requests_total: 420,
        active_mrr_total: 1198000,
        pending_invoices_total: billingInvoices.filter((row) => row.status !== "paid").length,
      };
      const trend_14d = Array.from({ length: 14 }).map((_, idx) => ({
        day: `2026-03-${String(idx + 1).padStart(2, "0")}`,
        submissions: 10 + idx * 2,
        ai_requests: 20 + idx * 3,
        paid_invoices: idx % 3 === 0 ? 2 : 1,
      }));
      const top_tenants = tenantRows.map((tenant, idx) => ({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        plan: tenant.plan,
        users_count: tenant.users_count,
        exams_count: 2 + idx,
        submissions_count: 80 + idx * 30,
        ai_requests_30d: 40 + idx * 20,
        mrr: idx === 0 ? 899000 : 299000,
        last_activity_at: "2026-03-09T08:00:00Z",
      }));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok({ totals, trend_14d, top_tenants })),
      });
    }
    if (pathname === "/api/v1/platform/system/health" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            generated_at: "2026-03-09T08:00:00Z",
            uptime_seconds: 7200,
            billing_provider: "midtrans",
            db: { healthy: true, detail: "Database ping OK" },
            redis: { healthy: true, detail: "Redis ping OK" },
            queue_backlog: { email_jobs: 2, push_jobs: 1, billing_retries: 1 },
          }),
        ),
      });
    }
    if (pathname === "/api/v1/platform/ai-config" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(platformAiConfig)),
      });
    }
    if (pathname === "/api/v1/platform/ai-config" && method === "PATCH") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      platformAiConfig = {
        ...platformAiConfig,
        ...payload,
        updated_by: "super-admin-1",
        updated_at: "2026-03-09T09:00:00Z",
      };
      pushPlatformAudit("platform.ai_config.updated", "platform_ai_config", platformAiConfig);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(platformAiConfig)),
      });
    }
    if (pathname === "/api/v1/platform/audit-logs" && method === "GET") {
      const actionFilter = (searchParams.get("action") ?? "").toLowerCase();
      const targetTypeFilter = (searchParams.get("target_type") ?? "").toLowerCase();
      const page = Number(searchParams.get("page") ?? "1");
      const pageSize = Number(searchParams.get("page_size") ?? "20");
      const filtered = platformAuditLogs.filter((row) => {
        if (actionFilter && !row.action.toLowerCase().includes(actionFilter)) return false;
        if (targetTypeFilter && row.target_type.toLowerCase() !== targetTypeFilter) return false;
        return true;
      });
      const offset = (page - 1) * pageSize;
      const pageRows = filtered.slice(offset, offset + pageSize);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(pageRows, { page, page_size: pageSize, total: filtered.length })),
      });
    }
    if (pathname.endsWith("/platform/tenants") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(tenantRows, { page: 1, page_size: 20, total: tenantRows.length })),
      });
    }
    if (pathname.endsWith("/platform/tenants") && method === "POST") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      const createdTenant = {
        id: "tenant-new",
        name: String(payload.name ?? "Tenant Baru"),
        slug: String(payload.slug ?? "tenant-baru"),
        plan: String(payload.plan ?? "starter"),
        is_active: true,
        users_quota: Number(payload.users_quota ?? 500),
        ai_credits_quota: Number(payload.ai_credits_quota ?? 200),
        ai_credits_used: 0,
        users_count: 0,
        created_at: "2026-03-08T10:00:00Z",
        updated_at: "2026-03-08T10:00:00Z",
      };
      pushPlatformAudit("platform.tenant.created", "tenant", createdTenant, createdTenant.id, createdTenant.id);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(createdTenant)),
      });
    }
    if (/\/api\/v1\/platform\/tenants\/[^/]+$/.test(pathname) && method === "PATCH") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      const updatedTenant = {
        ...tenantRows[0],
        ...payload,
        id: pathname.split("/").at(-1),
      };
      pushPlatformAudit("platform.tenant.updated", "tenant", updatedTenant, String(updatedTenant.id), String(updatedTenant.id));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(updatedTenant)),
      });
    }
    if (pathname === "/api/v1/billing/plans" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(billingPlans)),
      });
    }
    if (pathname === "/api/v1/billing/summary" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(billingSummaryPayload(billingTenantIdFor(pathname)))),
      });
    }
    if (pathname === "/api/v1/billing/history" && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(billingInvoices, { page: 1, page_size: 10, total: billingInvoices.length })),
      });
    }
    if (pathname === "/api/v1/billing/checkout" && method === "POST") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      const invoice = createBillingInvoice(
        billingTenantIdFor(pathname),
        String(payload.plan_code ?? "starter"),
        "2026-03-09T08:00:00Z",
      );
      billingInvoices.unshift(invoice);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            gateway_mode: "mock",
            checkout_url: invoice.checkout_url,
            invoice,
            current_subscription: currentSubscription,
          }),
        ),
      });
    }
    if (pathname === "/api/v1/billing/change-plan" && method === "POST") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      const invoice = createBillingInvoice(
        billingTenantIdFor(pathname),
        String(payload.plan_code ?? "professional"),
        "2026-03-09T08:10:00Z",
      );
      billingInvoices.unshift(invoice);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            gateway_mode: "mock",
            checkout_url: invoice.checkout_url,
            invoice,
            current_subscription: currentSubscription,
          }),
        ),
      });
    }
    if (/\/api\/v1\/billing\/invoices\/[^/]+\/pdf$/.test(pathname) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: "mock-pdf",
      });
    }
    if (/\/api\/v1\/platform\/tenants\/[^/]+\/billing\/summary$/.test(pathname) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(billingSummaryPayload(billingTenantIdFor(pathname)))),
      });
    }
    if (/\/api\/v1\/platform\/tenants\/[^/]+\/billing\/history$/.test(pathname) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(billingInvoices, { page: 1, page_size: 10, total: billingInvoices.length })),
      });
    }
    if (/\/api\/v1\/platform\/tenants\/[^/]+\/billing\/checkout$/.test(pathname) && method === "POST") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      const invoice = createBillingInvoice(
        billingTenantIdFor(pathname),
        String(payload.plan_code ?? "starter"),
        "2026-03-09T08:00:00Z",
      );
      billingInvoices.unshift(invoice);
      pushPlatformAudit("platform.billing.checkout.created", "billing_invoice", invoice, invoice.tenant_id, invoice.id);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            gateway_mode: "mock",
            checkout_url: invoice.checkout_url,
            invoice,
            current_subscription: currentSubscription,
          }),
        ),
      });
    }
    if (/\/api\/v1\/platform\/tenants\/[^/]+\/billing\/change-plan$/.test(pathname) && method === "POST") {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      const invoice = createBillingInvoice(
        billingTenantIdFor(pathname),
        String(payload.plan_code ?? "professional"),
        "2026-03-09T08:10:00Z",
      );
      billingInvoices.unshift(invoice);
      pushPlatformAudit("platform.billing.plan_change.created", "billing_invoice", invoice, invoice.tenant_id, invoice.id);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          ok({
            gateway_mode: "mock",
            checkout_url: invoice.checkout_url,
            invoice,
            current_subscription: currentSubscription,
          }),
        ),
      });
    }
    if (/\/api\/v1\/platform\/tenants\/[^/]+\/billing\/invoices\/[^/]+\/pdf$/.test(pathname) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: "mock-pdf",
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
    if (/\/api\/v1\/certificates\/[^/]+\/download$/.test(pathname) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: "mock-certificate-pdf",
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
