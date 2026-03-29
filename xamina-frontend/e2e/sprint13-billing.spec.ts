import { expect, test, type Page } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

async function seedUiStore(page: Page, activeTenantId: string | null) {
  await page.addInitScript(({ tenantId }) => {
    window.localStorage.setItem(
      "xamina-ui-storage",
      JSON.stringify({
        state: {
          activeTenantId: tenantId,
          coreTourStatus: "dismissed",
          coreTourStep: 0,
          themeMode: "light",
        },
        version: 0,
      }),
    );
  }, { tenantId: activeTenantId });
}

test("public pricing renders plans and login CTA", async ({ page }) => {
  await registerMvpApiMocks(page);

  await page.goto("/pricing");
  await expect(page.getByText("Pilih plan Xamina yang sesuai untuk skala sekolah Anda.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk untuk Checkout" }).first()).toBeVisible();
  await expect(page.getByText("Starter").first()).toBeVisible();
  await expect(page.getByText("Professional").first()).toBeVisible();
});

test("admin billing renders summary, creates checkout, and downloads invoice pdf", async ({ page }) => {
  await seedAuthSession(page, "admin");
  await seedUiStore(page, null);
  await registerMvpApiMocks(page);

  await page.goto("/app/billing");
  await expect(page.getByText("Subscription & Invoice Control")).toBeVisible();
  await expect(page.getByText("Starter").first()).toBeVisible();
  await expect(page.getByText("Billing History")).toBeVisible();

  await page.getByRole("button", { name: "Change Plan" }).first().click();
  await expect(page.getByText("Session billing sudah dibuat")).toBeVisible();
  await expect(page.getByRole("link", { name: "Buka Checkout" }).first()).toHaveAttribute("href", /mock-billing\.local/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("xamina-invoice");
});

test("platform billing shows empty state when tenant scope is missing", async ({ page }) => {
  await seedAuthSession(page, "super_admin");
  await seedUiStore(page, null);
  await registerMvpApiMocks(page);

  await page.goto("/app/platform/billing");
  await expect(page.getByText("Pilih tenant scope dulu")).toBeVisible();
  await expect(page.getByRole("link", { name: "Buka Platform Tenants" })).toBeVisible();
});

test("platform billing renders summary, creates checkout, and downloads invoice pdf", async ({ page }) => {
  await seedAuthSession(page, "super_admin");
  await seedUiStore(page, "tenant-1");
  await registerMvpApiMocks(page);

  await page.goto("/app/platform/billing");
  await expect(page.getByText("Subscription & Invoice Control")).toBeVisible();
  await expect(page.getByText("Starter").first()).toBeVisible();
  await expect(page.getByText("Billing History")).toBeVisible();

  await page.getByRole("button", { name: "Change Plan" }).first().click();
  await expect(page.getByText("Session billing sudah dibuat")).toBeVisible();
  await expect(page.getByRole("link", { name: "Buka Checkout" }).first()).toHaveAttribute("href", /mock-billing\.local/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("xamina-invoice");
});
