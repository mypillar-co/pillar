import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Percy — event persists after reload", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  const name = `Percy Event ${Date.now()}`;

  await page
    .getByRole("button", { name: /new event|create event|add event/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });

  const textInputs = dialog.locator(
    'input:not([type="date"]):not([type="time"]):not([type="number"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
  );

  await expect(textInputs.first()).toBeVisible({ timeout: 10000 });
  await textInputs.first().fill(name);

  const dateInput = dialog.locator('input[type="date"]').first();
  if ((await dateInput.count()) > 0) {
    await dateInput.fill("2026-06-20");
  }

  const timeInput = dialog.locator('input[type="time"]').first();
  if ((await timeInput.count()) > 0) {
    await timeInput.fill("18:00");
  }

  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/events") && r.request().method() === "POST",
    { timeout: 15000 },
  );

  await dialog
    .getByRole("button", { name: /create event|save|create|add/i })
    .last()
    .click();

  const res = await createResponse;
  const responseText = await res.text();
  expect(res.ok(), responseText).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });

  const events = await page.request.get(`${STEWARD}/api/events`);
  const eventsText = await events.text();

  expect(eventsText).toContain(name);
});