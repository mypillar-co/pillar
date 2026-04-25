import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Auth — Logout Flow", () => {
  test("User can log out from dashboard", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    await expect(page).toHaveURL(/dashboard/);

    const logoutButton = page.getByRole("button", {
      name: /log out|logout|sign out|signout/i,
    });

    await expect(logoutButton.first()).toBeVisible({ timeout: 10000 });
    await logoutButton.first().click();

    await expect(page).toHaveURL(/login|\/$/i, { timeout: 15000 });

    await page.goto(`${STEWARD}/dashboard`);
    await expect(page).not.toHaveURL(/dashboard$/);
  });
});