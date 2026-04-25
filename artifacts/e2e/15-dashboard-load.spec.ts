import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test.describe("Dashboard — Load", () => {
  test("Dashboard loads authenticated overview without blank screen", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    await expect(page).toHaveURL(/dashboard/);

    const body = page.locator("body");
    await expect(body).toBeVisible();
    await expect(body).not.toContainText(/log in|sign in/i);
    await expect(body).not.toContainText(/404|not found|something went wrong/i);

    const text = (await body.textContent()) ?? "";
    expect(text.length).toBeGreaterThan(100);
  });
});