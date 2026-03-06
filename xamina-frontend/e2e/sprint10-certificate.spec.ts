import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("student can access certificate from exam result and certificate page", async ({ page }) => {
  await seedAuthSession(page, "siswa");
  await registerMvpApiMocks(page);

  await page.goto("/app/my-exams/result/sub-1");
  await expect(page.getByRole("heading", { name: "Hasil Ujian" })).toBeVisible();
  const downloadLink = page.getByRole("link", { name: "Download Sertifikat" });
  await expect(downloadLink).toBeVisible();
  await expect(downloadLink).toHaveAttribute("href", /\/api\/v1\/certificates\/cert-1\/download$/);

  await page.goto("/app/my-certificates");
  await expect(page.getByRole("heading", { name: "Sertifikat Saya" })).toBeVisible();
  await expect(page.getByText("CERT-20260305-ABCD1234")).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Preview Sertifikat" })).toBeVisible();
});
