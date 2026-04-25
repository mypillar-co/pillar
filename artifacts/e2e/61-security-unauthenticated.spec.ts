import { test, expect } from "@playwright/test";
import { STEWARD } from "./helpers";

test("Sally — unauthenticated user cannot access protected routes (no crash, no dashboard)", async ({ page }) => {
  await page.goto(`${STEWARD}/dashboard`);

  // Should not land on dashboard content when unauthenticated
  await expect(page).not.toHaveURL(/dashboard/);

  const res = await page.request.get(`${STEWARD}/api/members`);
  // Either blocked or returns safe response; never 500
  expect(res.status()).toBeLessThan(500);
});
