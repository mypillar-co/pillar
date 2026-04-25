import { test, expect } from "@playwright/test";
import { loginToSteward, dbQuery, getTestOrgId } from "./helpers";

test.describe("Members — Invite Token", () => {
  test("New member receives a registration token in database", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/members" });

    const email = `invite.${Date.now()}@example.com`;
    await page.getByRole("button", { name: "Add Member" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const textInputs = dialog.locator('input:not([type="email"]):not([type="date"]):not([type="number"]):not([type="time"])');
    await textInputs.nth(0).fill("Invite");
    await textInputs.nth(1).fill("Token");
    await dialog.locator('input[type="email"]').fill(email);

    const post = page.waitForResponse((r) => r.url().endsWith("/api/members") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Save" }).click();
    expect((await post).ok()).toBe(true);

    const orgId = await getTestOrgId();
    await expect.poll(async () => {
      const rows = await dbQuery(
        "SELECT registration_token FROM members WHERE email = $1 AND org_id = $2 LIMIT 1",
        [email, orgId],
      );
      return Boolean(rows[0]?.registration_token);
    }, { timeout: 30000 }).toBeTruthy();
  });
});
