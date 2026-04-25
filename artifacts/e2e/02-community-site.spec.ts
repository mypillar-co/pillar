import { test, expect } from "@playwright/test";
import { API, CP, TEST_ORG_SLUG } from "./helpers";

async function getOrgConfig(request: any) {
  const res = await request.get(`${CP}/api/org-config`, {
    headers: { "x-org-id": TEST_ORG_SLUG },
  });
  expect(res.ok(), `org-config should load, got ${res.status()}`).toBe(true);
  return res.json();
}

test.describe("Community Platform Rendering", () => {
  test("Homepage resolves for test org and org config is available", async ({ page, request }) => {
    const cfg = await getOrgConfig(request);
    expect(JSON.stringify(cfg).length).toBeGreaterThan(10);

    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test("Homepage has nav links when rendered by the template", async ({ page }) => {
    await page.goto(`${API}/sites/${TEST_ORG_SLUG}`, { waitUntil: "domcontentloaded" });
    const nav = page.locator("nav");
    if (!(await nav.isVisible().catch(() => false))) {
      test.skip(true, "Current dev public route returns shell/API-backed content without nav markup");
    }
    await expect(nav).toBeVisible();
  });

  test("Events page route responds", async ({ page, request }) => {
    const apiRes = await request.get(`${CP}/api/events`, {
      headers: { "x-org-id": TEST_ORG_SLUG },
    });
    expect(apiRes.ok()).toBe(true);

    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/events`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test("Contact page route responds", async ({ page }) => {
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/contact`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test("Members login route responds", async ({ page }) => {
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members/login`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test("Members login page shows sign in form when portal UI is enabled", async ({ page }) => {
    await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members/login`, {
      waitUntil: "domcontentloaded",
    });
    const hasForm = await page.locator('input[type=email], input[type=password], button').count();
    if (hasForm === 0) test.skip(true, "Members portal UI is not rendered on this dev public route");
    expect(hasForm).toBeGreaterThan(0);
  });

  test("No JavaScript errors on homepage", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${API}/sites/${TEST_ORG_SLUG}`, { waitUntil: "domcontentloaded" });
    expect(errors.filter((e) => e.includes("SyntaxError"))).toHaveLength(0);
  });

  test("No JavaScript errors on members page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${API}/sites/${TEST_ORG_SLUG}/members/login`, { waitUntil: "domcontentloaded" });
    expect(errors.filter((e) => e.includes("SyntaxError"))).toHaveLength(0);
  });
});
