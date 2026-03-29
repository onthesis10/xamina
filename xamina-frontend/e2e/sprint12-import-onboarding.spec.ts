import { expect, test, type Page } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

async function seedUiStore(page: Page, coreTourStep: number) {
  await page.addInitScript(({ step }) => {
    window.localStorage.setItem(
      "xamina-ui-storage",
      JSON.stringify({
        state: {
          activeTenantId: null,
          coreTourStatus: "active",
          coreTourStep: step,
        },
        version: 0,
      }),
    );
  }, { step: coreTourStep });
}

test("question bank import wizard previews rows and shows onboarding step", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await seedUiStore(page, 1);
  await registerMvpApiMocks(page);

  await page.goto("/app/question-bank");
  await expect(page.locator('section.onboarding-tour[data-tour="question_bank"]')).toBeVisible();
  await expect(page.getByText("Import dan rapikan Bank Soal")).toBeVisible();

  await page.getByRole("button", { name: "Import Wizard" }).click();
  const importDialog = page.locator(".question-import-dialog");
  await expect(importDialog).toBeVisible();
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "questions.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("mock-xlsx"),
  });

  await importDialog.getByRole("button", { name: "Preview Import" }).click();
  await expect(importDialog.getByText("Valid: 1", { exact: true })).toBeVisible();
  await expect(importDialog.getByText("Invalid: 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Missing required field: answer_key")).toBeVisible();

  await importDialog.getByRole("button", { name: "Commit Valid Rows" }).click();
  await expect(page.getByText("1 soal berhasil diimport.")).toBeVisible();
});

test("dashboard shows first-run onboarding and loading skeleton", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await seedUiStore(page, 0);
  await registerMvpApiMocks(page);

  await page.route("**/api/v1/dashboard/summary", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          role: "guru",
          exams_total: 4,
          published_exams_total: 2,
          submissions_total: 54,
          avg_score: 78.2,
          pass_rate: 71.5,
          trend_7d: [],
        },
      }),
    });
  });

  await page.goto("/app/dashboard");
  await expect(page.locator('section.onboarding-tour[data-tour="dashboard"]')).toBeVisible();
  await expect(page.getByText("Mulai dari Dashboard")).toBeVisible();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();
});
