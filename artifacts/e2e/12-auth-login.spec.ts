import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test.describe("Auth — Login Flow", () => {
  test("User can log in and reach dashboard via test session", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard" });
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator("body")).not.toContainText(/sign in|log in/i);
  });
});
