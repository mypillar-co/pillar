import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Events — Public Visibility", () => {
  test("Created event appears on public site", async ({ page }) => {
    // Step 1: Create event via dashboard
    await loginToSteward(page, {
      targetPath: "/dashboard/events",
    });

    const eventName = `Playwright Public Event ${Date.now()}`;

    await page.getByRole("button", { name: /new event/i }).click();

    await page.getByLabel(/event name/i).fill(eventName);
    await page.getByLabel(/date/i).fill("2026-05-16");
    await page.getByLabel(/time/i).fill("19:00");

    await page.getByRole("button", { name: /create event/i }).click();

    // Step 2: Ensure event exists via API
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${STEWARD}/api/events`);
          if (!res.ok()) return false;
          const json = await res.json();
          return JSON.stringify(json).includes(eventName);
        },
        { timeout: 20000 },
      )
      .toBe(true);

    // Step 3: Check public site
    await page.goto(`${CP}/sites/${TEST_ORG_SLUG}/events`, {
      waitUntil: "domcontentloaded",
    });

    await expect
      .poll(
        async () => {
          const content = (await page.textContent("body")) ?? "";
          return content.includes(eventName);
        },
        { timeout: 30000 },
      )
      .toBe(true);
  });
});