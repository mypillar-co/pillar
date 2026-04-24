import { test, expect } from "@playwright/test";
import { API, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Public Site — Rendering", () => {
  test("Public site route and org config are healthy", async ({ page, request }) => {
    const cfg = await request.get(`${CP}/api/org-config`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(cfg.ok()).toBe(true);

    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);

    const html = await page.content();
    expect(html.length).toBeGreaterThan(100);
    expect(html).not.toContain("Internal Server Error");
    expect(html).not.toContain("Cannot GET");
  });

  test("Public site exposes data through public APIs", async ({ request }) => {
    const [config, events] = await Promise.all([
      request.get(`${CP}/api/org-config`, { headers: { "x-org-id": TEST_ORG_SLUG } }),
      request.get(`${CP}/api/events`, { headers: { "x-org-id": TEST_ORG_SLUG } }),
    ]);
    expect(config.ok()).toBe(true);
    expect(events.ok()).toBe(true);
    expect(JSON.stringify(await config.json()).length).toBeGreaterThan(10);
  });
});
