import { test, expect, type Page } from "@playwright/test";
import {
  API,
  STEWARD,
  TEST_ORG_SLUG,
  dbQuery,
  getTestOrgId,
  getSiteConfig,
  loginToSteward,
} from "./helpers";

async function publicMembersNav(page: Page) {
  await page.goto(`${API}/sites/${TEST_ORG_SLUG}/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.locator("nav").getByText("Members", { exact: true });
}

async function openPublicMembersPage(page: Page) {
  await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("Members public site visibility", () => {
  let orgId: string | null = null;
  let originalSiteConfig: Record<string, unknown> | null = null;
  let originalMembers: Record<string, unknown>[] = [];
  let originalCpFeatures: Record<string, unknown> | null = null;

  test.beforeEach(async () => {
    orgId = await getTestOrgId();
    test.skip(!orgId, "Test org not found");
    originalSiteConfig = await getSiteConfig(TEST_ORG_SLUG);
    const memberRows = await dbQuery(
      "SELECT to_jsonb(members.*) AS row FROM members WHERE org_id = $1",
      [orgId],
    );
    originalMembers = memberRows.map((row) => row.row as Record<string, unknown>);
    const cpRows = await dbQuery(
      "SELECT features FROM cs_org_configs WHERE org_id = $1 LIMIT 1",
      [TEST_ORG_SLUG],
    );
    originalCpFeatures = (cpRows[0]?.features as Record<string, unknown> | null) ?? null;
  });

  test.afterEach(async () => {
    if (!orgId) return;
    await dbQuery("DELETE FROM members WHERE org_id = $1", [orgId]);
    if (originalMembers.length) {
      await dbQuery(
        "INSERT INTO members SELECT * FROM jsonb_populate_recordset(NULL::members, $1::jsonb)",
        [JSON.stringify(originalMembers)],
      );
    }
    if (originalSiteConfig) {
      await dbQuery(
        "UPDATE organizations SET site_config = $1::jsonb WHERE id = $2",
        [JSON.stringify(originalSiteConfig), orgId],
      );
    }
    await dbQuery(
      "UPDATE cs_org_configs SET features = $1::jsonb WHERE org_id = $2",
      [JSON.stringify(originalCpFeatures ?? {}), TEST_ORG_SLUG],
    );
  });

  test("public Members link appears only while the org has members", async ({ page }) => {
    test.skip(!orgId, "Test org not found");

    await dbQuery("DELETE FROM members WHERE org_id = $1", [orgId]);
    await dbQuery(
      `UPDATE organizations
       SET site_config = jsonb_set(
         COALESCE(site_config, '{}'::jsonb),
         '{features}',
         COALESCE(site_config -> 'features', '{}'::jsonb) || '{"members": true, "membersPortal": {"sections": []}}'::jsonb,
         true
       )
       WHERE id = $1`,
      [orgId],
    );
    await dbQuery(
      `UPDATE cs_org_configs
       SET features = COALESCE(features, '{}'::jsonb) || '{"members": true, "membersPortal": {"sections": []}}'::jsonb
       WHERE org_id = $1`,
      [TEST_ORG_SLUG],
    );

    await expect(await publicMembersNav(page)).toHaveCount(0);
    await openPublicMembersPage(page);
    await expect(page.getByText("Page not found.", { exact: true })).toBeVisible();

    await loginToSteward(page, { targetPath: "/dashboard/members" });
    const email = `visibility-${Date.now()}@test.local`;
    const created = await page.evaluate(async (memberEmail) => {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: "Visibility",
          lastName: "Member",
          email: memberEmail,
        }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }, email);
    expect(created.status).toBe(201);
    const memberId = (created.body as { id?: string }).id;
    expect(memberId).toBeTruthy();

    await expect
      .poll(async () => {
        const rows = await dbQuery("SELECT COUNT(*)::int AS n FROM members WHERE org_id = $1", [orgId]);
        return Number(rows[0]?.n ?? 0);
      }, { timeout: 20000 })
      .toBe(1);

    await expect(await publicMembersNav(page)).toBeVisible();
    await openPublicMembersPage(page);
    await expect(page.getByRole("heading", { name: "Members area" })).toBeVisible();

    await page.goto(`${STEWARD}/dashboard/members`, { waitUntil: "networkidle" });
    const deleted = await page.evaluate(async (id) => {
      const res = await fetch(`/api/members/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      return { status: res.status, text: await res.text().catch(() => "") };
    }, memberId);
    expect(deleted.status, deleted.text).toBe(204);

    await expect
      .poll(async () => {
        const rows = await dbQuery("SELECT COUNT(*)::int AS n FROM members WHERE org_id = $1", [orgId]);
        return Number(rows[0]?.n ?? 0);
      }, { timeout: 20000 })
      .toBe(0);

    await expect
      .poll(async () => {
        const rows = await dbQuery(
          `SELECT
             site_config #>> '{features,members}' AS org_members,
             (SELECT features ->> 'members' FROM cs_org_configs WHERE org_id = $2 LIMIT 1) AS cp_members
           FROM organizations WHERE id = $1 LIMIT 1`,
          [orgId, TEST_ORG_SLUG],
        );
        return rows[0] ?? {};
      }, { timeout: 20000 })
      .toEqual({ org_members: "false", cp_members: "false" });

    await expect(await publicMembersNav(page)).toHaveCount(0);
    await openPublicMembersPage(page);
    await expect(page.getByText("Page not found.", { exact: true })).toBeVisible();
  });
});
