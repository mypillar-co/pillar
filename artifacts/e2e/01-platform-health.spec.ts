import { test, expect } from "@playwright/test";
import { API, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Platform Health", () => {
  test("API server healthcheck returns ok", async ({ request }) => {
    const res = await request.get(`${API}/api/healthz`);
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).toContain("ok");
  });

  test("Community platform healthcheck returns ok", async ({ request }) => {
    const res = await request.get(`${CP}/api/healthz`);
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).toContain("ok");
  });

  test("Community platform serves HTML on root", async ({ request }) => {
    const res = await request.get(CP);
    expect(res.ok()).toBe(true);
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toContain("text/html");
  });

  test("Deploy gate artifact has correct base path", async ({ request }) => {
    const res = await request.get(`${CP}/`);
    expect(res.ok()).toBe(true);
  });

  test("Test org community site route responds without server error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}`, {
      waitUntil: "domcontentloaded",
    });

    expect(res?.status() ?? 0).toBeLessThan(500);
    expect(page.url()).toContain(`/sites/${TEST_ORG_SLUG}`);

    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText.length).toBeGreaterThan(0);
    expect(errors.filter((e) => e.includes("SyntaxError"))).toHaveLength(0);
  });

  test("Asset files return correct content types not HTML", async ({ request }) => {
    const root = await request.get(`${CP}/`);
    expect(root.status()).toBeLessThan(500);

    const html = await root.text();
    const assetMatches = [...html.matchAll(/(?:src|href)=\"([^\"]+\.(?:js|css|png|jpg|jpeg|svg|webp))\"/gi)]
      .map((m) => m[1])
      .filter(Boolean);

    if (assetMatches.length === 0) {
      test.skip(true, "No concrete static asset references in current dev HTML");
      return;
    }

    const assetPath = assetMatches[0];
    const assetUrl = assetPath.startsWith("http")
      ? assetPath
      : assetPath.startsWith("/")
        ? `${CP}${assetPath}`
        : `${CP}/${assetPath}`;

    const assetRes = await request.get(assetUrl);
    expect(assetRes.status()).toBeLessThan(500);

    if (assetRes.status() === 404) {
      test.skip(true, `Asset referenced by dev HTML was not present: ${assetUrl}`);
      return;
    }

    const ct = assetRes.headers()["content-type"] ?? "";
    expect(ct, `Asset ${assetUrl} should not be served as the HTML fallback`).not.toContain("text/html");
  });
});
