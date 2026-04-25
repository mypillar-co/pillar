
import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Paula — dashboard loads without slowdown", async ({ page }) => {
  await loginToSteward(page);

  const start = Date.now();
  await page.goto(`${STEWARD}/dashboard`);
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(4000);
});
