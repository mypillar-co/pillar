import { test, expect } from "@playwright/test";
import { STEWARD, loginToSteward } from "./helpers";

test.describe("Steward Dashboard Pages", () => {

  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("Overview page loads with content", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    await page.screenshot({ path: "e2e-report/pages/dashboard-overview.png", fullPage: true });
  });

  test("Events page loads", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/events`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    await page.screenshot({ path: "e2e-report/pages/dashboard-events.png", fullPage: true });
  });

  test("Members page loads", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/members`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    await page.screenshot({ path: "e2e-report/pages/dashboard-members.png", fullPage: true });
  });

  test("Sponsors page loads", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/sponsors`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    await page.screenshot({ path: "e2e-report/pages/dashboard-sponsors.png", fullPage: true });
  });

  test("Social page loads", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/social`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    await page.screenshot({ path: "e2e-report/pages/dashboard-social.png", fullPage: true });
  });

  test("Content Studio page loads", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    await page.screenshot({ path: "e2e-report/pages/dashboard-content.png", fullPage: true });
  });

  test("Website builder page loads", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
    await page.screenshot({ path: "e2e-report/pages/dashboard-website.png", fullPage: true });
  });

  test("No dashboard page shows blank screen", async ({ page }) => {
    const pages = [
      "/dashboard",
      "/dashboard/events",
      "/dashboard/members",
      "/dashboard/sponsors",
      "/dashboard/social",
      "/dashboard/content",
      "/dashboard/website",
    ];
    for (const path of pages) {
      await page.goto(`${STEWARD}${path}`);
      await page.waitForLoadState("networkidle");
      const body = await page.textContent("body");
      expect(body?.length, `Page ${path} appears blank`).toBeGreaterThan(100);
    }
  });

  test("No JavaScript errors on any dashboard page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const pages = ["/dashboard", "/dashboard/events", "/dashboard/members", "/dashboard/website"];
    for (const path of pages) {
      await page.goto(`${STEWARD}${path}`);
      await page.waitForLoadState("networkidle");
    }
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError") || e.includes("Unexpected token"));
    expect(syntaxErrors).toHaveLength(0);
  });

  test("Sidebar navigation is visible", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard`);
    await page.waitForLoadState("networkidle");
    const nav = page.locator("nav, [role='navigation'], aside");
    await expect(nav.first()).toBeVisible();
  });

});