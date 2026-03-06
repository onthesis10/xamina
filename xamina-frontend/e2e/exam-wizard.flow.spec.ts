import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("exam wizard supports create -> attach -> precheck -> publish flow", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/exams");
  await expect(page.getByText("Step 1/4 - Basic Info")).toBeVisible();

  await page.getByLabel("Exam title").fill("Ujian Wizard E2E");
  await page.getByRole("button", { name: "Next: Settings" }).click();
  await page.getByRole("button", { name: "Next: Schedule" }).click();
  await page.getByRole("button", { name: "+60m" }).click();
  await page.getByRole("button", { name: "Next: Preview" }).click();
  await page.getByRole("button", { name: "Simpan Ujian" }).click();
  await expect(page.getByText("Ujian berhasil dibuat.")).toBeVisible();

  await page.getByRole("button", { name: "Manage" }).first().click();
  await expect(page.getByText("Manage Exam")).toBeVisible();

  await page.getByLabel("Select question q-1").check();
  await page.getByRole("button", { name: /Attach Questions/ }).click();

  await page.getByRole("button", { name: "Run Precheck" }).click();
  await expect(page.getByText("Publishable: Yes")).toBeVisible();

  await page.getByRole("button", { name: "Publish Exam" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Status: published")).toBeVisible();
});
