import { test, expect } from "@playwright/test";
import {
  cleanupTempOrg,
  createTempOrg,
  insertEvent,
  loginAndGenerateSite,
} from "./site-archetype-test-utils";

test.describe("Site archetype — quality gates", () => {
  let orgId = "";
  let slug = "";

  test.afterEach(async () => {
    if (orgId) {
      await cleanupTempOrg(orgId);
      orgId = "";
      slug = "";
    }
  });

  test("generated event homepage is specific, CTA-driven, and avoids internal or generic fallback text", async ({
    page,
  }) => {
    const ts = Date.now();
    const created = await createTempOrg({
      name: "Three Rivers Fall Festival",
      slug: `pw-festival-${ts}`,
      type: "Other",
      category: "festival",
    });
    orgId = created.id;
    slug = created.slug;

    await insertEvent(orgId, {
      name: "Three Rivers Fall Festival 2026",
      slug: `fall-festival-${ts}`,
      description:
        "A downtown weekend with food vendors, family activities, sponsor booths, and live music all day.",
      location: "Market Square",
      startDate: "2026-10-03",
      startTime: "10:00",
      hasRegistration: true,
      featuredOnSite: true,
    });

    const generated = await loginAndGenerateSite(page, slug, {
      orgName: "Three Rivers Fall Festival",
      orgType: "Other",
      history: [
        {
          role: "user",
          content:
            "Three Rivers Fall Festival is Pittsburgh's annual downtown street festival. We bring together food vendors, sponsors, live music, and family activities. The festival weekend is October 3, 2026 in Market Square, and visitors should be able to buy tickets and plan their visit quickly.",
        },
      ],
    });
    await page.setContent(generated.site.generatedHtml ?? "", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("body")).toContainText(/Buy Tickets|See Event Details|Become a Vendor/);
    await expect(page.locator("body")).toContainText(/October|Market Square|Three Rivers Fall Festival 2026/);
    await expect(page.locator("body")).not.toContainText(/UMA/i);
    await expect(page.locator("body")).not.toContainText(
      /Welcome to Our Community|Building a Better Future|Empowering Our Community/i,
    );
  });
});
