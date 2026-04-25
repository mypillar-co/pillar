import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Members — complete flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/members",
    });
  });

  test("Add Member creates a real member via API", async ({ page }) => {
    const email = `pw.member.${Date.now()}@example.com`;

    await page.getByRole("button", { name: "Add Member" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const textInputs = dialog.locator(
      'input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"])',
    );

    await expect(textInputs.first()).toBeVisible();
    await textInputs.nth(0).fill("Playwright");
    await textInputs.nth(1).fill("Member");

    await dialog.locator('input[type="email"]').fill(email);

    const dateInputs = dialog.locator('input[type="date"]');
    if ((await dateInputs.count()) > 0) {
      await dateInputs.first().fill("2026-04-24");
    }

    const createReq = page.waitForResponse(
      (r) => r.url().endsWith("/api/members") && r.request().method() === "POST",
      { timeout: 15000 },
    );

    await dialog.getByRole("button", { name: "Save" }).click();

    const createRes = await createReq;
    expect(createRes.ok(), "POST /api/members should succeed").toBe(true);

    await expect(dialog).toBeHidden({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${STEWARD}/api/members`);
          if (!res.ok()) return false;

          const json = await res.json();
          return json?.some((m: any) => m.email === email);
        },
        { timeout: 30000 },
      )
      .toBeTruthy();
  });
});