import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

async function openSiteBuilderReady(page: any) {
  await loginToSteward(page, { targetPath: "/dashboard/site" });

  // Make the test tolerant of whether the org already has a site or is still in setup.
  // The actual product may show the hero panel on the welcome screen, management view,
  // or final review screen depending on org state.
  await page.waitForLoadState("domcontentloaded");
}

test("Uma — hero image picker controls are reachable", async ({ page }) => {
  await openSiteBuilderReady(page);

  const body = page.locator("body");

  const heroControl = page.getByRole("button", {
    name: /ai picks|upload photo|homepage banner|banner|photo/i,
  }).first();

  await expect(heroControl).toBeVisible({ timeout: 15000 });
  await expect(body).not.toContainText(/internal server error|cannot get|econnrefused/i);
});
