import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("dev-login shortcut sets a session and dashboard loads", async ({ page }) => {
    const res = await page.goto("/api/auth/dev-login?email=pillartest@example.com");
    expect(res?.status()).toBeLessThan(400);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("protected dashboard redirects anonymous users away", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    // Client-side auth guard redirects to "/" (landing) when unauthenticated.
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/dashboard"),
      { timeout: 15_000 },
    );
    expect(new URL(page.url()).pathname).not.toMatch(/^\/dashboard/);
    await ctx.close();
  });
});
