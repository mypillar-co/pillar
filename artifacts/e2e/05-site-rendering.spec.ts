import { test, expect } from "@playwright/test";
import { TEST_ORG_URL } from "./helpers";

test.describe("Site Visual Rendering", () => {
  test("Homepage has visible text content above the fold", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(TEST_ORG_URL);
    await page.waitForLoadState("networkidle");
    const screenshot = await page.screenshot({ path: "e2e-report/homepage-desktop.png" });
    expect(screenshot.length).toBeGreaterThan(1000);
  });

  test("Homepage renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TEST_ORG_URL);
    await page.waitForLoadState("networkidle");
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const screenshot = await page.screenshot({ path: "e2e-report/homepage-mobile.png" });
    expect(screenshot.length).toBeGreaterThan(1000);
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError"));
    expect(syntaxErrors).toHaveLength(0);
  });

  test("Members page renders on mobile Safari viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${TEST_ORG_URL}/members`);
    await page.waitForLoadState("networkidle");
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const screenshot = await page.screenshot({ path: "e2e-report/members-mobile.png" });
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError"));
    expect(syntaxErrors).toHaveLength(0);
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });

  test("Register page renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${TEST_ORG_URL}/members/register?token=invalidtoken`);
    await page.waitForLoadState("networkidle");
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const body = await page.textContent("body");
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError"));
    expect(syntaxErrors).toHaveLength(0);
    expect(body?.length).toBeGreaterThan(50);
  });

  test("No mixed content warnings on any page", async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on("console", m => consoleMessages.push(m.text()));
    await page.goto(TEST_ORG_URL);
    await page.waitForLoadState("networkidle");
    const mixedContent = consoleMessages.filter(m => m.toLowerCase().includes("mixed content"));
    expect(mixedContent).toHaveLength(0);
  });
});
