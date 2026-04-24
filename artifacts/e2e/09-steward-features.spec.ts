import { test, expect } from "@playwright/test";
import { STEWARD, loginToSteward, dbQuery, getTestOrgId } from "./helpers";

test.describe("Steward Feature Flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page);
    await page.waitForTimeout(1000);
  });

  test("Members page shows stat cards", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/members`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    const hasStats =
      body?.includes("Total") ||
      body?.includes("Active") ||
      body?.includes("Member");
    expect(hasStats).toBe(true);
  });

  test("Members page has an add member button", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/members`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    const hasButton =
      body?.includes("Add Member") ||
      body?.includes("Add member") ||
      body?.includes("+ Add") ||
      body?.includes("New Member");
    expect(hasButton, "Members page should have an Add Member button").toBe(
      true,
    );
  });

  test("Events page has a create event button", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/events`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    const hasButton =
      body?.includes("Create") ||
      body?.includes("New Event") ||
      body?.includes("Add Event");
    expect(hasButton, "Events page should have a create event button").toBe(
      true,
    );
  });

  test("Website builder shows management view not welcome screen for provisioned org", async ({
    page,
  }) => {
    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    const isWelcome =
      body?.includes("Let's set up") || body?.includes("Let's get started");
    expect(isWelcome, "Provisioned org should not see welcome screen").toBe(
      false,
    );
    await page.screenshot({
      path: "e2e-report/pages/website-management.png",
      fullPage: true,
    });
  });

  test("Website builder has AI edit area", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/website`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    const hasEdit =
      body?.includes("Apply changes") ||
      body?.includes("Describe") ||
      body?.includes("UPDATE YOUR SITE") ||
      body?.includes("Update your site");
    expect(hasEdit, "Website builder should have AI edit area").toBe(true);
  });

  test("Content Studio shows task options", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/content`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    const hasTasks =
      body?.includes("Press Release") ||
      body?.includes("Newsletter") ||
      body?.includes("Fundraising") ||
      body?.includes("Generate");
    expect(hasTasks, "Content studio should show task options").toBe(true);
  });

  test("Social page shows Buffer section", async ({ page }) => {
    await page.goto(`${STEWARD}/dashboard/social`);
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    const hasBuffer =
      body?.includes("Buffer") ||
      body?.includes("Connect") ||
      body?.includes("Social");
    expect(hasBuffer).toBe(true);
  });
});
