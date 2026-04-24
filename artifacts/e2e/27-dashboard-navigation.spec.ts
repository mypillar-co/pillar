import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

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

test.describe("Dashboard Navigation - Click Everything", () => {
  test("Every sidebar nav item loads without error", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard" });

    for (const route of routes) {
      const res = await page.goto(`${STEWARD}${route}`, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 200).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
      await expect(page).not.toHaveURL(/\/login$/i);
      await expect(page.locator("body")).toContainText(/Pillar|Dashboard|Westside|Rotary|Billing/i);
      // Some nav destinations are placeholders; that is acceptable as long as
      // they render inside the authenticated shell without crashing.
    }
  });

  test("Every dashboard page can take a screenshot", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard" });

    for (const route of routes) {
      await page.goto(`${STEWARD}${route}`, { waitUntil: "domcontentloaded" });
      await page.screenshot({
        path: `e2e-report/steps/27-${route.replaceAll("/", "-") || "root"}.png`,
        fullPage: true,
      });
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
