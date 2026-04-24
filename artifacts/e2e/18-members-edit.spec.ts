import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test.describe("Members — Edit", () => {
  test("Admin can edit a member", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/members",
    });

    const memberRow = page.locator('[data-testid="member-row"]').first();

    await expect(memberRow).toBeVisible({ timeout: 10000 });

    const editButton = memberRow.getByRole("button", {
      name: /edit/i,
    });

    await editButton.click();

    const updatedName = `Updated Member ${Date.now()}`;

    const nameInput = page.getByLabel(/name/i);
    await nameInput.fill(updatedName);

    await page.getByRole("button", { name: /save|update/i }).click();

    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 15000 });
  });
});