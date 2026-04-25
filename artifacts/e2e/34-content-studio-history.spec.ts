import { test, expect } from "@playwright/test";
import { loginToSteward, TEST_ORG_SLUG, getSiteConfig, applyAndLaunch } from "./helpers";

test.describe("Content Studio — History", () => {
  test("AI site changes persist to current site config", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });

    const changeText = `Playwright history test ${Date.now()}`;
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill(`Change tagline to ${changeText}`);

    await applyAndLaunch(page);

    await expect.poll(async () => {
      const cfg = await getSiteConfig(TEST_ORG_SLUG);
      return JSON.stringify(cfg ?? {});
    }, { timeout: 60000 }).toContain(changeText);
  });
});
