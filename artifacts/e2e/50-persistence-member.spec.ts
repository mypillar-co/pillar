import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Percy — member persists after reload", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/members" });

  const email = `percy-${Date.now()}@example.com`;

  await page.getByRole("button", { name: /add member|new member|invite member/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });

  const textInputs = dialog.locator(
    'input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"])',
  );

  await textInputs.nth(0).fill("Percy");
  if ((await textInputs.count()) > 1) {
    await textInputs.nth(1).fill("Persistence");
  }

  await dialog.locator('input[type="email"]').first().fill(email);

  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/members") && r.request().method() === "POST",
    { timeout: 15000 },
  );

  await dialog.getByRole("button", { name: /save|create|invite|add/i }).last().click();

  const res = await createResponse;
  const text = await res.text();
  expect(res.ok(), text).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });

  const list = await page.request.get(`${STEWARD}/api/members`);
  const listText = await list.text();

  expect(listText).toContain(email);
});