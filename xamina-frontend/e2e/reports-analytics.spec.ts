import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("reports page shows sprint11 exam insights and exports excel", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Filter Laporan" })).toBeVisible();
  await expect(page.getByText("Pilih exam dari filter untuk menampilkan analitik Sprint 11.")).toBeVisible();

  await page.locator("select").nth(1).selectOption("exam-1");

  await expect(page.getByRole("heading", { name: "Histogram Nilai" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Time Series Performa" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Item Analysis" })).toBeVisible();
  await expect(page.getByText("Ibu kota Indonesia adalah?")).toBeVisible();

  await page.getByRole("button", { name: "Export Excel" }).click();
  await expect(page.getByText("Export Excel berhasil.")).toBeVisible();
});
