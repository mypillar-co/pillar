import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test.describe("AI Features", () => {
  test("AI edit box is present on site builder page", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });
    await expect(page.locator('textarea[placeholder*="Change"], textarea').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Apply changes" })).toBeVisible();
  });

  test("AI edit suggestion chips are present", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });
    await expect(page.getByText(/Change our contact email|Change our primary color|Change our/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("Content Studio press release task is accessible", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/studio" });
    await expect(page.getByText("Press Release", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test("Hero image picker section is visible on site builder page", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });
    await expect(page.getByRole("button", { name: /AI picks/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Upload photo/i })).toBeVisible({ timeout: 15000 });
  });

  test("Site preview area or public link is present", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });
    const iframeCount = await page.locator("iframe").count();
    const body = (await page.textContent("body")) ?? "";
    expect(iframeCount > 0 || /preview|community site|launch|public site/i.test(body)).toBe(true);
  });
});
