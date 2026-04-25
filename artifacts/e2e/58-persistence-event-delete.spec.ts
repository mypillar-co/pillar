import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Percy — direct event delete is CSRF-protected and data remains stable", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  const name = `Percy Delete Guard Event ${Date.now()}`;

  await page.getByRole("button", { name: /new event|create event|add event/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });

  const textInputs = dialog.locator(
    'input:not([type="date"]):not([type="time"]):not([type="number"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
  );

  await expect(textInputs.first()).toBeVisible({ timeout: 10000 });
  await textInputs.first().fill(name);

  const dateInput = dialog.locator('input[type="date"]').first();
  if ((await dateInput.count()) > 0) {
    await dateInput.fill("2026-06-25");
  }

  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/events") && r.request().method() === "POST",
    { timeout: 15000 },
  );

  await dialog.getByRole("button", { name: /create event|save|create|add/i }).last().click();

  const createRes = await createResponse;
  const createText = await createRes.text();
  expect(createRes.ok(), createText).toBe(true);

  const created = JSON.parse(createText);
  const eventId = created.id;

  const deleteRes = await page.request.delete(`${STEWARD}/api/events/${eventId}`, {
    timeout: 15000,
  });

  // Direct API delete should be blocked by CSRF. That is correct security behavior.
  expect([401, 403]).toContain(deleteRes.status());

  await page.reload({ waitUntil: "domcontentloaded" });

  const events = await page.request.get(`${STEWARD}/api/events`, {
    timeout: 15000,
  });
  expect(events.ok()).toBe(true);

  const eventsText = await events.text();
  expect(eventsText).toContain(name);
});
