import { test, expect } from "@playwright/test";
import { STEWARD } from "./helpers";

test.describe("Auth — Protected Routes", () => {
  test("Unauthenticated user cannot access dashboard routes", async ({ page }) => {
    const protectedRoutes = [
      "/dashboard",
      "/dashboard/members",
      "/dashboard/events",
      "/dashboard/site",
      "/dashboard/autopilot",
      "/dashboard/settings",
      "/billing",
    ];

    for (const route of protectedRoutes) {
      await page.goto(`${STEWARD}${route}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(page).not.toHaveURL(new RegExp(`${route}$`), {
        timeout: 10000,
      });

      const body = (await page.textContent("body")) ?? "";

      expect(
        page.url().includes("/login") ||
          page.url() === `${STEWARD}/` ||
          body.toLowerCase().includes("sign in") ||
          body.toLowerCase().includes("log in"),
      ).toBe(true);
    }
  });

  test("Authenticated user can access protected dashboard routes", async ({
    page,
  }) => {
    const { loginToSteward } = await import("./helpers");

    await loginToSteward(page, {
      targetPath: "/dashboard",
    });

    const protectedRoutes = [
      "/dashboard",
      "/dashboard/members",
      "/dashboard/events",
      "/dashboard/site",
      "/dashboard/autopilot",
      "/dashboard/settings",
      "/billing",
    ];

    for (const route of protectedRoutes) {
      await page.goto(`${STEWARD}${route}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/")), {
        timeout: 10000,
      });

      await expect(page.locator("body")).not.toContainText(/sign in|log in/i);
    }
  });
});