import { test, expect } from "@playwright/test";
import { CP } from "./helpers";

test("Sally — cross-tenant access does not leak data", async ({ page }) => {
  const res = await page.request.get(`${CP}/api/members`, {
    headers: { "x-org-id": "fake-org-123" },
  });

  // Public endpoints may return 200, but must not crash
  expect(res.status()).toBeLessThan(500);

  const text = await res.text();

  // Ensure we are not leaking known test org identifiers or obvious sensitive fields
  expect(text).not.toContain("test-org-pillar-001");
  expect(text).not.toContain("password");
  expect(text).not.toContain("hashedPassword");
});
