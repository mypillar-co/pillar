import { test, expect } from "@playwright/test";
import { API, CP } from "./helpers";

test.describe("Platform Health", () => {
  test("API server healthcheck returns ok", async ({ request }) => {
    const r = await request.get(`${API}/api/healthz`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });

  test("Community platform healthcheck returns ok", async ({ request }) => {
    const r = await request.get(`${CP}/api/healthz`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe("ok");
  });

  test("Community platform serves HTML on root", async ({ request }) => {
    const r = await request.get(`${CP}/`);
    expect(r.status()).toBe(200);
    const ct = r.headers()["content-type"];
    expect(ct).toContain("text/html");
  });

  test("Deploy gate artifact has correct base path", async () => {
    const { readFileSync } = await import("fs");
    const html = readFileSync("artifacts/community-platform/dist/public/index.html", "utf8");
    expect(html).toContain("/sites/placeholder/assets/");
  });

  test("Test org community site loads without blank page", async ({ page }) => {
    await page.goto(`${CP}/sites/norwin-rotary-uic5/`);
    await page.waitForLoadState("networkidle");
    const title = await page.title();
    expect(title).not.toBe("");
    const bodyText = await page.textContent("body");
    expect(bodyText?.length).toBeGreaterThan(100);
    const jsErrors: string[] = [];
    page.on("pageerror", e => jsErrors.push(e.message));
    expect(jsErrors.filter(e => e.includes("SyntaxError"))).toHaveLength(0);
  });

  test("Asset files return correct content types not HTML", async ({ request }) => {
    const page = await request.get(`${CP}/sites/norwin-rotary-uic5/`);
    const html = await page.text();
    const jsMatch = html.match(/src="([^"]+\.js)"/);
    if (jsMatch) {
      const jsUrl = jsMatch[1].startsWith("http") ? jsMatch[1] : `${CP}${jsMatch[1]}`;
      const jsRes = await request.get(jsUrl);
      expect(jsRes.headers()["content-type"]).toContain("javascript");
    }
  });
});
