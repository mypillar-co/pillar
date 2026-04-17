import { test, expect } from "@playwright/test";

function uniqueEmail() {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `e2e+${stamp}@pillar-tests.local`;
}

test.describe("Signup flow", () => {
  test("user can register with email and lands on /onboard", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();

    await page.getByPlaceholder("Jane").fill("Test");
    await page.getByPlaceholder("Smith").fill("User");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill("test-password-1234");

    await Promise.all([
      page.waitForURL(/\/onboard/, { timeout: 15_000 }),
      page.getByRole("button", { name: /create account|sign up/i }).click(),
    ]);

    expect(page.url()).toMatch(/\/onboard/);
  });

  test("rejects short password", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("you@example.com").fill(uniqueEmail());
    await page.getByPlaceholder("••••••••").fill("short");
    await page.getByRole("button", { name: /create account|sign up/i }).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });

  test("rejects duplicate email", async ({ page, request }) => {
    const email = uniqueEmail();
    // First registration via API
    const r = await request.post("/api/auth/register", {
      data: { email, password: "test-password-1234", firstName: "X", lastName: "Y" },
    });
    expect(r.status()).toBeLessThan(400);

    await page.goto("/register");
    await page.getByPlaceholder("Jane").fill("Dupe");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("••••••••").fill("test-password-1234");
    await page.getByRole("button", { name: /create account|sign up/i }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
  });
});
