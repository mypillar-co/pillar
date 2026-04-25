// artifacts/e2e/41-chaos-public-routes.spec.ts

import { test, expect } from "@playwright/test";
import { CP } from "./helpers";

test("Chaos — random public routes do not crash", async ({ page }) => {
  const routes = [
    "/asdf",
    "/events/???",
    "/members/../../etc",
  ];

  for (const r of routes) {
    const res = await page.goto(`${CP}${r}`);
    expect(res?.status()).toBeLessThan(500);
  }
});