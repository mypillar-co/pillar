import { test, expect } from "@playwright/test";
import { loginToSteward, STEWARD, dbQuery, getTestOrgId } from "./helpers";

test.describe("Members — Edit", () => {
  test("Admin member API exposes editable members", async ({ page }) => {
    await loginToSteward(page, { targetPath: "/dashboard/members" });

    const orgId = await getTestOrgId();
    const email = `pw-edit-${Date.now()}@test.com`;
    const inserted = await dbQuery(
      `INSERT INTO members (org_id, first_name, last_name, email, status, member_type)
       VALUES ($1, 'Edit', 'Target', $2, 'active', 'general') RETURNING id`,
      [orgId, email],
    );

    try {
      const res = await page.request.get(`${STEWARD}/api/members`);
      expect(res.ok()).toBe(true);
      expect(JSON.stringify(await res.json())).toContain(email);
    } finally {
      await dbQuery("DELETE FROM members WHERE id = $1", [inserted[0].id]);
    }
  });
});
