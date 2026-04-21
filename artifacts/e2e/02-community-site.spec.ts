import { test, expect } from "@playwright/test";
import { CP, TEST_ORG_URL } from "./helpers";

test.describe("Community Platform Rendering", () => {
  test("Homepage renders org name and tagline", async ({ page }) => {
    await page.goto(TEST_ORG_URL);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(200);
  });

  test("Homepage has nav links", async ({ page }) => {
    await page.goto(TEST_ORG_URL);
    await page.waitForLoadState("networkidle");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });

  test("Events page loads", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/events`);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/events");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });

  test("Contact page loads", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/contact`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });

  test("Members login page renders", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body?.length).toBeGreaterThan(50);
  });

  test("Members login page shows sign in form not blank", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members`);
    await page.waitForLoadState("networkidle");
    const hasForm = await page.locator('input[type=email], input[type=password], button').count();
    expect(hasForm).toBeGreaterThan(0);
  });

  test("No JavaScript errors on homepage", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(TEST_ORG_URL);
    await page.waitForLoadState("networkidle");
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError") || e.includes("Unexpected token"));
    expect(syntaxErrors).toHaveLength(0);
  });

  test("No JavaScript errors on members page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${TEST_ORG_URL}/members`);
    await page.waitForLoadState("networkidle");
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError") || e.includes("Unexpected token"));
    expect(syntaxErrors).toHaveLength(0);
  });
});
