import { test, expect } from "@playwright/test";
import { STEWARD } from "./helpers";

test.describe("Auth — Login Flow", () => {
  test("User can log in and reach dashboard", async ({ page }) => {
    await page.goto(`${STEWARD}/login`);

    await page.getByLabel("Email").fill("test@pillar.local");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: /log in/i }).click();

    await page.waitForURL("**/dashboard", { timeout: 15000 });

    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByText(/dashboard/i)).toBeVisible();
  });
});