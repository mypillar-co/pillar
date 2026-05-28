import { test, expect } from "@playwright/test";
import {
  STEWARD,
  TEST_ORG_SLUG,
  dbQuery,
  getSiteConfig,
  loginToSteward,
} from "./helpers";

type PortalSection = {
  type: string;
  title?: string;
  body?: string;
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
});
