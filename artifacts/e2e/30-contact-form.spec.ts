import { test, expect } from "@playwright/test";
import { CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Public Site — Contact Form", () => {
  test("Visitor can submit contact form", async ({ page }) => {
    await page.goto(`${CP}/sites/${TEST_ORG_SLUG}/contact`, {
      waitUntil: "domcontentloaded",
    });

    const body = page.locator("body");
    await expect(body).toBeVisible();
    await expect(body).not.toContainText(/404|not found|site not found/i);

    const name = `Playwright Visitor ${Date.now()}`;
    const email = `visitor.${Date.now()}@example.com`;

    const nameInput = page.locator(
      'input[name="name"], input[placeholder*="name" i]',
    ).first();

    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    ).first();

    const messageInput = page.locator(
      'textarea[name="message"], textarea[placeholder*="message" i]',
    ).first();

    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await nameInput.fill(name);

    await expect(emailInput).toBeVisible();
    await emailInput.fill(email);

    await expect(messageInput).toBeVisible();
    await messageInput.fill("This is a Playwright contact form test.");

    const submitResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/contact") &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );

    await page.getByRole("button", { name: /send|submit|contact/i }).click();

    const res = await submitResponse;
    expect(res.ok(), `Contact form POST failed: ${res.status()}`).toBe(true);

    await expect(page.locator("body")).toContainText(
      /thank|sent|received|success/i,
      { timeout: 10000 },
    );
  });
});