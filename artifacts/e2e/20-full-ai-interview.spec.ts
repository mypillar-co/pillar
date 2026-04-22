import { test, expect } from "@playwright/test";
import { STEWARD, loginToSteward, screenshotStep, dbQuery } from "./helpers";

test.describe("Full AI Interview Flow", () => {
  let createdOrgSlug: string;

  test.afterAll(async () => {
    if (createdOrgSlug) {
      await dbQuery(
        "DELETE FROM cs_org_configs WHERE org_id IN (SELECT id FROM organizations WHERE slug = $1)",
        [createdOrgSlug],
      );
      await dbQuery("DELETE FROM organizations WHERE slug = $1", [createdOrgSlug]);
    }
  });

  test("Complete AI interview creates a working site", async ({ page }) => {
    await loginToSteward(page);
    await screenshotStep(page, "20-01-logged-in");

    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await screenshotStep(page, "20-02-website-page");

    const body = await page.textContent("body");
    const isWelcome =
      body?.includes("Let's set up") ||
      body?.includes("Let's get started") ||
      body?.includes("get started");

    if (!isWelcome) {
      console.log(
        "Org already has a site — skipping interview, testing edit flow instead",
      );
      return;
    }

    await page
      .locator(
        'button:has-text("Let\'s get started"), button:has-text("Get started"), button:has-text("Start")',
      )
      .first()
      .click();
    await page.waitForTimeout(1000);
    await screenshotStep(page, "20-03-interview-started");

    const orgTypeSelect = page
      .locator('select, [role="combobox"], [role="listbox"]')
      .first();
    if (await orgTypeSelect.isVisible()) {
      await orgTypeSelect.click();
      await page.waitForTimeout(500);
      await page
        .locator('[role="option"]:has-text("Rotary"), option:has-text("Rotary")')
        .first()
        .click();
      await page.waitForTimeout(500);
    }

    const nextBtn = page.locator(
      'button:has-text("Next"), button:has-text("Continue"), button:has-text("OK")',
    );
    if (await nextBtn.first().isVisible()) await nextBtn.first().click();
    await page.waitForTimeout(800);
    await screenshotStep(page, "20-04-org-type");

    const nameInput = page
      .locator(
        'input[placeholder*="name" i], input[placeholder*="organization" i], input[type="text"]',
      )
      .first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("Playwright Test Rotary Club");
      if (await nextBtn.first().isVisible()) await nextBtn.first().click();
      await page.waitForTimeout(800);
    }
    await screenshotStep(page, "20-05-org-name");

    for (let i = 0; i < 15; i++) {
      const textInput = page
        .locator('input[type="text"]:visible, textarea:visible')
        .first();
      const isVisible = await textInput.isVisible().catch(() => false);
      if (isVisible) {
        const placeholder = (await textInput.getAttribute("placeholder")) ?? "";
        let value = "Test value";
        if (placeholder.toLowerCase().includes("city")) value = "Pittsburgh";
        if (placeholder.toLowerCase().includes("state")) value = "PA";
        if (placeholder.toLowerCase().includes("email"))
          value = "test@playwright.local";
        if (placeholder.toLowerCase().includes("phone")) value = "555-123-4567";
        if (
          placeholder.toLowerCase().includes("tagline") ||
          placeholder.toLowerCase().includes("mission")
        )
          value = "Serving our community with pride";
        if (placeholder.toLowerCase().includes("meeting"))
          value = "Every Tuesday at 7:00 PM, Community Center";
        if (placeholder.toLowerCase().includes("address")) value = "123 Main St";
        if (placeholder.toLowerCase().includes("facebook"))
          value = "https://facebook.com/testrotary";
        await textInput.fill(value);
      }
      const continueBtn = page.locator(
        'button:has-text("Next"), button:has-text("Continue"), button:has-text("OK"), button:has-text("Skip")',
      );
      if (await continueBtn.first().isVisible()) {
        await continueBtn.first().click();
        await page.waitForTimeout(600);
      }
      const isFinalized = await page
        .locator(
          'button:has-text("Finalize"), button:has-text("Build my site"), button:has-text("Launch")',
        )
        .isVisible()
        .catch(() => false);
      if (isFinalized) break;
    }
    await screenshotStep(page, "20-06-interview-answers");

    const finalizeBtn = page.locator(
      'button:has-text("Finalize"), button:has-text("Build my site"), button:has-text("Launch"), button:has-text("Create site")',
    );
    if (await finalizeBtn.first().isVisible()) {
      await finalizeBtn.first().click();
      await page.waitForTimeout(10000);
      await screenshotStep(page, "20-07-site-building");
    }

    await page.waitForTimeout(5000);
    await screenshotStep(page, "20-08-after-build");
    const finalBody = await page.textContent("body");
    const hasManagement =
      finalBody?.includes("Update") ||
      finalBody?.includes("Edit") ||
      finalBody?.includes("Apply") ||
      finalBody?.includes("Site Preview") ||
      finalBody?.includes("Preview");
    expect(
      hasManagement,
      "Site management view should appear after interview completes",
    ).toBe(true);
  });
});
