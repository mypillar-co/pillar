import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Hero Image — Persistence", () => {
  test("AI-picked hero image persists to site config", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/site",
    });

    const beforeRes = await page.request.get(`${STEWARD}/api/community-site/target`);
    expect(beforeRes.ok()).toBe(true);

    const beforeJson = await beforeRes.json();
    const beforeConfig = beforeJson?.siteConfig ?? beforeJson?.site_config ?? beforeJson;
    const beforeHero =
      beforeConfig?.heroImage ||
      beforeConfig?.heroImageUrl ||
      beforeConfig?.hero_image_url ||
      null;

    await page.getByRole("button", { name: /AI picks/i }).click();

    const photos = page.locator("img");
    await expect(photos.first()).toBeVisible({ timeout: 20000 });

    const firstPhoto = photos.first();
    const src = await firstPhoto.getAttribute("src");
    expect(src).toBeTruthy();

    await firstPhoto.click();

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${STEWARD}/api/community-site/target`);
          if (!res.ok()) return null;

          const json = await res.json();
          const cfg = json?.siteConfig ?? json?.site_config ?? json;
          return (
            cfg?.heroImage ||
            cfg?.heroImageUrl ||
            cfg?.hero_image_url ||
            null
          );
        },
        { timeout: 30000 },
      )
      .not.toBe(beforeHero);
  });
});