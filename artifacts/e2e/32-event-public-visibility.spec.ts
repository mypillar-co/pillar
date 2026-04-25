import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Events — Public Visibility", () => {
  test("Created event is persisted and public events API remains healthy", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/events" });

    const eventName = `Playwright Public Event ${Date.now()}`;
    await page.locator('[data-tour="new-event-btn"], button:has-text("New Event")').first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const textInputs = dialog.locator('input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"]):not([type="checkbox"]):not([type="radio"])');
    await textInputs.first().fill(eventName);
    const dateInputs = dialog.locator('input[type="date"]');
    if ((await dateInputs.count()) > 0) await dateInputs.first().fill("2026-05-16");
    const timeInputs = dialog.locator('input[type="time"]');
    if ((await timeInputs.count()) > 0) await timeInputs.first().fill("19:00");

    const post = page.waitForResponse((r) => r.url().includes("/api/events") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Create Event" }).click();
    expect((await post).ok()).toBe(true);

    await expect.poll(async () => {
      const res = await page.request.get(`${STEWARD}/api/events`);
      if (!res.ok()) return false;
      return JSON.stringify(await res.json()).includes(eventName);
    }, { timeout: 30000 }).toBeTruthy();

    const publicEvents = await page.request.get(`${CP}/api/events`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(publicEvents.ok()).toBe(true);
  });
});
