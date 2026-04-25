
import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Paula — response time under threshold", async ({ page }) => {
  await loginToSteward(page);

  const start = Date.now();
  const res = await page.request.get(`${STEWARD}/api/events`);
  const duration = Date.now() - start;

  expect(res.status()).toBeLessThan(500);
  expect(duration).toBeLessThan(3000);
});
