import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Sally — member API does not expose sensitive fields", async ({ page }) => {
  await loginToSteward(page);

  const res = await page.request.get(`${STEWARD}/api/members`);
  expect(res.ok()).toBe(true);

  const text = await res.text();

  expect(text).not.toContain("password");
  expect(text).not.toContain("hashedPassword");
  expect(text).not.toContain("ssn");
  expect(text).not.toContain("token");
});
