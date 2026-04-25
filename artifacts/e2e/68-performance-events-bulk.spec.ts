
import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test("Paula — bulk event creation remains stable", async ({ page }) => {
  await loginToSteward(page, { targetPath: "/dashboard/events" });

  for (let i = 0; i < 10; i++) {
    const name = `Paula Event ${Date.now()}-${i}`;

    await page.getByRole("button", { name: /new event|create event|add event/i }).first().click();
    const dialog = page.getByRole("dialog");

    await dialog.locator('input').first().fill(name);

    const resPromise = page.waitForResponse(r => r.url().includes("/api/events") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: /create|save|add/i }).click();
    const res = await resPromise;

    expect(res.status()).toBeLessThan(500);
  }
});
