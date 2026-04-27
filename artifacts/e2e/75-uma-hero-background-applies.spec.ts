import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test("Selected hero image creates or updates visible banner preview", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/site" });

  const panel = page.getByTestId("hero-image-panel").first();

  await expect(panel).toBeVisible({ timeout: 15000 });

  const suggestions = panel.getByTestId("hero-suggestion-toggle");
  await expect(suggestions).toBeVisible({ timeout: 15000 });
  await suggestions.click();

  const photoTile = panel.getByTestId("hero-photo-option").first();
  await expect(photoTile).toBeVisible({ timeout: 15000 });
  await photoTile.click();

  await expect(panel.locator('img[alt="Hero banner"]').first()).toBeVisible({
    timeout: 15000,
  });

  await expect(page.locator("body")).not.toContainText(
    /failed to apply photo|internal server error|cannot get|econnrefused/i,
  );
});
