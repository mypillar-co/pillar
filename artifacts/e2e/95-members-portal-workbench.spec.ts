import { test, expect } from "@playwright/test";
import {
  API,
  CP,
  STEWARD,
  TEST_ORG_SLUG,
  dbQuery,
  getSiteConfig,
  getTestOrgId,
  loginToSteward,
} from "./helpers";

type PortalSection = {
  type: string;
  title?: string;
  body?: string;
  payUrl?: string | null;
  documents?: Array<Record<string, string>>;
};

const BASELINE_PORTAL_SECTIONS: PortalSection[] = [
  {
    type: "welcome_message",
    title: "Members home",
    body: "Original private member portal copy.",
  },
  {
    type: "member_roster",
    title: "Member roster",
  },
  {
    type: "documents",
    title: "Member documents",
    documents: [],
  },
];

async function patchPortalFromPage(page: any, sections: unknown[]) {
  return page.evaluate(async (payload) => {
    const res = await fetch("/api/members-portal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sections: payload }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }, sections);
}

test.describe("Members portal workbench", () => {
  let originalSiteConfig: Record<string, unknown> | null = null;

  test.beforeEach(async () => {
    originalSiteConfig = await getSiteConfig(TEST_ORG_SLUG);
  });

  test.afterEach(async () => {
    if (!originalSiteConfig) return;
    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify(originalSiteConfig), TEST_ORG_SLUG],
    );
    originalSiteConfig = null;
  });

  test("live-edits copy, reorders sections, locks roster content, and saves", async ({ page }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    const seeded = {
      ...before,
      features: {
        ...((before?.features as Record<string, unknown> | undefined) ?? {}),
        members: true,
      },
      membersPortal: {
        provisionedAt: "2026-05-01T00:00:00.000Z",
        sections: BASELINE_PORTAL_SECTIONS,
      },
    };
    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify(seeded), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
    await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Members Portal" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("members-portal-preview-section-welcome_message")).toContainText(
      "Original private member portal copy.",
    );

    const draftBody = `Updated member portal copy ${Date.now()}`;
    await page.getByTestId("members-portal-section-select-welcome_message").click();
    await page.getByTestId("members-portal-section-body-input").fill(draftBody);
    await expect(page.getByTestId("members-portal-preview-section-welcome_message")).toContainText(draftBody);

    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const portal = cfg?.membersPortal as { sections?: PortalSection[] } | undefined;
        return portal?.sections?.find((section) => section.type === "welcome_message")?.body;
      }, { timeout: 5000 })
      .toBe("Original private member portal copy.");

    await page.getByTestId("members-portal-section-move-down-welcome_message").click();
    await expect
      .poll(async () => {
        const rosterBox = await page.getByTestId("members-portal-preview-section-member_roster").boundingBox();
        const welcomeBox = await page.getByTestId("members-portal-preview-section-welcome_message").boundingBox();
        return Boolean(rosterBox && welcomeBox && rosterBox.y < welcomeBox.y);
      }, { timeout: 10000 })
      .toBe(true);

    await page.getByTestId("members-portal-section-select-member_roster").click();
    await expect(page.getByTestId("members-portal-roster-helper")).toContainText(
      "The member roster is rendered live from your members list",
    );
    await expect(page.getByTestId("members-portal-section-body-input")).toBeHidden();

    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/members-portal") &&
        res.request().method() === "PATCH",
    );
    await page.getByTestId("members-portal-save").click();
    const response = await saveResponse;
    expect(response.ok(), await response.text().catch(() => "")).toBe(true);

    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const portal = cfg?.membersPortal as { sections?: PortalSection[] } | undefined;
        return {
          firstType: portal?.sections?.[0]?.type,
          welcomeBody: portal?.sections?.find((section) => section.type === "welcome_message")?.body,
        };
      }, { timeout: 60000 })
      .toEqual({ firstType: "member_roster", welcomeBody: draftBody });
  });

  test("keeps unsaved drafts through refresh, supports discard, and shows save failures", async ({ page }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    const seeded = {
      ...before,
      features: {
        ...((before?.features as Record<string, unknown> | undefined) ?? {}),
        members: true,
      },
      membersPortal: {
        provisionedAt: "2026-05-02T00:00:00.000Z",
        sections: BASELINE_PORTAL_SECTIONS,
      },
    };
    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify(seeded), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
    await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Members Portal" })).toBeVisible({ timeout: 15000 });

    const unsavedBody = `Refresh draft portal copy ${Date.now()}`;
    await page.getByTestId("members-portal-section-select-welcome_message").click();
    await page.getByTestId("members-portal-section-body-input").fill(unsavedBody);
    await expect(page.getByTestId("members-portal-preview-section-welcome_message")).toContainText(unsavedBody);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Members Portal" })).toBeVisible({ timeout: 15000 });
    await page.getByTestId("members-portal-section-select-welcome_message").click();
    await expect(page.getByTestId("members-portal-section-body-input")).toHaveValue(unsavedBody);
    await expect(page.getByTestId("members-portal-discard")).toBeVisible();

    await page.getByTestId("members-portal-discard").click();
    await expect(page.getByTestId("members-portal-preview-section-welcome_message")).toContainText(
      "Original private member portal copy.",
    );

    const failedBody = `Failed save portal copy ${Date.now()}`;
    await page.getByTestId("members-portal-section-select-welcome_message").click();
    await page.getByTestId("members-portal-section-body-input").fill(failedBody);
    await page.route("**/api/members-portal", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated portal save failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByTestId("members-portal-save").click();
    await expect(page.getByTestId("members-portal-save-error")).toContainText("Simulated portal save failure");
    await expect(page.getByTestId("members-portal-preview-section-welcome_message")).toContainText(failedBody);
    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const portal = cfg?.membersPortal as { sections?: PortalSection[] } | undefined;
        return portal?.sections?.find((section) => section.type === "welcome_message")?.body;
      }, { timeout: 5000 })
      .toBe("Original private member portal copy.");
  });

  test("persists starter sections on first workbench load", async ({ page }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    const seeded = { ...before, features: { ...((before.features as Record<string, unknown> | undefined) ?? {}), members: true } };
    delete (seeded as Record<string, unknown>).membersPortal;
    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify(seeded), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
    await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Members Portal" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("members-portal-save")).toBeDisabled();
    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const portal = cfg?.membersPortal as { sections?: PortalSection[] } | undefined;
        return portal?.sections?.length ?? 0;
      }, { timeout: 10000 })
      .toBeGreaterThan(0);
  });

  test("AI suggestions skip duplicates and add only useful new sections", async ({ page }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify({
        ...before,
        features: { ...((before?.features as Record<string, unknown> | undefined) ?? {}), members: true },
        membersPortal: {
          provisionedAt: "2026-05-03T00:00:00.000Z",
          sections: BASELINE_PORTAL_SECTIONS,
        },
      }), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
    await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await page.route("**/api/members-portal/ai-suggest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            { type: "welcome_message", title: "Duplicate welcome", body: "Should not be added." },
            { type: "dues_info", title: "Dues information", body: "Annual dues are reviewed each July.", payUrl: null },
          ],
        }),
      });
    });

    await page.getByTestId("members-portal-ai-suggest").click();
    await expect(page.getByTestId("members-portal-section-row-dues_info")).toBeVisible();
    await expect(page.getByTestId("members-portal-section-row-welcome_message")).toHaveCount(1);
    await expect(page.getByTestId("members-portal-preview-section-dues_info")).toContainText("Annual dues are reviewed each July.");
  });

  test("rejects unsafe or malformed portal updates at the API boundary", async ({ page, request }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify({
        ...before,
        features: { ...((before?.features as Record<string, unknown> | undefined) ?? {}), members: true },
        membersPortal: {
          provisionedAt: "2026-05-04T00:00:00.000Z",
          sections: BASELINE_PORTAL_SECTIONS,
        },
      }), TEST_ORG_SLUG],
    );

    const unauthenticated = await request.patch(`${STEWARD}/api/members-portal`, {
      data: { sections: BASELINE_PORTAL_SECTIONS },
    });
    expect([401, 403]).toContain(unauthenticated.status());

    await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
    await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });

    const duplicate = await patchPortalFromPage(page, [
      BASELINE_PORTAL_SECTIONS[0],
      { ...BASELINE_PORTAL_SECTIONS[0], title: "Duplicate" },
    ]);
    expect(duplicate.status).toBe(400);
    expect(String(duplicate.body.error)).toContain("Duplicate portal section type");

    const badPayUrl = await patchPortalFromPage(page, [
      { type: "dues_info", title: "Dues information", payUrl: "http://unsafe.example/pay" },
    ]);
    expect(badPayUrl.status).toBe(400);
    expect(String(badPayUrl.body.error)).toContain("https://");

    const tooMany = await patchPortalFromPage(page, Array.from({ length: 13 }, () => ({ type: "welcome_message" })));
    expect(tooMany.status).toBe(400);
    expect(String(tooMany.body.error)).toContain("up to 12 sections");
  });

  test("shows delayed public sync warnings as visible support copy", async ({ page }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify({
        ...before,
        features: { ...((before?.features as Record<string, unknown> | undefined) ?? {}), members: true },
        membersPortal: {
          provisionedAt: "2026-05-05T00:00:00.000Z",
          sections: BASELINE_PORTAL_SECTIONS,
        },
      }), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
    await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("members-portal-section-select-welcome_message").click();
    await page.getByTestId("members-portal-section-body-input").fill("Sync warning draft");

    await page.route("**/api/members-portal", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sections: [{ ...BASELINE_PORTAL_SECTIONS[0], body: "Sync warning draft" }, ...BASELINE_PORTAL_SECTIONS.slice(1)],
            provisionedAt: "2026-05-05T00:00:00.000Z",
            revision: "sync-warning-test",
            orgName: "Norwin Rotary",
            orgSlug: TEST_ORG_SLUG,
            templateLabel: "civic service club",
            available: [],
            warning: "Portal saved, but the public member site sync is delayed. Try saving again in a moment.",
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByTestId("members-portal-save").click();
    await expect(page.getByTestId("members-portal-sync-warning")).toContainText("public member site sync is delayed");
  });

  test("mobile workbench keeps preview and guarded editing usable", async ({ page }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);
    await page.setViewportSize({ width: 390, height: 844 });

    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify({
        ...before,
        features: { ...((before?.features as Record<string, unknown> | undefined) ?? {}), members: true },
        membersPortal: {
          provisionedAt: "2026-05-06T00:00:00.000Z",
          sections: BASELINE_PORTAL_SECTIONS,
        },
      }), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
    await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByText("Live portal preview")).toBeVisible();
    await expect(page.getByText("Add a section")).toBeVisible();
    await page.getByTestId("members-portal-section-select-member_roster").click();
    await expect(page.getByTestId("members-portal-roster-helper")).toContainText("no manual data entry");
  });

  test("saved portal sections render on the member-facing portal", async ({ page }) => {
    const before = originalSiteConfig;
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);
    const orgId = await getTestOrgId();
    test.skip(!orgId, "Test org not found");

    const body = `Member-facing saved portal copy ${Date.now()}`;
    const email = `member.portal.${Date.now()}@test.local`;
    const password = "TestPass123!";
    let memberId: string | null = null;
    try {
      await dbQuery(
        "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
        [JSON.stringify({
          ...before,
          features: { ...((before?.features as Record<string, unknown> | undefined) ?? {}), members: true },
          membersPortal: {
            provisionedAt: "2026-05-07T00:00:00.000Z",
            sections: BASELINE_PORTAL_SECTIONS,
          },
        }), TEST_ORG_SLUG],
      );

      await loginToSteward(page, { targetPath: "/dashboard/members-portal" });
      await page.goto(`${STEWARD}/dashboard/members-portal`, { waitUntil: "networkidle" });
      const patch = await patchPortalFromPage(page, [
        { type: "welcome_message", title: "Members home", body },
        ...BASELINE_PORTAL_SECTIONS.slice(1),
      ]);
      expect(patch.status).toBe(200);

      const rows = await dbQuery(
        `INSERT INTO members (org_id, first_name, last_name, email, status, member_type, registration_token)
         VALUES ($1, 'Portal', 'Renderer', $2, 'pending', 'general', gen_random_uuid()::text)
         RETURNING id, registration_token`,
        [orgId, email],
      );
      memberId = rows[0]?.id ?? null;
      const token = rows[0]?.registration_token;
      expect(token).toBeTruthy();
      const register = await page.request.post(`${CP}/api/members/register`, {
        headers: { "x-org-id": TEST_ORG_SLUG },
        data: { token, password },
      });
      expect(register.ok(), await register.text()).toBe(true);

      await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("member-facing-section-welcome_message")).toContainText(body);
    } finally {
      if (memberId) await dbQuery("DELETE FROM members WHERE id = $1", [memberId]);
    }
  });
});
