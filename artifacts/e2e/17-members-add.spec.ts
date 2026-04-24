import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Members — Add", () => {
  test("Admin can add a member from dashboard", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/members" });

    const email = `pw-add-${Date.now()}@test.com`;
    await page.getByRole("button", { name: "Add Member" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const textInputs = dialog.locator('input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"])');
    await textInputs.nth(0).fill("Playwright");
    await textInputs.nth(1).fill("Add");
    await dialog.locator('input[type="email"]').fill(email);

    const post = page.waitForResponse((r) => r.url().endsWith("/api/members") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Save" }).click();
    expect((await post).ok()).toBe(true);

    await expect.poll(async () => {
      const res = await page.request.get(`${STEWARD}/api/members`);
      if (!res.ok()) return false;
      return JSON.stringify(await res.json()).includes(email);
    }, { timeout: 30000 }).toBeTruthy();
  });
});
