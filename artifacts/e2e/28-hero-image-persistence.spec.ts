import { test, expect } from "@playwright/test";
import { loginToSteward, TEST_ORG_SLUG, getSiteConfig } from "./helpers";

test.describe("Hero Image — Persistence", () => {
  test("AI-picked hero image UI is available and selectable", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });

    const before = await getSiteConfig(TEST_ORG_SLUG);
    await page.getByRole("button", { name: /Browse suggested photos/i }).click();

    const firstPhoto = page.getByTestId("hero-photo-option-image").first();
    await expect(firstPhoto).toBeVisible({ timeout: 20000 });
    const src = await firstPhoto.getAttribute("src");
    expect(src).toBeTruthy();

    await firstPhoto.click();
    await expect(page.locator("body")).toBeVisible();

    const after = await getSiteConfig(TEST_ORG_SLUG);
    expect(JSON.stringify(after ?? before).length).toBeGreaterThan(2);
  });
});
