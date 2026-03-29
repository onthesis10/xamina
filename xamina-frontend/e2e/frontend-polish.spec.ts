import { expect, test, type Page } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

async function mockLiveExamSocket(page: Page) {
  await page.addInitScript(() => {
    class FakeWebSocket {
      static OPEN = 1;
      static CLOSED = 3;
      public readyState = FakeWebSocket.OPEN;
      public onopen: ((event: Event) => void) | null = null;
      public onmessage: ((event: MessageEvent<string>) => void) | null = null;
      public onclose: ((event: CloseEvent) => void) | null = null;
      public onerror: ((event: Event) => void) | null = null;

      constructor() {
        setTimeout(() => {
          this.onopen?.(new Event("open"));
          this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "MonitorJoined", data: {} }) }));
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "StudentConnected",
                data: { student_id: "student-live-1", student_name: "Siswa Live" },
              }),
            }),
          );
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "AnswerSaved",
                data: { student_id: "student-live-1", answered_count: 12 },
              }),
            }),
          );
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "AnomalyDetected",
                data: { student_id: "student-live-1", event_type: "blur_window" },
              }),
            }),
          );
        }, 50);
      }

      send() { }

      close() {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close"));
      }
    }

    Object.defineProperty(window, "WebSocket", {
      writable: true,
      value: FakeWebSocket,
    });
  });
}

test("public design system page renders and supports all three theme modes", async ({ page }) => {
  await page.goto("/design-system");

  await expect(page.getByRole("heading", { name: /Sistem visual Xamina/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Color Palette" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "light");
  await page.screenshot({ path: test.info().outputPath("design-system-light.png"), fullPage: true });

  await page.getByRole("button", { name: /Dark/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "dark");
  await page.screenshot({ path: test.info().outputPath("design-system-dark.png"), fullPage: true });

  await page.getByRole("button", { name: /Fun/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "fun");
  await page.screenshot({ path: test.info().outputPath("design-system-fun.png"), fullPage: true });
});

test("theme toggle persists through reload and supports fun mode in app shell", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/dashboard");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "light");

  await page.getByRole("button", { name: /Dark/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "dark");

  await page.getByRole("button", { name: /Fun/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "fun");

  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "fun");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
});

test("admin dashboard uses the shared scaffold with tenant analytics surfaces", async ({ page }) => {
  await seedAuthSession(page, "admin");
  await registerMvpApiMocks(page);

  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: /Dashboard Sekolah/i })).toBeVisible();
  await expect(page.getByText("Trend 7 Hari Tenant")).toBeVisible();
  await expect(page.getByText("Snapshot Tenant Aktif")).toBeVisible();
});

test("guru dashboard keeps the same scaffold with teacher-specific content", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: /Halo, Selamat datang/i })).toBeVisible();
  await expect(page.getByText("Buat 40 soal dalam 30 detik dengan AI")).toBeVisible();
  await expect(page.getByText("Hasil Siswa")).toBeVisible();
});

test("student dashboard now follows the same scaffold as the other roles", async ({ page }) => {
  await seedAuthSession(page, "siswa");
  await registerMvpApiMocks(page);

  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: /Halo, Selamat Datang/i })).toBeVisible();
  await expect(page.getByText("Leaderboard Kelas")).toBeVisible();
  await expect(page.getByText("Recent Results")).toBeVisible();
});

test("super admin dashboard uses platform tenants as its data source", async ({ page }) => {
  await seedAuthSession(page, "super_admin");
  await registerMvpApiMocks(page);

  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: /Platform Overview — Super Admin/i })).toBeVisible();
  await expect(page.getByText("Status Sistem", { exact: false })).toBeVisible();
  await expect(page.getByText("Aktivitas Terbaru", { exact: false })).toBeVisible();
  await expect(page.getByText("SMA Negeri 1 Jakarta").first()).toBeVisible();
});

