import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test("Uma — selecting an AI-picked hero image keeps builder stable", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/site" });

  const aiPicks = page.getByRole("button", { name: /ai picks/i }).first();
  await expect(aiPicks).toBeVisible({ timeout: 15000 });
  await aiPicks.click();

  // In CommunityBuilder, each suggested photo is a <button> containing an <img>.
  // Do not target all page images because dashboard logos/icons also exist.
  const photoTile = page.locator('button:has(img)').filter({
    has: page.locator('img[src*="images.unsplash.com"], img[src*="unsplash"]'),
  }).first();

  await expect(photoTile).toBeVisible({ timeout: 15000 });
  await photoTile.click();

  await expect(page.locator("body")).not.toContainText(/failed to apply photo|internal server error|cannot get|econnrefused/i);
});
