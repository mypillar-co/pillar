import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

async function openSiteBuilderReady(page: any) {
  await loginToSteward(page, { targetPath: "/dashboard/site" });
  await page.waitForLoadState("domcontentloaded");
}

test("Uma — hero image area remains stable after reload", async ({ page }) => {
  await openSiteBuilderReady(page);

  const bodyBefore = (await page.locator("body").textContent()) ?? "";
  expect(bodyBefore).not.toMatch(/internal server error|cannot get|econnrefused/i);

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator("body")).not.toContainText(/internal server error|cannot get|econnrefused/i);

  const heroOrPhotoControl = page.getByRole("button", {
    name: /ai picks|upload photo|photo|banner/i,
  }).first();

  await expect(heroOrPhotoControl).toBeVisible({ timeout: 15000 });
});
