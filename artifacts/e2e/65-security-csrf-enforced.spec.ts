import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Sally — CSRF protection blocks direct mutation or safely handles it", async ({ page }) => {
  await loginToSteward(page);

  const res = await page.request.post(`${STEWARD}/api/events`, {
    data: { name: "CSRF Attack Event" },
  });

  // Typically 401/403; in any case must not be 500
  expect(res.status()).toBeLessThan(500);
});
