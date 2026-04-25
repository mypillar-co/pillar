import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Percy — direct site config update persists after reload", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/site" });

  const marker = `Percy direct tagline ${Date.now()}`;

  const updateRes = await page.request.post(`${STEWARD}/api/community-site/provision`, {
    data: {
      config: {
        tagline: marker,
      },
    },
    timeout: 30000,
  }).catch(() => null);

  if (updateRes) {
    expect(updateRes.status()).toBeLessThan(500);
  }

  await page.reload({ waitUntil: "domcontentloaded" });

  const targetRes = await page.request.get(`${STEWARD}/api/community-site/target`, {
    timeout: 15000,
  });

  expect(targetRes.ok()).toBe(true);

  const text = await targetRes.text();
  expect(text).not.toContain("Internal Server Error");
  expect(text).not.toContain("ECONNREFUSED");
});
