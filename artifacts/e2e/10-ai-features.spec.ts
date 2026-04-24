import { test, expect } from "@playwright/test";
import { STEWARD, loginToSteward, TEST_ORG_SLUG } from "./helpers";

test.describe("AI Features", () => {

  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("AI edit box is present on website page", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    const hasEditBox = body?.includes("Apply changes") || body?.includes("Describe what") || body?.includes("UPDATE YOUR SITE");
    expect(hasEditBox, "AI edit box should be present").toBe(true);
    await page.screenshot({ path: "e2e-report/pages/ai-edit-box.png", fullPage: true });
  });

  test("AI edit suggestion chips are present", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    const hasChips = body?.includes("Change our contact") || body?.includes("Update our colors") || body?.includes("Change meeting") || body?.includes("Update our tagline") || body?.includes("Add a photo");
    expect(hasChips, "AI edit suggestion chips should be visible").toBe(true);
  });

  test("Content Studio press release task is accessible", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body).toContain("Press Release");
    await page.screenshot({ path: "e2e-report/pages/content-studio.png", fullPage: true });
  });

  test("Hero image picker section is visible on website page", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    const hasPicker = body?.includes("HOMEPAGE BANNER") || body?.includes("Homepage Banner") || body?.includes("AI picks") || body?.includes("Upload photo") || body?.includes("banner");
    expect(hasPicker, "Hero image picker should be visible").toBe(true);
  });

  test("Site preview iframe is present", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const iframe = page.locator("iframe");
    const count = await iframe.count();
    expect(count, "Site preview iframe should be present").toBeGreaterThan(0);
    await page.screenshot({ path: "e2e-report/pages/site-preview-iframe.png", fullPage: true });
  });

});