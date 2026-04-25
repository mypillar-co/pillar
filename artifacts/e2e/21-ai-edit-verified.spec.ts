import { test, expect } from "@playwright/test";
import {
  STEWARD,
  TEST_ORG_SLUG,
  loginToSteward,
  screenshotStep,
  dbQuery,
  applyAndLaunch,
} from "./helpers";

type SiteConfig = Record<string, unknown> | null;

async function readSiteConfig(): Promise<SiteConfig> {
  const rows = await dbQuery(
    "SELECT site_config FROM organizations WHERE slug = $1 LIMIT 1",
    [TEST_ORG_SLUG],
  );
  return (rows[0]?.site_config as SiteConfig) ?? null;
}

test.describe("AI Edit Verified Changes", () => {
  // Scoped network trace — only this spec, only AI/site routes.
  test.beforeEach(async ({ page }) => {
    page.on("request", (req) => {
      const url = req.url();
      if (
        url.includes("/api/community-site/") ||
        url.includes("/api/auth/") ||
        url.includes("/api/organizations")
      ) {
        console.log("[REQ]", req.method(), url);
      }
    });
    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/community-site/")) {
        console.log("[RES]", res.status(), url);
        if (res.status() >= 400) {
          console.log("[RES_BODY]", await res.text().catch(() => ""));
        }
      }
    });

    await loginToSteward(page);
  });

  test("AI edit actually changes site config in database", async ({ page }) => {
    const before = await readSiteConfig();
    const beforeTagline = (before?.tagline as string | undefined) ?? "";
    console.log("Tagline before:", beforeTagline);

    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");
    await screenshotStep(page, "21-01-before-edit");

    const textarea = page
      .locator('textarea[placeholder*="Change our primary color"]')
      .first();
    await textarea.waitFor({ state: "visible", timeout: 10000 });
    const uniqueTagline = `Playwright verified tagline ${Date.now()}`;
    await textarea.fill(`Change our tagline to: ${uniqueTagline}`);
    await screenshotStep(page, "21-02-filled-textarea");

    await applyAndLaunch(page);
    await screenshotStep(page, "21-03-applied-and-launched");

    await expect
      .poll(
        async () => {
          const cfg = await readSiteConfig();
          return (cfg?.tagline as string | undefined) ?? "";
        },
        {
          timeout: 60000,
          message: "tagline in organizations.site_config should reflect AI edit",
        },
      )
      .toContain(uniqueTagline);
  });

  test("AI edit suggestion chip pre-fills the prompt", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");

    const chip = page
      .locator(
        'button:has-text("Change our contact email"), button:has-text("Update our colors"), button:has-text("Change meeting time"), button:has-text("Update our tagline")',
      )
      .first();
    const chipVisible = await chip.isVisible().catch(() => false);
    if (!chipVisible) {
      console.log("No suggestion chips visible — skipping");
      test.skip();
      return;
    }

    const chipText = (await chip.textContent())?.trim() ?? "";
    console.log("Chip clicked:", chipText);
    await chip.click();

    const textarea = page
      .locator('textarea[placeholder*="Change our primary color"]')
      .first();
    await expect(textarea).not.toHaveValue("", { timeout: 5000 });
    const value = await textarea.inputValue();
    expect(
      value.length,
      `Chip "${chipText}" should pre-fill the textarea`,
    ).toBeGreaterThan(0);
    await screenshotStep(page, "21-07-chip-prefilled");
  });

  test("Color change chip updates colors on site", async ({ page }) => {
    const before = await readSiteConfig();
    const originalColor =
      (before?.primaryColor as string | undefined) ?? "#003DA5";
    console.log("Primary color before:", originalColor);

    // ── First mutation: change primary color to dark red ────────────────────
    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");

    const newColor = "#8B0000";
    const textarea = page
      .locator('textarea[placeholder*="Change our primary color"]')
      .first();
    await textarea.waitFor({ state: "visible", timeout: 10000 });
    await textarea.fill(`Change our primary color to ${newColor}`);

    await applyAndLaunch(page);
    await screenshotStep(page, "21-09-color-applied");

    await expect
      .poll(
        async () => {
          const cfg = await readSiteConfig();
          return ((cfg?.primaryColor as string | undefined) ?? "").toLowerCase();
        },
        {
          timeout: 60000,
          message: "primaryColor should change after AI edit + Launch",
        },
      )
      .not.toBe(originalColor.toLowerCase());

    // ── Second mutation: restore original color ─────────────────────────────
    // After a successful provision, the AI prompt strip is hidden until the
    // page is re-mounted. Reload to bring it back, then run the same flow.
    await page.goto(`${STEWARD}/dashboard/site`);
    await page.waitForLoadState("networkidle");

    const textareaAgain = page
      .locator('textarea[placeholder*="Change our primary color"]')
      .first();
    await textareaAgain.waitFor({ state: "visible", timeout: 10000 });
    await textareaAgain.fill(`Change our primary color back to ${originalColor}`);

    await applyAndLaunch(page);
    await screenshotStep(page, "21-10-color-restored");

    await expect
      .poll(
        async () => {
          const cfg = await readSiteConfig();
          return ((cfg?.primaryColor as string | undefined) ?? "").toLowerCase();
        },
        {
          timeout: 60000,
          message: "primaryColor should restore to the original value",
        },
      )
      .toBe(originalColor.toLowerCase());
  });
});
