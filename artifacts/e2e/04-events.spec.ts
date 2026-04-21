import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { CP, TEST_ORG_URL, TEST_ORG_SLUG } from "./helpers";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function query(sql: string, params?: any[]) {
  const res = await pool.query(sql, params);
  return res.rows;
}

test.describe("Events", () => {
  let eventId: string;
  const eventSlug = `playwright-test-event-${Date.now()}`;

  test.beforeAll(async () => {
    const orgRows = await query(
      "SELECT id FROM organizations WHERE slug = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    const orgId = (orgRows[0] as any).id;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const rows = await query(
      `INSERT INTO events (id, org_id, name, slug, description, start_date, start_time, location, is_active, show_on_public_site, event_type, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Playwright Test Event', $2, 'A test event created by Playwright', $3, '18:00', 'Test Location', true, true, 'meeting', NOW(), NOW())
       RETURNING id`,
      [orgId, eventSlug, tomorrow],
    );
    eventId = (rows[0] as any).id;
  });

  test.afterAll(async () => {
    if (eventId) {
      await query("DELETE FROM events WHERE id = $1", [eventId]);
    }
    await pool.end();
  });

  test("Events page loads on community site", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/events`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(50);
  });

  test("Test event appears on community site", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/events`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toContain("Playwright Test Event");
  });

  test("CP events API returns test event", async ({ request }) => {
    const r = await request.get(`${CP}/api/events`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(r.status()).toBe(200);
    const events = await r.json();
    const found = events.find((e: any) => e.name === "Playwright Test Event" || e.title === "Playwright Test Event");
    expect(found).toBeTruthy();
  });

  test("Event detail page loads", async ({ page }) => {
    await page.goto(`${TEST_ORG_URL}/events/playwright-test-event-${Date.now()}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
  });
});
