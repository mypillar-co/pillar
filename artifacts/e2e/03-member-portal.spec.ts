import { test, expect } from "@playwright/test";
import { API, TEST_ORG_SLUG, dbQuery, getTestOrgId } from "./helpers";

const testEmail = `portal-${Date.now()}@test.local`;
let inviteToken: string | null = null;
let memberId: string | null = null;

test.describe("Member Portal Flow", () => {
  test.beforeAll(async () => {
    const orgId = await getTestOrgId();
    if (!orgId) test.skip(true, "Test org not found");
    const rows = await dbQuery(
      `INSERT INTO members (org_id, first_name, last_name, email, status, member_type, registration_token)
       VALUES ($1, 'Portal', 'Tester', $2, 'pending', 'general', gen_random_uuid()::text)
       RETURNING id, registration_token`,
      [orgId, testEmail],
    );
    memberId = rows[0]?.id ?? null;
    inviteToken = rows[0]?.registration_token ?? null;
  });

  test.afterAll(async () => {
    if (memberId) await dbQuery("DELETE FROM members WHERE id = $1", [memberId]);
  });

  test("Register route responds with valid token", async ({ page }) => {
    expect(inviteToken).toBeTruthy();
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members/register?token=${inviteToken}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test("Register page does not server-error", async ({ page }) => {
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members/register?token=${inviteToken}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toContain("Internal Server Error");
  });

  test("Member can set password and register when portal UI is rendered", async ({ page }) => {
    await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members/register?token=${inviteToken}`, {
      waitUntil: "domcontentloaded",
    });
    const passwords = page.locator('input[type="password"]');
    if (!(await passwords.first().isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Register form is not rendered on this dev public route");
    }
    await passwords.nth(0).fill("TestPass123!");
    if (await passwords.nth(1).isVisible().catch(() => false)) await passwords.nth(1).fill("TestPass123!");
    await page.locator('button[type="submit"], button:has-text("Set Password"), button:has-text("Create Account"), button:has-text("Register")').first().click();
    await expect.poll(async () => {
      const rows = await dbQuery("SELECT registered_at FROM members WHERE id = $1", [memberId]);
      return Boolean(rows[0]?.registered_at);
    }, { timeout: 20000 }).toBeTruthy();
  });

  test("Member login route responds", async ({ page }) => {
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members/login`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test("Portal home route responds", async ({ page }) => {
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});
