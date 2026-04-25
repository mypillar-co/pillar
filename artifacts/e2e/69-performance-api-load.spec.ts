
import { test, expect } from "@playwright/test";
import { STEWARD } from "./helpers";

test("Paula — API handles concurrent requests", async ({ page }) => {
  const requests = Array.from({ length: 10 }).map(() =>
    page.request.get(`${STEWARD}/api/events`)
  );

  const results = await Promise.all(requests);

  for (const res of results) {
    expect(res.status()).toBeLessThan(500);
  }
});
