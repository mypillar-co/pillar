import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD } from "./helpers";

test.describe("Members — Invite Token", () => {
  test("New member receives a registration token", async ({ page }) => {
    await loginToSteward(page, {
      targetPath: "/dashboard/members",
    });

    const email = `invite.${Date.now()}@example.com`;

    await page.getByRole("button", { name: "Add Member" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const textInputs = dialog.locator(
      'input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"])',
    );

    await textInputs.nth(0).fill("Invite");
    await textInputs.nth(1).fill("Token");

    await dialog.locator('input[type="email"]').fill(email);

    const createReq = page.waitForResponse(
      (r) => r.url().endsWith("/api/members") && r.request().method() === "POST",
      { timeout: 15000 },
    );

    await dialog.getByRole("button", { name: "Save" }).click();

    const createRes = await createReq;
    expect(createRes.ok(), "POST /api/members should succeed").toBe(true);

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${STEWARD}/api/members`);
          if (!res.ok()) return false;

          const members = await res.json();
          const member = members.find((m: any) => m.email === email);

          return Boolean(
            member?.registrationToken ||
              member?.registration_token ||
              member?.inviteToken ||
              member?.invite_token,
          );
        },
        { timeout: 30000 },
      )
      .toBeTruthy();
  });
});