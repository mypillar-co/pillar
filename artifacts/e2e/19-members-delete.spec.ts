import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test.describe("Members — Delete", () => {
  test("Admin can delete a member", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/members",
    });

    const memberRow = page.locator('[data-testid="member-row"]').first();
    await expect(memberRow).toBeVisible({ timeout: 10000 });

    const memberName = await memberRow.textContent();

    const deleteButton = memberRow.getByRole("button", {
      name: /delete|remove/i,
    });

    await deleteButton.click();

    const confirmButton = page.getByRole("button", {
      name: /confirm|delete/i,
    });

    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    if (memberName) {
      await expect(page.getByText(memberName)).toHaveCount(0, {
        timeout: 15000,
      });
    }
  });
});