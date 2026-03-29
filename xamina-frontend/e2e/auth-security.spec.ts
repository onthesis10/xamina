import { expect, test } from "@playwright/test";

import { seedAuthSession } from "./helpers/session";

test("login challenge flow supports verify and resend otp", async ({ page }) => {
  let latestChallengeToken = "challenge-1";

  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          status: "challenge_required",
          challenge_token: latestChallengeToken,
          delivery: "email",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          reason_codes: ["recent_failed_logins", "new_device_or_ip"],
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/login/resend-email-otp", async (route) => {
    latestChallengeToken = "challenge-2";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          status: "challenge_required",
          challenge_token: latestChallengeToken,
          delivery: "email",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          reason_codes: ["recent_failed_logins"],
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/login/verify-email-otp", async (route) => {
    const body = route.request().postDataJSON() as { challenge_token: string; code: string };
    expect(body.challenge_token).toBe(latestChallengeToken);
    expect(body.code).toBe("123456");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          status: "authenticated",
          access_token: "access-token-1",
          refresh_token: "refresh-token-1",
          user: {
            id: "admin-1",
            tenant_id: "tenant-1",
            email: "admin@xamina.local",
            name: "Admin Security",
            role: "admin",
            class_id: null,
          },
        },
      }),
    });
  });

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("admin@xamina.local");
  await page.getByLabel("Password").fill("Admin123!");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByText("Login membutuhkan Email OTP")).toBeVisible();
  await expect(page.getByText("Ada percobaan login gagal berulang baru-baru ini.")).toBeVisible();

  await page.getByRole("button", { name: "Resend OTP" }).click();
  await page.getByLabel("Email OTP").fill("123456");
  await page.getByRole("button", { name: "Verify Email OTP" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard$/);
});

test("privacy settings shows security controls and recent activity", async ({ page }) => {
  await seedAuthSession(page, "admin");

  await page.route("**/api/v1/dashboard/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          tenant: {
            users_count: 10,
            users_quota: 50,
            ai_credits_used: 12,
            ai_credits_quota: 100,
          },
        },
      }),
    });
  });

  await page.route("**/api/v1/notifications*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [],
        meta: {
          page: 1,
          page_size: 8,
          total: 0,
          unread_count: 0,
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/privacy/delete-request", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: null,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "delete-1",
          reason: "cleanup",
          status: "pending",
          notes: null,
          requested_at: new Date().toISOString(),
          reviewed_at: null,
          processed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/privacy/security-settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            email_otp_enabled: true,
            recent_events: [
              {
                id: "evt-1",
                event_type: "challenge_verified",
                risk_level: "medium",
                reason_codes_jsonb: ["new_device_or_ip"],
                ip_address: "10.0.0.9",
                user_agent: "Playwright Browser",
                created_at: new Date().toISOString(),
              },
            ],
          },
        }),
      });
      return;
    }

    const body = route.request().postDataJSON() as {
      email_otp_enabled: boolean;
      current_password: string;
    };
    expect(body.current_password).toBe("Admin123!");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          email_otp_enabled: body.email_otp_enabled,
          recent_events: [],
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/privacy/export", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          generated_at: new Date().toISOString(),
          user: {
            id: "admin-1",
            tenant_id: "tenant-1",
            tenant_name: "Tenant",
            tenant_slug: "tenant",
            email: "admin@xamina.local",
            name: "Admin Security",
            role: "admin",
            class_id: null,
            class_name: null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          sessions: [],
          submissions: [],
          notifications: [],
          certificates: [],
          deletion_request: null,
        },
      }),
    });
  });

  await page.goto("/app/privacy");
  await expect(page.getByText("Always require Email OTP")).toBeVisible();
  await expect(page.getByText("challenge_verified")).not.toBeVisible();
  await expect(page.getByText("OTP verified")).toBeVisible();

  await page.getByPlaceholder("Masukkan password saat ini untuk konfirmasi").fill("Admin123!");
  await page.getByRole("button", { name: "Save Security Settings" }).click();
  await expect(page.getByText("Pengaturan keamanan berhasil diperbarui.")).toBeVisible();
});
