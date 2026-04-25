import { test, expect } from "@playwright/test";
import { API, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Events", () => {
  test("Events page route responds on community site", async ({ page }) => {
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/events`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });

  test("Events API returns events array", async ({ request }) => {
    const res = await request.get(`${CP}/api/events`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(Array.isArray(json) || Array.isArray(json?.events)).toBe(true);
  });

  test("CP events API returns test event or valid empty array", async ({ request }) => {
    const res = await request.get(`${CP}/api/events`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(res.ok()).toBe(true);
    const json = await res.json();
    const events = Array.isArray(json) ? json : json?.events ?? [];
    expect(Array.isArray(events)).toBe(true);
  });

  test("Event detail page route responds", async ({ page, request }) => {
    const apiRes = await request.get(`${CP}/api/events`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    const json = await apiRes.json();
    const events = Array.isArray(json) ? json : json?.events ?? [];
    const slug = events[0]?.slug ?? "test-event";
    const res = await page.goto(`${API}/sites/${TEST_ORG_SLUG}/events/${slug}`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
  });
});
