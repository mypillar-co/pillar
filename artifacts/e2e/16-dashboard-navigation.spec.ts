import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Dashboard — Navigation", () => {
  test("User can navigate between main dashboard sections", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    const navTargets = [
      { name: /members/i, path: "/dashboard/members" },
      { name: /events/i, path: "/dashboard/events" },
      { name: /site|community|builder/i, path: "/dashboard/site" },
      { name: /autopilot|agent/i, path: "/dashboard/autopilot" },
    ];

    for (const target of navTargets) {
      const link = page.getByRole("link", { name: target.name }).first();

      await expect(link).toBeVisible({ timeout: 10000 });
      await link.click();

      await expect(page).toHaveURL(new RegExp(target.path.replace("/", "\\/")), {
        timeout: 15000,
      });

      await expect(page.locator("body")).not.toContainText(/log in|sign in/i);
    }
  });

  test("Direct URL navigation works for protected routes", async ({ page }) => {
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