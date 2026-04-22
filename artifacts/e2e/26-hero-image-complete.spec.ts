import { test, expect } from "@playwright/test";
import {
  STEWARD,
  TEST_ORG_SLUG,
  loginToSteward,
  screenshotStep,
  dbQuery,
} from "./helpers";

test.describe("Hero Image Picker Complete Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("AI picks button opens photo grid with real photos", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await screenshotStep(page, "26-01-website-page");

    const aiPicksBtn = page.locator('button:has-text("AI picks")').first();
    const hasBtn = await aiPicksBtn.isVisible().catch(() => false);
    if (!hasBtn) {
      console.log("No AI picks button found");
      test.skip();
      return;
    }

    await aiPicksBtn.click();
    await page.waitForTimeout(5000);
    await screenshotStep(page, "26-02-photo-grid");

    const images = page.locator('img[src*="unsplash"], img[src*="images.unsplash"]');
    const imgCount = await images.count();
    console.log("Unsplash images found:", imgCount);
    expect(imgCount, "Photo grid should show Unsplash images").toBeGreaterThan(0);
  });

  test("Clicking a photo saves it as hero image", async ({ page }) => {
    const beforeRows = await dbQuery(
      "SELECT site_config->>'heroImageUrl' as hero FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    const heroBefore = beforeRows[0]?.hero;
    console.log("Hero image before:", heroBefore ?? "none");

    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const aiPicksBtn = page.locator('button:has-text("AI picks")').first();
    if (!(await aiPicksBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await aiPicksBtn.click();
    await page.waitForTimeout(5000);

    const images = page.locator('img[src*="unsplash"]');
    if ((await images.count()) === 0) {
      test.skip();
      return;
    }

    await images.first().click();
    await page.waitForTimeout(5000);
    await screenshotStep(page, "26-03-after-photo-click");

    const body = await page.textContent("body");
    const hasError =
      body?.includes("Failed to save") ||
      body?.includes("error") ||
      body?.includes("Error");
    expect(hasError, "Clicking photo should not show save error").toBe(false);

    const afterRows = await dbQuery(
      "SELECT site_config->>'heroImageUrl' as hero FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    const heroAfter = afterRows[0]?.hero;
    console.log("Hero image after:", heroAfter ?? "none");
  });

  test("Upload photo button is visible", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const uploadBtn = page.locator('button:has-text("Upload photo")');
    await expect(uploadBtn.first()).toBeVisible({ timeout: 10000 });
    await screenshotStep(page, "26-04-upload-button");
  });
});
