import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

async function openSiteBuilderReady(page: any) {
  await loginToSteward(page, { targetPath: "/dashboard/site" });
  await page.waitForLoadState("domcontentloaded");
}

test("Uma — AI image picker opens and returns choices", async ({ page }) => {
  await openSiteBuilderReady(page);

  const aiPicks = page.getByRole("button", { name: /ai picks/i }).first();
  await expect(aiPicks).toBeVisible({ timeout: 15000 });
  await aiPicks.click();

  await expect
    .poll(async () => await page.locator("img").count(), { timeout: 20000 })
    .toBeGreaterThanOrEqual(1);

  await expect(page.locator("body")).not.toContainText(/failed to load photos|internal server error|cannot get|econnrefused/i);
});
