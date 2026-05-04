import { expect, test } from "@playwright/test";

test.describe("Sprint 16 Public Routes & Navigation", () => {
  test("landing page should render correctly and have functional CTA buttons", async ({ page }) => {
    await page.goto("/");
    
    // Verify premium hero section
    await expect(page.locator("h1")).toContainText(/Platform Ujian/i);
    await expect(page.locator("h1")).toContainText(/Era Depan/i);
    
    // Verify feature grid exists
    await expect(page.locator("text=AI Question Generator")).toBeVisible();
    await expect(page.locator("text=Keamanan Enterprise")).toBeVisible();
    
    // Test navigation to onboarding
    const ctaStart = page.locator("a").filter({ hasText: /Mulai Evaluasi Gratis/i }).first();
    await ctaStart.click();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("help center should render correctly with search and categories", async ({ page }) => {
    await page.goto("/help");
    
    // Verify title and search
    await expect(page.locator("h1")).toContainText(/Apa yang bisa kami bantu\?/i);
    await expect(page.getByPlaceholder(/Cari panduan/i)).toBeVisible();
    
    // Verify categories
    await expect(page.locator("text=Panduan untuk Guru")).toBeVisible();
    await expect(page.locator("text=Billing & Langganan")).toBeVisible();
    
    // Verify popular articles
    await expect(page.locator("h2")).toContainText(/Artikel Populer/i);
  });

  test("onboarding self-serve flow wizard should progress steps", async ({ page }) => {
    await page.goto("/onboarding");
    
    // Step 1
    await expect(page.locator("h2")).toContainText(/Informasi Sekolah/i);
    await page.locator("input[placeholder*='Contoh: SMA Negeri']").fill("SMA Testing");
    await page.locator("button[type='submit']").click();
    
    // Step 2
    await expect(page.locator("h2")).toContainText(/Akun Administrator/i);
    await page.locator("input[placeholder*='Masukkan nama Anda']").fill("Admin Tester");
    await page.locator("input[type='email']").fill("admin@smatesting.sch.id");
    await page.locator("input[type='password']").first().fill("password123");
    await page.locator("input[placeholder*='Ulangi kata sandi']").fill("password123");
    await page.locator("button[type='submit']").click();
    
    // Step 3
    await expect(page.locator("h2")).toContainText(/Siap Memulai\?/i);
    await expect(page.locator("button[type='submit']")).toContainText(/Selesai/i);
  });
});
