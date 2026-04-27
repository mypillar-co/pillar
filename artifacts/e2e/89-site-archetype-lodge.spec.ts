import { test, expect } from "@playwright/test";
import {
  cleanupTempOrg,
  createTempOrg,
  loginAndGenerateSite,
} from "./site-archetype-test-utils";

test.describe("Site archetype — lodge / fraternal", () => {
  let orgId = "";
  let slug = "";

  test.afterEach(async () => {
    if (orgId) {
      await cleanupTempOrg(orgId);
      orgId = "";
      slug = "";
    }
  });

  test("generated lodge homepage uses a specific hero and membership-forward CTA", async ({
    page,
  }) => {
    const ts = Date.now();
    const created = await createTempOrg({
      name: "Harmony Lodge No. 47",
      slug: `pw-lodge-${ts}`,
      type: "Fraternal Organization",
      category: "lodge",
    });
    orgId = created.id;
    slug = created.slug;

    const generated = await loginAndGenerateSite(page, slug, {
      orgName: "Harmony Lodge No. 47",
      orgType: "Fraternal Organization",
      history: [
        {
          role: "user",
          content:
            "Harmony Lodge No. 47 is a Masonic lodge in Latrobe, Pennsylvania. We preserve ritual, fellowship, and local service. Members meet every second Thursday at 7:00 PM at our historic temple in downtown Latrobe. Programs include candidate education, scholarship support, and community dinners.",
        },
      ],
    });
    await page.setContent(generated.site.generatedHtml ?? "", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.locator("body")).toContainText("Harmony Lodge No. 47");
    await expect(page.locator("body")).toContainText(/Visit a Meeting|Membership Info/);
    await expect(page.locator("body")).not.toContainText(
      /Welcome to Our Community|Building a Better Future|Empowering Our Community/i,
    );
    await expect(page.locator("body")).not.toContainText(/UMA/i);
  });
});
