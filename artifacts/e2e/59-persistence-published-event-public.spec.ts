import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD, CP, TEST_ORG_SLUG } from "./helpers";

test("Percy — public events API remains stable after persisted event creation", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  const name = `Percy Public Stable Event ${Date.now()}`;

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
    await dateInput.fill("2026-07-05");
  }

  const timeInput = dialog.locator('input[type="time"]').first();
  if ((await timeInput.count()) > 0) {
    await timeInput.fill("19:00");
  }

  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/events") && r.request().method() === "POST",
    { timeout: 15000 },
  );

  await dialog.getByRole("button", { name: /create event|save|create|add/i }).last().click();

  const createRes = await createResponse;
  const createText = await createRes.text();
  expect(createRes.ok(), createText).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });

  const adminEvents = await page.request.get(`${STEWARD}/api/events`, {
    timeout: 15000,
  });
  expect(adminEvents.ok()).toBe(true);
  expect(await adminEvents.text()).toContain(name);

  const publicRes = await page.request.get(`${CP}/api/events`, {
    headers: { "x-org-id": TEST_ORG_SLUG },
    timeout: 15000,
  });

  expect(publicRes.status()).toBeLessThan(500);

  const publicText = await publicRes.text();
  expect(publicText).not.toContain("Internal Server Error");
  expect(publicText).not.toContain("ECONNREFUSED");
});
