import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("question bank uses dedicated filter sidebar and passes basic a11y", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/question-bank");
  await expect(page.getByRole("heading", { name: "Filter & Aksi Bank Soal" })).toBeVisible();
  await expect(page.locator(".question-filter-sidebar")).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .exclude(".dialog-backdrop")
    .analyze();

  const seriousOrCritical = accessibilityScanResults.violations.filter(
    (item) => item.impact === "serious" || item.impact === "critical",
  );
  expect(seriousOrCritical).toEqual([]);
});
