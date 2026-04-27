import { test, expect } from "@playwright/test";
import { API, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Public homepage composition", () => {
  test("renders a specific headline and non-generic primary CTA", async ({ page, request }) => {
    const cfgRes = await request.get(`${CP}/api/org-config`, {
      headers: { "x-org-id": TEST_ORG_SLUG },
    });
    expect(cfgRes.ok()).toBe(true);
    const cfg = await cfgRes.json() as { orgName?: string };

    const res = await page.goto(CP, {
  waitUntil: "domcontentloaded",
});
    expect(res?.status() ?? 0).toBeLessThan(500);

    const headline = page.locator(".cp-hero-copy h1").first();
    await expect(headline).toBeVisible({ timeout: 15000 });
    const headlineText = (await headline.textContent())?.trim() ?? "";
    expect(headlineText.length).toBeGreaterThan(12);
    expect(headlineText).not.toBe(cfg.orgName ?? "");

    const primaryCta = page.locator(".cp-btn-primary").first();
    await expect(primaryCta).toBeVisible({ timeout: 15000 });
    const ctaText = (await primaryCta.textContent())?.trim() ?? "";
    expect(ctaText.length).toBeGreaterThan(8);
    expect(ctaText).not.toMatch(/^(Learn More|View Events)$/i);

    await expect(page.locator("body")).not.toContainText(/UMA/);
  });
});
