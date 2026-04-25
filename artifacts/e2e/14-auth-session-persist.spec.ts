import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Auth — Session Persistence", () => {
  test("Session remains authenticated after reload", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    await expect(page).toHaveURL(/dashboard/);

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator("body")).not.toContainText(/log in|sign in/i);
  });

  test("Session remains authenticated across dashboard routes", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    const routes = [
      "/dashboard/members",
      "/dashboard/events",
      "/dashboard/site",
      "/dashboard/autopilot",
    ];

    for (const route of routes) {
      await page.goto(`${STEWARD}${route}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/")));
      await expect(page.locator("body")).not.toContainText(/log in|sign in/i);
    }
  });
});