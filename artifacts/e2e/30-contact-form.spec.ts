import { test, expect } from "@playwright/test";
import { API, TEST_ORG_SLUG } from "./helpers";

test.describe("Public Site — Contact Form", () => {
  test("Contact route responds and form is optional per template", async ({ page }) => {
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/contact`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (!(await nameInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Current public template does not render a contact form on this route");
    }

    const name = `Playwright Visitor ${Date.now()}`;
    const email = `visitor.${Date.now()}@example.com`;
    await nameInput.fill(name);
    await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
    await page.locator('textarea[name="message"], textarea[placeholder*="message" i]').first().fill("This is a Playwright contact form test.");

    const submitResponse = page.waitForResponse((r) => r.url().includes("/api/contact") && r.request().method() === "POST");
    await page.getByRole("button", { name: /send|submit|contact/i }).click();
    expect((await submitResponse).ok()).toBe(true);
  });
});
