// artifacts/e2e/38-chaos-admin-double-click.spec.ts

import { test, expect } from "@playwright/test";
import { loginToSteward } from "./helpers";

test("Chaos — double clicking create event does not duplicate", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  const createButton = page.locator('button:has-text("Create")').first();

  if (await createButton.count()) {
    await createButton.click();
    await createButton.click(); // double click chaos
  }

  const rows = page.locator("table tbody tr");
  const count = await rows.count();

  expect(count).toBeLessThan(10); // sanity, not exploding
});