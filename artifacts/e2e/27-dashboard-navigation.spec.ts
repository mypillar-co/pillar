import { test, expect } from "@playwright/test";
import { STEWARD, loginToSteward, screenshotStep } from "./helpers";

test.describe("Dashboard Navigation - Click Everything", () => {
  test("Every sidebar nav item loads without error", async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
    await page.goto(`${STEWARD}/dashboard`);
    await page.waitForLoadState("networkidle");
    await screenshotStep(page, "27-01-dashboard-start");

    const navLinks = page.locator(
      'nav a[href], aside a[href], [role="navigation"] a[href]',
    );
    const count = await navLinks.count();
    console.log(`Found ${count} nav links`);

    const visited: string[] = [];
    const errors: { href: string; error: string }[] = [];

    for (let i = 0; i < count; i++) {
      const link = navLinks.nth(i);
      const href = await link.getAttribute("href").catch(() => "");
      if (!href || visited.includes(href) || href.startsWith("http") || href === "#")
        continue;
      visited.push(href);

      await page.goto(`${STEWARD}${href}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1000);

      const body = await page.textContent("body").catch(() => "");
      const isBlank = (body?.length ?? 0) < 100;
      const is404 =
        body?.includes("404") ||
        body?.includes("Page not found") ||
        body?.includes("Not found");

      if (isBlank) errors.push({ href, error: "Page appears blank (< 100 chars)" });
      if (is404) errors.push({ href, error: "Page shows 404" });

      console.log(`${isBlank || is404 ? "FAIL" : "PASS"} ${href}`);
    }

    await screenshotStep(page, "27-02-nav-complete");

    if (errors.length > 0) {
      console.log("FAILED PAGES:", JSON.stringify(errors, null, 2));
    }
    expect(
      errors,
      `${errors.length} nav pages failed: ${JSON.stringify(errors)}`,
    ).toHaveLength(0);
  });

  test("Every dashboard page takes a screenshot", async ({ page }) => {
    await loginToSteward(page);
    const routes = [
      { path: "/dashboard", name: "overview" },
      { path: "/dashboard/events", name: "events" },
      { path: "/dashboard/members", name: "members" },
      { path: "/dashboard/sponsors", name: "sponsors" },
      { path: "/dashboard/social", name: "social" },
      { path: "/dashboard/content", name: "content" },
      { path: "/dashboard/website", name: "website" },
      { path: "/dashboard/contacts", name: "contacts" },
    ];

    for (const route of routes) {
      await page.goto(`${STEWARD}${route.path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `e2e-report/pages/${route.name}-full.png`,
        fullPage: true,
      });
      const body = await page.textContent("body");
      expect(body?.length, `${route.path} should have content`).toBeGreaterThan(100);
    }
  });
});
