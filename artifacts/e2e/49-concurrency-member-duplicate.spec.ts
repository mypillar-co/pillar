import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Connie — duplicate member submissions do not create duplicates", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/members" });

  const email = `connie-${Date.now()}@test.com`;

  await Promise.all([
    page.request.post(`${STEWARD}/api/members`, {
      data: { email, firstName: "Connie", lastName: "Test" },
    }),
    page.request.post(`${STEWARD}/api/members`, {
      data: { email, firstName: "Connie", lastName: "Test" },
    }),
  ]);

  const res = await page.request.get(`${STEWARD}/api/members`);
  const text = await res.text();

  const matches = (text.match(new RegExp(email, "g")) || []).length;

  expect(matches).toBeLessThanOrEqual(1);
});