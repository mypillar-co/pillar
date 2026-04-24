import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Dashboard Navigation - Click Everything", () => {
  test("Every sidebar nav item loads without error", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    const routes = [
      "/dashboard",
      "/dashboard/autopilot",
      "/dashboard/registrations",
      "/dashboard/board-links",
      "/dashboard/payments",
      "/dashboard/events",
      "/dashboard/social",
      "/dashboard/announcements",
      "/dashboard/studio",
      "/dashboard/contacts",
      "/dashboard/members",
      "/dashboard/members-portal",
      "/dashboard/sponsors",
      "/dashboard/vendors",
      "/dashboard/site",
      "/dashboard/domains",
      "/dashboard/settings",
      "/dashboard/help",
      "/billing",
    ];

    for (const route of routes) {
      await page.goto(`${STEWARD}${route}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/")), {
        timeout: 15000,
      });

      const body = page.locator("body");
      await expect(body).toBeVisible();
      await expect(body).not.toContainText(/log in|sign in/i);
      await expect(body).not.toContainText(/404|not found|something went wrong/i);
    }
  });

  test("Every dashboard page can take a screenshot", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    const routes = [
      "/dashboard",
      "/dashboard/autopilot",
      "/dashboard/registrations",
      "/dashboard/board-links",
      "/dashboard/payments",
      "/dashboard/events",
      "/dashboard/social",
      "/dashboard/announcements",
      "/dashboard/studio",
      "/dashboard/contacts",
      "/dashboard/members",
      "/dashboard/members-portal",
      "/dashboard/sponsors",
      "/dashboard/vendors",
      "/dashboard/site",
      "/dashboard/domains",
      "/dashboard/settings",
      "/dashboard/help",
      "/billing",
    ];

    for (const route of routes) {
      await page.goto(`${STEWARD}${route}`, {
        waitUntil: "domcontentloaded",
      });

      await page.screenshot({
        path: `e2e-report/steps/27-${route.replaceAll("/", "-") || "root"}.png`,
        fullPage: true,
      });

      await expect(page.locator("body")).toBeVisible();
    }
  });
});