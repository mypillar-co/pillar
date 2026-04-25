import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test("Chaos — invalid member input does not crash", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/members" });

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const addButton = page.getByRole("button", {
    name: /add member|new member|invite member/i,
  }).first();

  await expect(addButton).toBeVisible({ timeout: 10000 });
  await addButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });

  const emailInput = dialog.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill("not-an-email");

  const textInputs = dialog.locator(
    'input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"])',
  );

  if ((await textInputs.count()) > 0) {
    await textInputs.nth(0).fill("%%%$$$$");
  }

  const saveButton = dialog.getByRole("button", {
    name: /save|create|invite|add/i,
  }).last();

  await saveButton.click().catch(() => {});

  const body = (await page.textContent("body")) ?? "";

  expect(body).not.toContain("500");
  expect(body).not.toContain("Internal Server Error");
  expect(errors.filter((e) => e.includes("SyntaxError"))).toHaveLength(0);
});