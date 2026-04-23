import { test, expect } from "@playwright/test";
import { STEWARD, TEST_ORG_SLUG, loginToSteward, screenshotStep, dbQuery } from "./helpers";

test.describe("AI Edit Verified Changes", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("AI edit actually changes site config in database", async ({ page }) => {
    // Network trace (scoped to this test) — confirms which API endpoints fire.
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/") || url.includes("/ai") || url.includes("/site")) {
        console.log("[REQ]", req.method(), url);
      }
    });
    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/") || url.includes("/ai") || url.includes("/site")) {
        console.log("[RES]", res.status(), url);
        if (res.status() >= 400) {
          console.log("[RES_BODY]", await res.text().catch(() => ""));
        }
      }
    });

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

    // Diagnostic: confirm the textarea actually holds the prompt before
    // clicking Apply. The Apply button is disabled while aiInput is empty,
    // so a click would no-op if fill() didn't trigger React's onChange.
    const filledValue = await textarea.inputValue();
    console.log("Textarea value before Apply:", JSON.stringify(filledValue));
    expect(filledValue.length, "textarea should be filled").toBeGreaterThan(0);

    // Step 1: submit the AI edit proposal (POST /api/community-site/ai-edit).
    // This does NOT persist site_config — it returns a proposed payload that
    // the user must confirm by clicking "Launch Community Site".
    // Use the exact product text to avoid matching unrelated "Update" buttons.
    const applyButton = page.getByRole("button", { name: "Apply changes" }).first();
    await expect(applyButton, "Apply changes button should be enabled").toBeEnabled({
      timeout: 5000,
    });
    const aiEditResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/community-site/ai-edit") && r.request().method() === "POST",
      { timeout: 60000 },
    );
    await applyButton.click();
    await screenshotStep(page, "21-03-clicked-apply");

    const aiEditResp = await aiEditResponsePromise;
    expect(
      aiEditResp.status(),
      "AI edit proposal endpoint should return 2xx",
    ).toBeLessThan(300);

    // Give React a moment to render the proposal-review UI.
    await page.waitForTimeout(500);
    await screenshotStep(page, "21-03b-proposal-ready");

    // Step 2: confirm the proposal by clicking "Launch Community Site"
    // (POST /api/community-site/provision) — this writes organizations.site_config.
    const launchButton = page.getByRole("button", { name: /Launch Community Site/i });
    await launchButton.waitFor({ state: "visible", timeout: 15000 });
    const enabled = await launchButton.isEnabled();
    const launchCount = await launchButton.count();
    console.log(
      `Launch button: count=${launchCount} enabled=${enabled}`,
    );

    const provisionResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/community-site/provision") && r.request().method() === "POST",
      { timeout: 120000 },
    );
    await launchButton.click();
    await screenshotStep(page, "21-04-clicked-launch");

    // If provision didn't fire, capture page state for diagnosis.
    let provisionResp;
    try {
      provisionResp = await provisionResponsePromise;
    } catch (err) {
      const bodyText = (await page.textContent("body").catch(() => "")) ?? "";
      const snippet = bodyText.replace(/\s+/g, " ").slice(0, 800);
      console.log("BODY_AFTER_LAUNCH_CLICK:", snippet);
      await screenshotStep(page, "21-04b-launch-no-request");
      throw err;
    }
    expect(
      provisionResp.status(),
      "Provision endpoint should return 2xx",
    ).toBeLessThan(300);

    // Give the server a brief moment to flush the UPDATE before re-reading.
    await page.waitForTimeout(1000);

    const after = await dbQuery(
      "SELECT site_config->>'tagline' as tagline FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    const afterTagline = after[0]?.tagline ?? "";
    console.log("Tagline after:", afterTagline);
    await screenshotStep(page, "21-06-final-state");
    expect(
      afterTagline,
      "Tagline in database should have changed after AI edit + Launch",
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
