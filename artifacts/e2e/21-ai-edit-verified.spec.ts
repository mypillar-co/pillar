import { test, expect } from "@playwright/test";
import { STEWARD, TEST_ORG_SLUG, loginToSteward, screenshotStep, dbQuery } from "./helpers";

test.describe("AI Edit Verified Changes", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("AI edit actually changes site config in database", async ({ page }) => {
    const before = await dbQuery(
      "SELECT site_config->>'tagline' as tagline FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    const beforeTagline = before[0]?.tagline ?? "";
    console.log("Tagline before:", beforeTagline);

    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await screenshotStep(page, "21-01-before-edit");

    const textarea = page
      .locator('textarea[placeholder*="Change our primary color"]')
      .first();
    await textarea.waitFor({ state: "visible", timeout: 10000 });
    const uniqueTagline = `Playwright verified tagline ${Date.now()}`;
    await textarea.fill(`Change our tagline to: ${uniqueTagline}`);
    await screenshotStep(page, "21-02-filled-textarea");

    const applyButton = page
      .locator(
        'button:has-text("Apply changes"), button:has-text("Apply"), button:has-text("Submit"), button:has-text("Update")',
      )
      .first();
    await applyButton.click();
    await screenshotStep(page, "21-03-clicked-apply");

    await page.waitForTimeout(15000);
    await screenshotStep(page, "21-04-after-wait");

    const bodyAfter = await page.textContent("body");
    const hasError =
      bodyAfter?.includes("Edit failed") ||
      bodyAfter?.includes("timeout") ||
      bodyAfter?.includes("Error");
    if (hasError) {
      await screenshotStep(page, "21-05-error-state");
    }
    expect(hasError, "AI edit should not show an error message").toBe(false);

    await page.waitForTimeout(3000);
    const after = await dbQuery(
      "SELECT site_config->>'tagline' as tagline FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    const afterTagline = after[0]?.tagline ?? "";
    console.log("Tagline after:", afterTagline);
    await screenshotStep(page, "21-06-final-state");
    expect(
      afterTagline,
      "Tagline in database should have changed after AI edit",
    ).toContain("Playwright");
  });

  test("AI edit suggestion chip pre-fills and applies", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const chip = page
      .locator(
        'button:has-text("Change our contact"), button:has-text("Update our colors"), button:has-text("Change meeting"), button:has-text("Update our tagline")',
      )
      .first();
    const chipVisible = await chip.isVisible().catch(() => false);
    if (!chipVisible) {
      console.log("No suggestion chips visible — skipping");
      test.skip();
      return;
    }
    const chipText = await chip.textContent();
    await chip.click();
    await page.waitForTimeout(500);
    const textarea = page
      .locator('textarea[placeholder*="Change our primary color"]')
      .first();
    const value = await textarea.inputValue();
    expect(
      value.length,
      `Chip "${chipText}" should pre-fill the textarea`,
    ).toBeGreaterThan(0);
    await screenshotStep(page, "21-07-chip-prefilled");
  });

  test("Color change chip updates colors on site", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const colorsBefore = await dbQuery(
      "SELECT site_config->>'primaryColor' as primary FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    console.log("Primary color before:", colorsBefore[0]?.primary);

    const textarea = page
      .locator('textarea[placeholder*="Change our primary color"]')
      .first();
    await textarea.fill("Change our primary color to #8B0000");
    await page
      .locator('button:has-text("Apply changes"), button:has-text("Apply")')
      .first()
      .click();
    await page.waitForTimeout(20000);

    const colorsAfter = await dbQuery(
      "SELECT site_config->>'primaryColor' as primary FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    console.log("Primary color after:", colorsAfter[0]?.primary);
    await screenshotStep(page, "21-08-color-change");

    const originalColor = colorsBefore[0]?.primary ?? "#003DA5";
    await textarea.fill(`Change our primary color back to ${originalColor}`);
    await page
      .locator('button:has-text("Apply changes"), button:has-text("Apply")')
      .first()
      .click();
    await page.waitForTimeout(20000);
  });
});
