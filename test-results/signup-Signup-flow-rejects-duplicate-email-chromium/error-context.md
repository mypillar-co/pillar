# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup.spec.ts >> Signup flow >> rejects duplicate email
- Location: e2e/signup.spec.ts:36:7

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 400
Received:   400
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | function uniqueEmail() {
  4  |   const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  5  |   return `e2e+${stamp}@pillar-tests.local`;
  6  | }
  7  | 
  8  | test.describe("Signup flow", () => {
  9  |   test("user can register with email and lands on /onboard", async ({ page }) => {
  10 |     const email = uniqueEmail();
  11 | 
  12 |     await page.goto("/register");
  13 |     await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  14 | 
  15 |     await page.getByPlaceholder("Jane").fill("Test");
  16 |     await page.getByPlaceholder("Smith").fill("User");
  17 |     await page.getByPlaceholder("you@example.com").fill(email);
  18 |     await page.getByPlaceholder("••••••••").fill("test-password-1234");
  19 | 
  20 |     await Promise.all([
  21 |       page.waitForURL(/\/onboard/, { timeout: 15_000 }),
  22 |       page.getByRole("button", { name: /create account|sign up/i }).click(),
  23 |     ]);
  24 | 
  25 |     expect(page.url()).toMatch(/\/onboard/);
  26 |   });
  27 | 
  28 |   test("rejects short password", async ({ page }) => {
  29 |     await page.goto("/register");
  30 |     await page.getByPlaceholder("you@example.com").fill(uniqueEmail());
  31 |     await page.getByPlaceholder("••••••••").fill("short");
  32 |     await page.getByRole("button", { name: /create account|sign up/i }).click();
  33 |     await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  34 |   });
  35 | 
  36 |   test("rejects duplicate email", async ({ page, request }) => {
  37 |     const email = uniqueEmail();
  38 |     // First registration via API
  39 |     const r = await request.post("/api/auth/register", {
  40 |       data: { email, password: "test-password-1234", firstName: "X", lastName: "Y" },
  41 |     });
> 42 |     expect(r.status()).toBeLessThan(400);
     |                        ^ Error: expect(received).toBeLessThan(expected)
  43 | 
  44 |     await page.goto("/register");
  45 |     await page.getByPlaceholder("Jane").fill("Dupe");
  46 |     await page.getByPlaceholder("you@example.com").fill(email);
  47 |     await page.getByPlaceholder("••••••••").fill("test-password-1234");
  48 |     await page.getByRole("button", { name: /create account|sign up/i }).click();
  49 |     await expect(page.getByText(/already exists/i)).toBeVisible();
  50 |   });
  51 | });
  52 | 
```