test("admin pages render users and classes with the unified design language", async ({ page }) => {
  await seedAuthSession(page, "admin");
  await registerMvpApiMocks(page);

  await page.goto("/app/users");
  await expect(page.getByRole("heading", { name: /Kelola akun admin/i })).toBeVisible();
  await expect(page.getByText("Admin Xamina")).toBeVisible();

  await page.goto("/app/classes");
  await expect(page.getByRole("heading", { name: /Susun struktur kelas/i })).toBeVisible();
  await expect(page.getByText("XII IPA 1")).toBeVisible();
});

test("super admin tenants page renders onboarding and tenant management", async ({ page }) => {
  await seedAuthSession(page, "super_admin");
  await registerMvpApiMocks(page);

  await page.goto("/app/platform/tenants");
  await expect(page.getByRole("heading", { name: "Onboarding Sekolah Baru" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tenant Management" })).toBeVisible();
  await expect(page.getByText("SMA Negeri 1 Jakarta")).toBeVisible();

  const wizard = page.locator("#create-tenant-section");
  await wizard.locator("input").nth(0).fill("SMA Test");
  await wizard.locator("input").nth(1).fill("sma-test");
  await page.getByRole("button", { name: "Selanjutnya" }).click();
  await page.getByRole("button", { name: "Tinjau Konfirmasi" }).click();
  await page.getByRole("button", { name: "Daftarkan Tenant" }).click();
  await expect(page.getByText("Tenant berhasil dibuat.")).toBeVisible();
});

test("AI generator and review flow use the shared modal system", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/question-bank");
  await page.getByRole("button", { name: "✨ AI Generator" }).click();
  const modal = page.locator(".modal-panel").first();
  await expect(modal.getByRole("heading", { name: "AI Question Generator" })).toBeVisible();

  await modal.getByRole("textbox").first().fill("Tata Surya");
  await modal.getByRole("button", { name: "Generate Questions" }).click();

  await expect(page.getByRole("heading", { name: "Review Generated Questions" })).toBeVisible();
  await expect(page.getByText("Planet terdekat dengan Matahari adalah?")).toBeVisible();
  await page.getByRole("button", { name: "Add to Bank Soal" }).click();
  await expect(page.getByText("Pertanyaan AI berhasil dimasukkan ke Bank Soal")).toBeVisible();
});

test("exam monitor shows live websocket surface and REST fallback data", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await mockLiveExamSocket(page);
  await registerMvpApiMocks(page);

  await page.goto("/app/exams/monitor/exam-1");
  await expect(page.getByRole("heading", { name: "Monitor Ujian Live" })).toBeVisible();
  await expect(page.getByText("Siswa Live")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Semua Submission" })).toBeVisible();
  await expect(page.getByText("Siswa A")).toBeVisible();
  await expect(page.locator(".surface-muted").filter({ hasText: "blur_window" }).first()).toBeVisible();
});

test("student routes render exam list, result, and certificates", async ({ page }) => {
  await seedAuthSession(page, "siswa");
  await registerMvpApiMocks(page);

  await page.goto("/app/my-exams");
  await expect(page.getByText("Ujian E2E")).toBeVisible();

  await page.goto("/app/my-exams/result/sub-1");
  await expect(page.getByRole("heading", { name: /Ringkasan hasil ujian/i })).toBeVisible();
  await expect(page.getByText("PASSED")).toBeVisible();

  await page.goto("/app/my-certificates");
  await expect(page.getByRole("heading", { name: /Preview dan unduh sertifikat/i })).toBeVisible();
  await expect(page.getByText("CERT-20260305-ABCD1234")).toBeVisible();
});

test("student exam session renders navigation and timer shell", async ({ page }) => {
  await seedAuthSession(page, "siswa");
  await registerMvpApiMocks(page);

  await page.goto("/app/my-exams/session/sub-1");
  await expect(page.getByText("Submission: sub-1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
  await expect(page.getByText("Ibu kota Indonesia adalah?")).toBeVisible();
});

test.use({ viewport: { width: 390, height: 844 } });

test("mobile dashboard shell stays visually coherent in fun mode", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/dashboard");
  await page.getByRole("button", { name: /Fun/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "fun");
  await page.screenshot({ path: test.info().outputPath("dashboard-mobile-fun.png"), fullPage: true });
});
