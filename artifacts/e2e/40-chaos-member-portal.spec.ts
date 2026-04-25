// artifacts/e2e/40-chaos-member-portal.spec.ts

import { test, expect } from "@playwright/test";
import { CP } from "./helpers";

test("Chaos — invalid token does not crash portal", async ({ page }) => {
  const res = await page.goto(`${CP}/members/register?token=invalid123`);

  expect(res?.status()).toBeLessThan(500);

  const body = await page.textContent("body");
  expect(body).not.toContain("Internal Server Error");
});