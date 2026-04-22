import { test, expect } from "@playwright/test";
import {
  STEWARD,
  TEST_ORG_URL,
  loginToSteward,
  screenshotStep,
  dbQuery,
  getTestOrgId,
} from "./helpers";

test.describe("Complete Events Flow", () => {
  let eventId: string;
  const eventName = `Playwright Live Event ${Date.now()}`;

  test.afterAll(async () => {
    if (eventId) await dbQuery("DELETE FROM events WHERE id = $1", [eventId]);
  });

  test("Step 1: Admin creates an event from dashboard", async ({ page }) => {
    await loginToSteward(page);
    await page.goto(`${STEWARD}/dashboard/events`);
    await page.waitForLoadState("networkidle");
    await screenshotStep(page, "23-01-events-page");

    await page.locator('[data-tour="new-event-btn"]').click();
    await page.waitForTimeout(1000);
    await screenshotStep(page, "23-02-create-dialog");

    const nameInput = page
      .locator(
        'input[name="name"], input[placeholder*="name" i], input[placeholder*="Event" i]',
      )
      .first();
    await nameInput.fill(eventName);

    const dateInput = page
      .locator('input[type="date"], input[name="startDate"], input[name="date"]')
      .first();
    if (await dateInput.isVisible().catch(() => false)) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      await dateInput.fill(tomorrow);
    }

    const descInput = page
      .locator('textarea[name="description"], textarea[placeholder*="description" i]')
      .first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill("A test event created by Playwright automation");
    }

    const locationInput = page
      .locator('input[name="location"], input[placeholder*="location" i]')
      .first();
    if (await locationInput.isVisible().catch(() => false)) {
      await locationInput.fill("Community Center, Pittsburgh PA");
    }
    await screenshotStep(page, "23-03-form-filled");

    await page
      .locator('[role="dialog"] button:has-text("Create Event")')
      .click();
    await page.waitForTimeout(3000);
    await screenshotStep(page, "23-04-after-save");

    const body = await page.textContent("body");
    expect(body).toContain(eventName.substring(0, 20));

    const orgId = await getTestOrgId();
    const rows = await dbQuery(
      "SELECT id FROM events WHERE name = $1 AND org_id = $2 LIMIT 1",
      [eventName, orgId],
    );
    if (rows.length > 0) eventId = rows[0].id;
    console.log("Event created:", eventId ?? "NOT FOUND IN DB");
  });

  test("Step 2: Event appears on community site", async ({ page }) => {
    if (!eventId) {
      test.skip();
      return;
    }
    await page.goto(`${TEST_ORG_URL}/events`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    await screenshotStep(page, "23-05-events-public");

    const body = await page.textContent("body");
    const eventVisible =
      body?.includes("Playwright Live Event") ||
      body?.includes(eventName.substring(0, 20));
    expect(eventVisible, "Event should appear on the public community site").toBe(true);
  });

  test("Step 3: Event detail page loads", async ({ page }) => {
    if (!eventId) {
      test.skip();
      return;
    }
    await page.goto(`${TEST_ORG_URL}/events`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const eventLink = page
      .locator('a:has-text("Playwright Live"), a[href*="playwright"]')
      .first();
    const hasLink = await eventLink.isVisible().catch(() => false);
    if (hasLink) {
      await eventLink.click();
      await page.waitForTimeout(2000);
      await screenshotStep(page, "23-06-event-detail");
      const body = await page.textContent("body");
      expect(body).toContain("Community Center");
    }
  });

  test("Step 4: Event shows in dashboard event list", async ({ page }) => {
    if (!eventId) {
      test.skip();
      return;
    }
    await loginToSteward(page);
    await page.goto(`${STEWARD}/dashboard/events`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await screenshotStep(page, "23-07-events-dashboard");
    const body = await page.textContent("body");
    expect(body).toContain(eventName.substring(0, 20));
  });
});
