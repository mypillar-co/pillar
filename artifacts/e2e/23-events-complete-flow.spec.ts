import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Events — complete flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/events",
    });
  });

  test("Create Event creates a real event and exposes it through the API", async ({
    page,
  }) => {
    const eventName = `Playwright Event ${Date.now()}`;

    await page.locator('[data-tour="new-event-btn"]').click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const textInputs = dialog.locator(
      'input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"]):not([type="checkbox"]):not([type="radio"])',
    );

    await expect(textInputs.first()).toBeVisible();
    await textInputs.first().fill(eventName);

    const dateInputs = dialog.locator('input[type="date"]');
    if ((await dateInputs.count()) > 0) {
      await dateInputs.first().fill("2026-05-15");
    }

    const timeInputs = dialog.locator('input[type="time"]');
    if ((await timeInputs.count()) > 0) {
      await timeInputs.first().fill("18:00");
    }

    const textareas = dialog.locator("textarea");
    if ((await textareas.count()) > 0) {
      await textareas
        .first()
        .fill("Created by Playwright to verify the event creation flow.");
    }

    const createReq = page.waitForResponse(
      (r) => r.url().includes("/api/events") && r.request().method() === "POST",
      { timeout: 15000 },
    );

    await dialog.getByRole("button", { name: "Create Event" }).click();

    const createRes = await createReq;
    expect(createRes.ok(), "POST /api/events should succeed").toBe(true);

    await expect(dialog).toBeHidden({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${STEWARD}/api/events`);
          if (!res.ok()) return false;

          const json = await res.json();
          return JSON.stringify(json).includes(eventName);
        },
        { timeout: 30000 },
      )
      .toBeTruthy();
    
    await expect(page.getByText(eventName).first()).toBeVisible({ timeout: 10000 });
  });
});