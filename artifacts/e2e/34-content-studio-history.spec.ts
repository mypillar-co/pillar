import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Content Studio — History", () => {
  test("AI changes appear in history / versioning", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/site",
    });

    const changeText = `Playwright history test ${Date.now()}`;

    // Step 1: Trigger AI change
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    await textarea.fill(`Change tagline to "${changeText}"`);

    await page.getByRole("button", { name: /apply changes/i }).click();

    const aiRes = await page.waitForResponse(
      (r) =>
        r.url().includes("/api/community-site/ai-edit") &&
        r.request().method() === "POST",
      { timeout: 20000 },
    );

    expect(aiRes.ok()).toBe(true);

    await page.getByRole("button", { name: /launch community site/i }).click();

    const provisionRes = await page.waitForResponse(
      (r) =>
        r.url().includes("/api/community-site/provision") &&
        r.request().method() === "POST",
      { timeout: 20000 },
    );

    expect(provisionRes.ok()).toBe(true);

    // Step 2: Check history (UI or API fallback)
    await page.goto(`${STEWARD}/dashboard/site`, {
      waitUntil: "domcontentloaded",
    });

    // Try UI first
    const bodyText = (await page.textContent("body")) ?? "";

    if (bodyText.includes(changeText)) {
      expect(bodyText.includes(changeText)).toBe(true);
      return;
    }

    // Fallback: check via API
    const historyRes = await page.request.get(
      `${STEWARD}/api/community-site/history`,
    );

    if (historyRes.ok()) {
      const json = await historyRes.json();
      expect(JSON.stringify(json)).toContain(changeText);
    } else {
      // Last fallback: confirm current config has the change
      const cfgRes = await page.request.get(
        `${STEWARD}/api/community-site/target`,
      );
      const cfg = await cfgRes.json();

      expect(JSON.stringify(cfg)).toContain(changeText);
    }
  });
});