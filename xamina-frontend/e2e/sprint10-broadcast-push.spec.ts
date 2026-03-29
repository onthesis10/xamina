import { expect, test } from "@playwright/test";

import { registerMvpApiMocks } from "./helpers/mock-api";
import { seedAuthSession } from "./helpers/session";

test("guru can send broadcast from reports panel", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Broadcast Message" })).toBeVisible();
  await page.getByPlaceholder("Judul broadcast").fill("Pengumuman");
  await page.getByPlaceholder("Isi pesan broadcast").fill("Ujian dibuka besok pukul 08.00.");
  await page.getByRole("button", { name: "Kirim Broadcast" }).click();
  await expect(page.getByText("Broadcast terkirim ke 1 user")).toBeVisible();
});

test("push toggle handles denied notification permission gracefully", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, value: "denied" });
    Notification.requestPermission = async () => "denied";
  });
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  await page.goto("/app/dashboard");
  await expect(page.getByRole("button", { name: "Push: Denied" })).toBeVisible();
});

test("push receipt endpoint can be called by service-worker relay contract", async ({ page }) => {
  await seedAuthSession(page, "guru");
  await registerMvpApiMocks(page);

  let receiptRequestCount = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/v1/notifications/push/receipt")
    ) {
      receiptRequestCount += 1;
    }
  });

  await page.goto("/app/dashboard");
  await page.evaluate(async () => {
    await fetch("/api/v1/notifications/push/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receipt_token: "11111111-1111-1111-1111-111111111111",
        event_type: "received",
        metadata: { source: "playwright" },
      }),
    });
  });

  expect(receiptRequestCount).toBe(1);
});
