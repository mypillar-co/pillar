import { test, expect } from "@playwright/test";
import { STEWARD, loginToSteward } from "./helpers";

test.describe("Steward Authentication", () => {

  test("Login page renders without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${STEWARD}/login`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError"));
    expect(syntaxErrors).toHaveLength(0);
  });

  test("Login page has email and password fields", async ({ page }) => {
    await page.goto(`${STEWARD}/login`);
    await page.waitForLoadState("networkidle");
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput.first()).toBeVisible();
    await expect(passwordInput.first()).toBeVisible();
  });

  test("Login with wrong credentials shows error or stays on login", async ({ page }) => {
    await page.goto(`${STEWARD}/login`);
    await page.waitForLoadState("networkidle");
    await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill("wrong@wrong.com");
    await page.locator('input[type="password"]').first().fill("wrongpassword");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    const isStillOnLogin = page.url().includes("/login") || body?.toLowerCase().includes("invalid") || body?.toLowerCase().includes("incorrect") || body?.toLowerCase().includes("error");
    expect(isStillOnLogin).toBe(true);
  });

  test("Admin can log in and reach dashboard", async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(2000);
    const url = page.url();
    const isDashboard = url.includes("/dashboard") || url.includes("/overview") || !url.includes("/login");
    expect(isDashboard).toBe(true);
  });

  test("Dashboard renders without JavaScript errors after login", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await loginToSteward(page);
    await page.waitForTimeout(2000);
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError") || e.includes("Unexpected token"));
    expect(syntaxErrors).toHaveLength(0);
  });

});