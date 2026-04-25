import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Validation Victor — Events", () => {
  test("Malformed event payload is rejected or safely contained", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/events" });

    const marker = `Victor Bad Event ${Date.now()}`;

    const beforeRes = await page.request.get(`${STEWARD}/api/events`, {
      timeout: 10000,
    });

    expect(beforeRes.ok()).toBe(true);

    const badCreateRes = await page.request.post(`${STEWARD}/api/events`, {
      timeout: 10000,
      data: {
        name: marker,
        startDate: "not-a-real-date",
        endDate: "also-not-a-real-date",
        startTime: "99:99",
        maxCapacity: -500,
      },
    });

    expect(badCreateRes.status()).toBeLessThan(500);

    const afterRes = await page.request.get(`${STEWARD}/api/events`, {
      timeout: 10000,
    });

    expect(afterRes.ok()).toBe(true);

    const afterText = await afterRes.text();

    expect(afterText).not.toContain(marker);
    expect(afterText).not.toContain("Internal Server Error");
    expect(afterText).not.toContain("ECONNREFUSED");
  });
});