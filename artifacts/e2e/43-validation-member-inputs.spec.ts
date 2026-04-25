import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Validation Victor — Members", () => {
  test("Invalid member email is rejected or not persisted", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/members" });

    const badEmail = `not-an-email-${Date.now()}`;
    const beforeRes = await page.request.get(`${STEWARD}/api/members`);
    expect(beforeRes.ok()).toBe(true);
    const beforeText = await beforeRes.text();

    const addButton = page.getByRole("button", {
      name: /add member|new member|invite member/i,
    }).first();

    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const emailInput = dialog.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(badEmail);

    const textInputs = dialog.locator(
      'input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"])',
    );

    if ((await textInputs.count()) > 0) {
      await textInputs.nth(0).fill("Victor");
    }
    if ((await textInputs.count()) > 1) {
      await textInputs.nth(1).fill("InvalidEmail");
    }

    const saveButton = dialog.getByRole("button", {
      name: /save|create|invite|add/i,
    }).last();

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/members") && r.request().method() === "POST",
      { timeout: 10000 },
    ).catch(() => null);

    await saveButton.click().catch(() => {});
    const response = await responsePromise;

    if (response) {
      expect(response.status()).not.toBeGreaterThanOrEqual(500);
    }

    const afterRes = await page.request.get(`${STEWARD}/api/members`);
    expect(afterRes.ok()).toBe(true);
    const afterText = await afterRes.text();

    expect(afterText).not.toContain(badEmail);

    // Sanity: the endpoint remains usable.
    expect(afterText.length).toBeGreaterThanOrEqual(beforeText.length > 0 ? 2 : 0);
  });
});
