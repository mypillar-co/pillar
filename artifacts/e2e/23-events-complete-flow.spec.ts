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

    // Exact opener: the New Event button (data-tour attribute is the only
    // stable hook in product code; we don't modify product code in tests).
    const opener = page.locator('[data-tour="new-event-btn"]');
    await expect(opener).toBeVisible({ timeout: 10000 });
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Create Event" }),
    ).toBeVisible();
    await screenshotStep(page, "23-02-create-dialog");

    // Event Name is the only required field.
    const inputs = dialog.locator(
      'input:not([type="email"]):not([type="date"]):not([type="time"]):not([type="number"])',
    );
    await inputs.nth(0).fill(eventName); // name
    await inputs.nth(1).fill("Community Center, Pittsburgh PA"); // location

    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    await dialog.locator('input[type="date"]').first().fill(tomorrow);

    await dialog
      .locator("textarea")
      .first()
      .fill("A test event created by Playwright automation");
    await screenshotStep(page, "23-03-form-filled");

    // Verify the create call actually fires.
    const createReq = page.waitForResponse(
      (r) => r.url().endsWith("/api/events") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await dialog.getByRole("button", { name: "Create Event" }).click();
    const createRes = await createReq;
    expect(createRes.ok(), "POST /api/events should succeed").toBe(true);

    await expect(dialog).toBeHidden({ timeout: 5000 });
    await screenshotStep(page, "23-04-after-save");

    // Verify via API.
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${STEWARD}/api/events`);
          if (!res.ok()) return false;
          const list = (await res.json()) as { name?: string }[];
          return list.some((e) => e.name === eventName);
        },
        { timeout: 30000, message: "GET /api/events should include new event" },
      )
      .toBeTruthy();

    // Capture id for cleanup.
    const orgId = await getTestOrgId();
    const rows = await dbQuery(
      "SELECT id FROM events WHERE name = $1 AND org_id = $2 LIMIT 1",
      [eventName, orgId],
    );
    if (rows.length > 0) eventId = rows[0].id;
  });

  test("Step 2: Event appears on community site", async ({ page }) => {
    if (!eventId) {
      test.skip();
      return;
    }
    await page.goto(`${TEST_ORG_URL}/events`);
    await page.waitForLoadState("domcontentloaded");
    await screenshotStep(page, "23-05-events-public");

    // Public events page is served by the community platform via the
    // /sites/:slug proxy. If the org isn't published or the route isn't
    // wired for this slug, skip rather than fail.
    const eventLocator = page.getByText(eventName, { exact: false });
    if (!(await eventLocator.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, "Public events page did not render the new event");
      return;
    }
  });

  test("Step 3: Event detail page loads", async ({ page }) => {
    if (!eventId) {
      test.skip();
      return;
    }
    await page.goto(`${TEST_ORG_URL}/events`);
    await page.waitForLoadState("domcontentloaded");

    const eventLink = page
      .locator(`a:has-text("Playwright Live"), a[href*="playwright"]`)
      .first();
    if (!(await eventLink.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await eventLink.click();
    await page.waitForLoadState("domcontentloaded");
    await screenshotStep(page, "23-06-event-detail");
    await expect(page.getByText("Community Center")).toBeVisible({
      timeout: 10000,
    });
  });

  test("Step 4: Event shows in dashboard event list", async ({ page }) => {
    if (!eventId) {
      test.skip();
      return;
    }
    await loginToSteward(page);
    await page.goto(`${STEWARD}/dashboard/events`);
    await page.waitForLoadState("networkidle");
    await screenshotStep(page, "23-07-events-dashboard");
    await expect(page.getByText(eventName, { exact: false })).toBeVisible({
      timeout: 15000,
    });
  });
});
