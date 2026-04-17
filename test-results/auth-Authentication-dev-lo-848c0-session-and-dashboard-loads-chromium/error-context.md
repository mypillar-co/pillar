# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> dev-login shortcut sets a session and dashboard loads
- Location: e2e/auth.spec.ts:4:7

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 400
Received:   404
```

# Page snapshot

```yaml
- generic [ref=e2]: Cannot GET /dashboard
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Authentication", () => {
  4  |   test("dev-login shortcut sets a session and dashboard loads", async ({ page }) => {
  5  |     const res = await page.goto("/api/auth/dev-login?email=pillartest@example.com");
> 6  |     expect(res?.status()).toBeLessThan(400);
     |                           ^ Error: expect(received).toBeLessThan(expected)
  7  | 
  8  |     await page.goto("/dashboard");
  9  |     // Dashboard should not redirect to /login
  10 |     await expect(page).toHaveURL(/\/dashboard/);
  11 |   });
  12 | 
  13 |   test("protected routes redirect anonymous users to /login", async ({ browser }) => {
  14 |     const ctx = await browser.newContext();
  15 |     const page = await ctx.newPage();
  16 |     await page.goto("/dashboard");
  17 |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  18 |     await ctx.close();
  19 |   });
  20 | });
  21 | 
```