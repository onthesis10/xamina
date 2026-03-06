import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("exam session and result remain usable on mobile viewport", async ({ page }) => {
  await seedAuthSession(page, "siswa");
  await registerMvpApiMocks(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/my-exams/session/sub-1");

  await expect(page.locator(".exam-session-fullscreen")).toBeVisible();
  await expect(page.getByText("Sisa waktu:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();

  await page.goto("/app/my-exams/result/sub-1");
  await expect(page.getByText("PASSED")).toBeVisible();
  await expect(page.getByText("Score: 100")).toBeVisible();
});
