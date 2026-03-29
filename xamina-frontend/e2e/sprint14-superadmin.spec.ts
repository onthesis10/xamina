import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("superadmin platform console renders analytics and runtime health", async ({ page }) => {
  await seedAuthSession(page, "super_admin");
  await registerMvpApiMocks(page);

  await page.goto("/app/platform/console");
  await expect(page.getByRole("heading", { name: "Cross-Tenant Analytics & Runtime Health" })).toBeVisible();
  await expect(page.getByText("Top Tenants Snapshot")).toBeVisible();
  await expect(page.getByText("Dependency & Queue Summary")).toBeVisible();
  await expect(page.getByLabel("Preferred Provider")).toBeVisible();
});

test("superadmin can update ai config and see audit entry", async ({ page }) => {
  await seedAuthSession(page, "super_admin");
  await registerMvpApiMocks(page);

  await page.goto("/app/platform/console");
  await page.getByLabel("Preferred Provider").selectOption("openai");
  await page.getByRole("button", { name: "Simpan Config" }).click();
  await expect(page.getByText("Platform AI config berhasil disimpan.")).toBeVisible();

  await page.goto("/app/platform/audit-logs");
  await expect(page.getByText("Audit Log Viewer")).toBeVisible();
  await expect(page.getByText("platform.ai_config.updated")).toBeVisible();
});
