import { test, expect } from "@playwright/test";
import { loginToSteward, dbQuery, getTestOrgId } from "./helpers";

test.describe("Members — Delete", () => {
  test("Member rows can be safely created and deleted for cleanup", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/members" });
    const orgId = await getTestOrgId();
    const email = `pw-delete-${Date.now()}@test.com`;
    const inserted = await dbQuery(
      `INSERT INTO members (org_id, first_name, last_name, email, status, member_type)
       VALUES ($1, 'Delete', 'Target', $2, 'active', 'general') RETURNING id`,
      [orgId, email],
    );

    const before = await dbQuery("SELECT id FROM members WHERE email = $1", [email]);
    expect(before.length).toBe(1);

    await dbQuery("DELETE FROM members WHERE id = $1", [inserted[0].id]);

    const after = await dbQuery("SELECT id FROM members WHERE email = $1", [email]);
    expect(after.length).toBe(0);
  });
});
