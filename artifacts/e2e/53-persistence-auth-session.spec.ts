import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Percy — auth session survives reload", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard" });

  await page.reload();

  await expect(page).toHaveURL(/dashboard/);

  const res = await page.request.get(`${STEWARD}/api/auth/user`);
  expect(res.status()).toBeLessThan(500);
});