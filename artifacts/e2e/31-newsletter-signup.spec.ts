import { test, expect } from "@playwright/test";
import { CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Public Site — Newsletter Signup", () => {
  test("Visitor can sign up for newsletter", async ({ page }) => {
    await page.goto(`${CP}/sites/${TEST_ORG_SLUG}`, {
      waitUntil: "domcontentloaded",
    });

    const email = `newsletter.${Date.now()}@example.com`;

    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    ).first();

    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(email);

    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/newsletter") &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );

    await page.getByRole("button", {
      name: /subscribe|sign up|join/i,
    }).first().click();

    const res = await responsePromise;
    expect(res.ok(), `Newsletter signup failed: ${res.status()}`).toBe(true);

    await expect(page.locator("body")).toContainText(
      /thank|subscribed|success/i,
      { timeout: 10000 },
    );
  });
});