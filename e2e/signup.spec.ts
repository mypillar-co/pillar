import { test, expect } from "@playwright/test";

function uniqueEmail() {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `e2e+${stamp}@pillar-tests.local`;
}

// Bot check requires the form to have been on screen >= 1200ms before submit.
const FORM_DWELL_MS = 1500;

test.describe("Signup flow", () => {
  // Use autoComplete-attribute selectors — they're stable across UI/copy changes.
  const sel = {
    firstName: 'input[autocomplete="given-name"]',
    lastName: 'input[autocomplete="family-name"]',
    email: 'input[autocomplete="email"]',
    password: 'input[autocomplete="new-password"]',
  };

  test("user can register with email and lands on /onboard", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();

    await page.locator(sel.firstName).fill("Test");
    await page.locator(sel.lastName).fill("User");
    await page.locator(sel.email).fill(email);
    await page.locator(sel.password).fill("test-password-1234");

    // Wait out the bot-check dwell window before submitting.
    await page.waitForTimeout(FORM_DWELL_MS);

    await Promise.all([
      page.waitForURL(/\/onboard/, { timeout: 15_000 }),
      page.getByRole("button", { name: /create account|sign up/i }).click(),
    ]);

    expect(page.url()).toMatch(/\/onboard/);
  });

  test("rejects short password (client-side validation)", async ({ page }) => {
    await page.goto("/register");
    await page.locator(sel.email).fill(uniqueEmail());
    await page.locator(sel.password).fill("short");
    await page.getByRole("button", { name: /create account|sign up/i }).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });
});
