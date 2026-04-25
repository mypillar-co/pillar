import { test, expect } from "@playwright/test";
import { STEWARD } from "./helpers";

test("Sally — cannot gain access with fake auth headers (no sensitive data exposure)", async ({ page }) => {
  const res = await page.request.get(`${STEWARD}/api/auth/user`, {
    headers: { Authorization: "Bearer fake-token" },
  });

  // May be 200 with safe payload or 401/403; must not be 500
  expect(res.status()).toBeLessThan(500);

  const text = await res.text();

  // Ensure no sensitive data is leaked
  expect(text).not.toContain("password");
  expect(text).not.toContain("token");
  expect(text).not.toContain("refreshToken");
});
