import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Connie — double event creation does not create duplicates", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  const marker = `Connie Event ${Date.now()}`;

  // Fire TWO requests simultaneously
  const [r1, r2] = await Promise.all([
    page.request.post(`${STEWARD}/api/events`, {
      data: {
        name: marker,
        startDate: new Date().toISOString(),
      },
    }),
    page.request.post(`${STEWARD}/api/events`, {
      data: {
        name: marker,
        startDate: new Date().toISOString(),
      },
    }),
  ]);

  expect(r1.status()).toBeLessThan(500);
  expect(r2.status()).toBeLessThan(500);

  const res = await page.request.get(`${STEWARD}/api/events`);
  const text = await res.text();

  const matches = (text.match(new RegExp(marker, "g")) || []).length;

  expect(matches).toBeLessThanOrEqual(1);
});