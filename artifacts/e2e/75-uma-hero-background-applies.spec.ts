import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test("Uma — selected hero image creates or updates visible banner preview", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/site" });

  const aiPicks = page.getByRole("button", { name: /ai picks/i }).first();
  await expect(aiPicks).toBeVisible({ timeout: 15000 });
  await aiPicks.click();

  const photoTile = page.locator('button:has(img)').filter({
    has: page.locator('img[src*="images.unsplash.com"], img[src*="unsplash"]'),
  }).first();

  await expect(photoTile).toBeVisible({ timeout: 15000 });
  await photoTile.click();

  // After save, the HeroImagePanel renders the current banner preview.
  await expect(page.locator('img[alt="Hero banner"]').first()).toBeVisible({ timeout: 15000 });

  await expect(page.locator("body")).not.toContainText(/failed to apply photo|internal server error|cannot get|econnrefused/i);
});
