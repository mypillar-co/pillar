import { test, expect } from "@playwright/test";
import {
  cleanupTempOrg,
  createTempOrg,
  insertEvent,
  loginAndGenerateSite,
} from "./site-archetype-test-utils";

test.describe("Site archetype — civic service", () => {
  let orgId = "";
  let slug = "";

  test.afterEach(async () => {
    if (orgId) {
      await cleanupTempOrg(orgId);
      orgId = "";
      slug = "";
    }
  });

  test("generated Rotary homepage emphasizes service and meeting participation", async ({
    page,
  }) => {
    const ts = Date.now();
    const created = await createTempOrg({
      name: "River City Rotary Club",
      slug: `pw-rotary-${ts}`,
      type: "Rotary Club",
      category: "civic",
    });
    orgId = created.id;
    slug = created.slug;

    await insertEvent(orgId, {
      name: "Community Cleanup Saturday",
      slug: `cleanup-${ts}`,
      description: "A hands-on riverfront cleanup and supply drive with club members and neighbors.",
      location: "Riverfront Park",
      startDate: "2026-05-16",
      startTime: "09:00",
      featuredOnSite: true,
    });

    const generated = await loginAndGenerateSite(page, slug, {
      orgName: "River City Rotary Club",
      orgType: "Rotary Club",
      history: [
        {
          role: "user",
          content:
            "River City Rotary Club serves the Harrisburg area through youth scholarships, neighborhood cleanups, and monthly service projects. We meet every Wednesday at 12:15 PM at the Civic Center. Our members show up to lead practical local projects.",
        },
      ],
    });
    await page.setContent(generated.site.generatedHtml ?? "", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("body")).toContainText("River City Rotary Club");
    await expect(page.locator("body")).toContainText(/Attend a Meeting|See Upcoming Projects/);
    await expect(page.locator("body")).toContainText(/Community Cleanup Saturday|Riverfront Park/);
    await expect(page.locator("body")).not.toContainText(
      /Welcome to Our Community|Building a Better Future|Empowering Our Community/i,
    );
    await expect(page.locator("body")).not.toContainText(/UMA/i);
  });
});
