import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("student can access certificate from exam result and certificate page", async ({ page }) => {
  await seedAuthSession(page, "siswa");
  await registerMvpApiMocks(page);

  await page.goto("/app/my-exams/result/sub-1");
  await expect(page.getByRole("heading", { name: "Hasil Ujian" })).toBeVisible();
  const resultDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Sertifikat" }).click();
  const resultDownload = await resultDownloadPromise;
  expect(resultDownload.suggestedFilename()).toContain("xamina-certificate");

  await page.goto("/app/my-certificates");
  await expect(page.getByRole("heading", { name: "Sertifikat Saya" })).toBeVisible();
  await expect(page.getByText("CERT-20260305-ABCD1234")).toBeVisible();
  const listDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).first().click();
  const listDownload = await listDownloadPromise;
  expect(listDownload.suggestedFilename()).toContain("xamina-certificate");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Preview Sertifikat" })).toBeVisible();
});
