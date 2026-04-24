import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Members — Add", () => {
  test("Admin can add a member from dashboard", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/members",
    });

    const addButton = page.getByRole("button", {
      name: /add member|new member|invite member/i,
    });

    await expect(addButton.first()).toBeVisible({ timeout: 10000 });
    await addButton.first().click();

    const name = `Playwright Member ${Date.now()}`;
    const email = `pw-${Date.now()}@test.com`;

    await page.getByLabel(/name/i).fill(name);
    await page.getByLabel(/email/i).fill(email);

    await page.getByRole("button", { name: /save|create|invite/i }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 });
  });
});