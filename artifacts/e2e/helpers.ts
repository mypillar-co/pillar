import { Page } from "@playwright/test";
import { Pool } from "pg";

export const API = "http://localhost:8080";
export const CP = "http://localhost:5001";
export const STEWARD = process.env.STEWARD_URL ?? "http://localhost:18402";
export const TEST_ORG_SLUG = "norwin-rotary-uic5";
export const TEST_ORG_URL = `${API}/sites/${TEST_ORG_SLUG}`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function dbQuery(sql: string, params?: any[]): Promise<any[]> {
  const res = await pool.query(sql, params);
  return res.rows;
}

export async function getTestOrgId(): Promise<string> {
  const rows = await dbQuery(
    "SELECT id FROM organizations WHERE slug = $1 LIMIT 1",
    [TEST_ORG_SLUG],
  );
  return rows[0]?.id;
}

export async function loginToSteward(page: Page): Promise<void> {
  await page.goto(`${STEWARD}/login`);
  await page.waitForLoadState("networkidle");
  await page
    .locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    )
    .first()
    .fill(process.env.TEST_ADMIN_EMAIL ?? "admin@pillar.test");
  await page
    .locator('input[type="password"]')
    .first()
    .fill(process.env.TEST_ADMIN_PASSWORD ?? "testpassword");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
}

export async function screenshotStep(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `e2e-report/steps/${name}.png`,
    fullPage: true,
  });
}

export async function waitAndClick(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
  await page.locator(selector).first().click();
}
