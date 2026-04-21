import { Page } from "@playwright/test";

export const API = "http://localhost:8080";
export const CP = "http://localhost:5001";
export const TEST_ORG_SLUG = "norwin-rotary-uic5";
export const TEST_ORG_URL = `http://localhost:5001/sites/${TEST_ORG_SLUG}`;

export async function loginAsAdmin(page: Page) {
  await page.goto("http://localhost:5173/login");
  await page.fill('[name="username"]', process.env.TEST_ADMIN_EMAIL ?? "admin@pillar.test");
  await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD ?? "changeme");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}
