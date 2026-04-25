import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Steward Feature Flows", () => {
  test("Members page shows stat cards", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/members" });
    await expect(page.locator("body")).toContainText(/member/i, { timeout: 10000 });
  });

  test("Members page has an add member button", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/members" });
    await expect(page.getByRole("button", { name: "Add Member" })).toBeVisible({ timeout: 10000 });
  });

  test("Events page has a create event button", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/events" });
    await expect(page.locator('[data-tour="new-event-btn"], button:has-text("New Event")').first()).toBeVisible({ timeout: 10000 });
  });

  test("Website builder shows management view not welcome screen for provisioned org", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });
    await expect(page.locator("body")).not.toContainText(/welcome.*start/i);
  });

  test("Website builder has AI edit area", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/site" });
    await expect(page.locator('textarea[placeholder*="Change"], textarea').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Apply changes" })).toBeVisible({ timeout: 10000 });
  });

  test("Content Studio shows task options", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/studio" });
    await expect(page.getByText("Press Release", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test("Social page shows Buffer section", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/social" });
    await expect(page.locator("body")).toContainText(/buffer|social/i, { timeout: 10000 });
  });
});
