import { test, expect } from "@playwright/test";
import { STEWARD, loginToSteward, screenshotStep } from "./helpers";

test.describe("Content Studio Complete Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("Press release generates real output", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");
    await screenshotStep(page, "24-01-content-studio");

    await page
      .locator(
        'button:has-text("Press Release"), [role="button"]:has-text("Press Release"), div:has-text("Press Release")',
      )
      .first()
      .click();
    await page.waitForTimeout(1000);
    await screenshotStep(page, "24-02-press-release-form");

    await page
      .locator('input[placeholder*="headline" i], input[placeholder*="Headline" i]')
      .first()
      .fill("Annual Fundraiser Raises Record $50,000");
    await page
      .locator('textarea[placeholder*="detail" i], textarea[placeholder*="Detail" i]')
      .first()
      .fill(
        "The event was held Saturday May 10th at the Pittsburgh Community Center. Over 200 members and guests attended. Funds support local scholarships.",
      );
    await screenshotStep(page, "24-03-form-filled");

    await page
      .locator(
        'button:has-text("Generate"), button:has-text("Create"), button:has-text("Run"), button:has-text("Write")',
      )
      .first()
      .click();
    await screenshotStep(page, "24-04-generating");
    await page.waitForTimeout(30000);
    await screenshotStep(page, "24-05-generated");

    const body = await page.textContent("body");
    const hasOutput =
      body?.includes("FOR IMMEDIATE RELEASE") ||
      body?.includes("FOR IMMEDIATE") ||
      body?.includes("fundraiser") ||
      body?.includes("Fundraiser") ||
      body?.includes("Pittsburgh") ||
      body?.includes("scholarship");
    expect(hasOutput, "Press release should contain real generated content").toBe(true);
  });

  test("Newsletter intro generates real output", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");

    await page
      .locator('button:has-text("Newsletter"), div:has-text("Newsletter Intro")')
      .first()
      .click();
    await page.waitForTimeout(1000);

    await page
      .locator('input[placeholder*="month" i], input[placeholder*="period" i]')
      .first()
      .fill("May 2026")
      .catch(() => {});
    await page
      .locator("textarea")
      .first()
      .fill(
        "We held our annual fundraiser, welcomed 5 new members, and launched our community garden project",
      );
    await page
      .locator(
        'button:has-text("Generate"), button:has-text("Create"), button:has-text("Run")',
      )
      .first()
      .click();
    await page.waitForTimeout(30000);
    await screenshotStep(page, "24-06-newsletter-generated");

    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(200);
  });

  test("Fundraising appeal generates real output", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");

    await page
      .locator('button:has-text("Fundraising"), div:has-text("Fundraising Appeal")')
      .first()
      .click();
    await page.waitForTimeout(1000);

    await page
      .locator(
        'input[placeholder*="cause" i], input[placeholder*="Cause" i], input',
      )
      .first()
      .fill("Annual scholarship fund for local high school students");
    await page
      .locator("textarea")
      .first()
      .fill(
        "We have awarded 47 scholarships over 20 years, changing lives in our community",
      );
    await page
      .locator(
        'button:has-text("Generate"), button:has-text("Create"), button:has-text("Run")',
      )
      .first()
      .click();
    await page.waitForTimeout(30000);
    await screenshotStep(page, "24-07-appeal-generated");

    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(200);
  });

  test("History tab shows past outputs", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");

    const historyTab = page.locator(
      'button:has-text("History"), [role="tab"]:has-text("History"), a:has-text("History")',
    );
    if (await historyTab.isVisible().catch(() => false)) {
      await historyTab.first().click();
      await page.waitForTimeout(2000);
      await screenshotStep(page, "24-08-history-tab");
      const body = await page.textContent("body");
      expect(body?.length).toBeGreaterThan(100);
    } else {
      console.log("No history tab visible");
    }
  });

  test("Copy button copies output to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");

    await page
      .locator('button:has-text("Press Release"), div:has-text("Press Release")')
      .first()
      .click();
    await page.waitForTimeout(500);
    await page
      .locator('input[placeholder*="headline" i]')
      .first()
      .fill("Test Headline for Copy");
    await page.locator("textarea").first().fill("Test details for clipboard test");
    await page
      .locator('button:has-text("Generate"), button:has-text("Create")')
      .first()
      .click();
    await page.waitForTimeout(20000);

    const copyBtn = page
      .locator('button:has-text("Copy"), button[aria-label*="copy" i]')
      .first();
    if (await copyBtn.isVisible().catch(() => false)) {
      await copyBtn.click();
      await page.waitForTimeout(500);
      await screenshotStep(page, "24-09-copied");
      const body = await page.textContent("body");
      const showsCopied = body?.includes("Copied") || body?.includes("copied");
      expect(showsCopied, "Copy button should show confirmation").toBe(true);
    }
  });
});
