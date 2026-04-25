import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD, CP, TEST_ORG_SLUG } from "./helpers";

test("Percy — public events API remains stable after event creation", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  const name = `Percy Public ${Date.now()}`;

  const res = await page.request.post(`${STEWARD}/api/events`, {
    data: {
      name,
      startDate: new Date().toISOString(),
      startTime: "19:00",
      location: "Public Square",
    },
  });

  expect(res.status()).toBeLessThan(500);

  await page.reload();

  const publicRes = await page.request.get(`${CP}/api/events`, {
    headers: { "x-org-id": TEST_ORG_SLUG },
  });

  expect(publicRes.status()).toBeLessThan(500);
});