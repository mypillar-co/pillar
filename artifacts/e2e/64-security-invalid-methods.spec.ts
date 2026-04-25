import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Sally — invalid HTTP methods are rejected or safely handled (no crash)", async ({ page }) => {
  await loginToSteward(page);

  const res = await page.request.patch(`${STEWARD}/api/events`, {
    data: {},
  });

  // Could be 400/403/404/405 depending on routing & middleware; must not be 500
  expect(res.status()).toBeLessThan(500);
});
