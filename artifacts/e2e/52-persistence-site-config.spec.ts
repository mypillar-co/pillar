import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Percy — site config endpoint stays consistent after reload", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/site" });

  const before = await page.request.get(`${STEWARD}/api/community-site/target`);
  expect(before.status()).toBeLessThan(500);

  await page.reload();

  const after = await page.request.get(`${STEWARD}/api/community-site/target`);
  expect(after.status()).toBeLessThan(500);

  const text = await after.text();

  expect(text).not.toContain("Internal Server Error");
});