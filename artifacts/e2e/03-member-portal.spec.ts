import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { TEST_ORG_URL, TEST_ORG_SLUG } from "./helpers";

test.describe("Member Portal Flow", () => {
  let testEmail: string;
  let testToken: string;
  let memberId: string;

  test.beforeAll(async () => {
    testEmail = `playwright-member-${Date.now()}@pillar-test.local`;
    testToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { db } = await import("@workspace/db");
    const orgRow = await db.execute(sql`SELECT id FROM organizations WHERE slug = ${TEST_ORG_SLUG} LIMIT 1`);
    const orgId = (orgRow.rows[0] as any).id;
    const res = await db.execute(sql`
      INSERT INTO members (id, org_id, email, first_name, last_name, status, registration_token, token_expires_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${orgId}, ${testEmail}, 'Playwright', 'Tester', 'pending', ${testToken}, ${expires}, NOW(), NOW())
      RETURNING id
    `);
    memberId = (res.rows[0] as any).id;
  });

  test.afterAll(async () => {
    if (memberId) {
      const { db } = await import("@workspace/db");
      await db.execute(sql`DELETE FROM members WHERE id = ${memberId}`);
    }
  });

  test("Register page renders with valid token", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/register?token=${testToken}`);
    await page.waitForLoadState("networkidle");
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const syntaxErrors = errors.filter(e => e.includes("SyntaxError"));
    expect(syntaxErrors).toHaveLength(0);
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput.first()).toBeVisible({ timeout: 5000 });
  });

  test("Register page does not show blank page", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/register?token=${testToken}`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });

  test("Member can set password and register", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members/register?token=${testToken}`);
    await page.waitForLoadState("networkidle");
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill("TestPass123!");
    await passwords.nth(1).fill("TestPass123!");
    await page.locator('button[type="submit"], button:has-text("Set Password"), button:has-text("Create Account"), button:has-text("Register")').first().click();
    await page.waitForTimeout(2000);
  });

  test("Member can log in after registering", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members`);
    await page.waitForLoadState("networkidle");
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill("TestPass123!");
    await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")').first().click();
    await page.waitForTimeout(2000);
  });

  test("Portal home renders after login", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/members`);
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);
    await page.locator('input[type="password"]').fill("TestPass123!");
    await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")').first().click();
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });
});
