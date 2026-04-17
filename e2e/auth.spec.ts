import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("dev-login shortcut sets a session and dashboard loads", async ({ page }) => {
    const res = await page.goto("/api/auth/dev-login?email=pillartest@example.com");
    expect(res?.status()).toBeLessThan(400);

    await page.goto("/dashboard");
    // Dashboard should not redirect to /login
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("protected routes redirect anonymous users to /login", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await ctx.close();
  });
});
