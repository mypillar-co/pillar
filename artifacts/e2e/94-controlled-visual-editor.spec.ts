import { test, expect } from "@playwright/test";
import {
  API,
  STEWARD,
  TEST_ORG_SLUG,
  dbQuery,
  getSiteConfig,
  loginToSteward,
} from "./helpers";

type HomepageSection = {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  body?: string;
  visible?: boolean;
};

const BASELINE_SECTIONS: HomepageSection[] = [
  { id: "hero", type: "hero", title: "Hero", visible: true },
  { id: "stats", type: "stats", title: "Impact", visible: true },
  { id: "events", type: "events", title: "Upcoming Events", visible: true },
];

test.describe("Controlled visual homepage editor", () => {
  test("edits pages with live preview, inline text, event locks, and per-page publish", async ({ page }) => {
    const before = await getSiteConfig(TEST_ORG_SLUG);
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    const seeded = {
      ...before,
      orgType: "rotary",
      mission: "Providing food for students, scholarships for graduating seniors, dictionaries for 3rd graders, and recognition for local military personnel.",
      sections: BASELINE_SECTIONS,
      siteContent: {
        ...((before?.siteContent as Record<string, unknown> | undefined) ?? {}),
        about_mission: "Norwin Rotary provides scholarships to graduating seniors and supports students across the community.",
      },
      features: {
        ...((before?.features as Record<string, unknown> | undefined) ?? {}),
        customPages: [
          {
            title: "Service Projects",
            slug: "service-projects",
            navLabel: "Service Projects",
            showInNav: true,
            intro: "Norwin Rotary gives back through local service.",
            sections: [
              { title: "Food for Students", body: "Providing food for Norwin students in need." },
            ],
          },
        ],
        pageSections: {},
        siteArchetype: "civic_service",
        homepageSections: BASELINE_SECTIONS,
      },
    };
    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify(seeded), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/site" });
    await page.goto(`${STEWARD}/dashboard/site`, { waitUntil: "networkidle" });

    await expect(page.getByText("AI Website Updates")).toBeVisible({ timeout: 15000 });

    const preview = page.frameLocator('iframe[title="Site preview"]');
    await expect(preview.getByTestId("homepage-section-hero")).toBeVisible({ timeout: 15000 });

    const uniqueTitle = `Inline hero ${Date.now()}`;
    await page.getByTestId("homepage-section-row-hero").click();
    await preview.getByRole("heading", { name: "Hero" }).click();
    await page.keyboard.type(uniqueTitle);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("homepage-section-title-input")).toHaveValue(uniqueTitle);
    await expect(preview.getByRole("heading", { name: uniqueTitle })).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const features = cfg?.features as Record<string, unknown> | undefined;
        const sections = (features?.homepageSections ?? cfg?.sections) as HomepageSection[] | undefined;
        return sections?.find((section) => section.type === "hero")?.title;
      }, { timeout: 10000 })
      .toBe("Hero");

    await page.getByTestId("homepage-section-row-hero").dragTo(page.getByTestId("homepage-section-row-stats"));
    await expect
      .poll(async () => {
        const heroBox = await preview.getByTestId("homepage-section-hero").boundingBox();
        const statsBox = await preview.getByTestId("homepage-section-stats").boundingBox();
        return Boolean(heroBox && statsBox && heroBox.y > statsBox.y);
      }, { timeout: 15000 })
      .toBe(true);

    await page.getByTestId("homepage-section-row-events").click();
    await expect(page.getByTestId("homepage-section-locked-helper")).toContainText(
      "This content is managed from Events. You can reorder or remove this section here.",
    );
    await expect(page.getByTestId("homepage-section-title-input")).toBeHidden();
    await expect(page.getByTestId("homepage-section-body-input")).toBeHidden();
    await page.getByTestId("homepage-section-delete-events").click();
    await expect(preview.getByTestId("homepage-section-events")).toBeHidden({ timeout: 15000 });

    const publishResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/community-site/page-sections") &&
        res.request().method() === "PATCH",
    );
    await page.getByTestId("visual-editor-page-home").click();
    await page.getByTestId("page-sections-publish").click();
    const response = await publishResponse;
    expect(response.ok(), await response.text().catch(() => "")).toBe(true);

    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const features = cfg?.features as Record<string, unknown> | undefined;
        const sections = (features?.homepageSections ?? cfg?.sections) as HomepageSection[] | undefined;
        return {
          heroIndex: sections?.findIndex((section) => section.type === "hero"),
          heroTitle: sections?.find((section) => section.type === "hero")?.title,
          hasEvents: sections?.some((section) => section.type === "events"),
        };
      }, { timeout: 60000 })
      .toEqual({ heroIndex: 1, heroTitle: uniqueTitle, hasEvents: false });

    await page.getByTestId("visual-editor-page-about").click();
    await expect(preview.getByTestId("page-section-about-about_intro")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("homepage-section-row-about_intro").click();
    const aboutTitle = `About service ${Date.now()}`;
    await page.getByTestId("homepage-section-title-input").fill(aboutTitle);
    await expect(preview.getByRole("heading", { name: aboutTitle })).toBeVisible({ timeout: 15000 });
    await page.getByTestId("page-sections-publish").click();
    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const features = cfg?.features as Record<string, unknown> | undefined;
        const pageSections = features?.pageSections as Record<string, HomepageSection[]> | undefined;
        return pageSections?.about?.find((section) => section.type === "about_intro")?.title;
      }, { timeout: 60000 })
      .toBe(aboutTitle);

    await page.getByTestId("visual-editor-page-custom-service-projects").click();
    await expect(preview.getByTestId("page-section-custom-page_hero")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("homepage-section-row-page_hero").click();
    const customTitle = `Projects ${Date.now()}`;
    await page.getByTestId("homepage-section-title-input").fill(customTitle);
    await expect(preview.getByRole("heading", { name: customTitle })).toBeVisible({ timeout: 15000 });
    await page.getByTestId("page-sections-publish").click();
    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const features = cfg?.features as Record<string, unknown> | undefined;
        const pageSections = features?.pageSections as Record<string, HomepageSection[]> | undefined;
        return pageSections?.["custom:service-projects"]?.find((section) => section.type === "page_hero")?.title;
      }, { timeout: 60000 })
      .toBe(customTitle);

    await page.getByTestId("visual-editor-page-events").click();
    await expect(page.getByTestId("page-locked-helper")).toContainText("Events are managed from the Events tab.");
    await expect(page.getByTestId("homepage-section-title-input")).toBeHidden();

    await page.getByRole("button", { name: /Pages & menu/ }).click();
    await expect(page.getByText("New page draft")).toBeVisible();
    await expect(page.getByTestId("page-template-scholarships")).toBeVisible();
    await page.getByTestId("page-template-scholarships").click();
    await expect(page.getByTestId("page-title-input")).toHaveValue("Scholarships");

    await page.goto(`${API}/sites/${TEST_ORG_SLUG}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: uniqueTitle })).toBeVisible({ timeout: 15000 });
  });

  test("keeps draft through refresh and surfaces publish failures without persisting", async ({ page }) => {
    const before = await getSiteConfig(TEST_ORG_SLUG);
    test.skip(!before, `No site_config found for ${TEST_ORG_SLUG}`);

    const seeded = {
      ...before,
      sections: BASELINE_SECTIONS,
      features: {
        ...((before?.features as Record<string, unknown> | undefined) ?? {}),
        customPages: [],
        pageSections: {},
        homepageSections: BASELINE_SECTIONS,
      },
    };
    await dbQuery(
      "UPDATE organizations SET site_config = $1::jsonb WHERE slug = $2",
      [JSON.stringify(seeded), TEST_ORG_SLUG],
    );

    await loginToSteward(page, { targetPath: "/dashboard/site" });
    await page.goto(`${STEWARD}/dashboard/site`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("AI Website Updates")).toBeVisible({ timeout: 15000 });

    const draftTitle = `Refresh-safe hero ${Date.now()}`;
    await page.getByTestId("homepage-section-row-hero").click();
    await page.getByTestId("homepage-section-title-input").fill(draftTitle);
    await expect(page.frameLocator('iframe[title="Site preview"]').getByRole("heading", { name: draftTitle })).toBeVisible({ timeout: 15000 });

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("AI Website Updates")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("homepage-section-row-hero").click();
    await expect(page.getByTestId("homepage-section-title-input")).toHaveValue(draftTitle);

    await page.route("**/api/community-site/page-sections", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated publish failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByTestId("page-sections-publish").click();
    await expect(page.getByText("Simulated publish failure")).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => {
        const cfg = await getSiteConfig(TEST_ORG_SLUG);
        const features = cfg?.features as Record<string, unknown> | undefined;
        const sections = (features?.homepageSections ?? cfg?.sections) as HomepageSection[] | undefined;
        return sections?.find((section) => section.type === "hero")?.title;
      }, { timeout: 10000 })
      .toBe("Hero");
  });
});
