import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Paula — members API remains responsive under repeated reads", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/members" });

  const started = Date.now();

  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`${STEWARD}/api/members`, {
      timeout: 10000,
    });

    expect(res.status()).toBeLessThan(500);
  }

  const duration = Date.now() - started;

  expect(duration).toBeLessThan(15000);
});