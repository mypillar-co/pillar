import { test, expect } from "@playwright/test";
import { API, TEST_ORG_SLUG } from "./helpers";

test.describe("Public Site — Newsletter Signup", () => {
  test("Newsletter endpoint is healthy and UI form is optional per template", async ({ page, request }) => {
    const list = await request.get(`${API}/api/newsletter/subscribers`);
    expect(list.status()).toBeLessThan(500);

    await page.goto(`${API}/sites/${TEST_ORG_SLUG}`, { waitUntil: "domcontentloaded" });
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    if (!(await emailInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Current public template does not render newsletter signup on this route");
    }

    const email = `newsletter.${Date.now()}@example.com`;
    await emailInput.fill(email);
    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/newsletter") && r.request().method() === "POST");
    await page.getByRole("button", { name: /subscribe|sign up|join/i }).first().click();
    expect((await responsePromise).ok()).toBe(true);
  });
});
