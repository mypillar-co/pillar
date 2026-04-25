import { test, expect } from "@playwright/test";
import { API, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Cross-Tenant — Smoke", () => {
  test("Public org config is scoped to requested org slug", async ({ request }) => {
    const res = await request.get(`${CP}/api/org-config`, {
      headers: {
        "x-org-id": TEST_ORG_SLUG,
      },
    });

    expect(res.ok(), `Expected org-config to load, got ${res.status()}`).toBe(true);

    const json = await res.json();
    const body = JSON.stringify(json);

    expect(body).toContain(TEST_ORG_SLUG);
  });

  test("Invalid org slug does not expose test org private data", async ({ request }) => {
    const res = await request.get(`${CP}/api/org-config`, {
      headers: {
        "x-org-id": "definitely-not-a-real-org-slug",
      },
    });

    expect([200, 404]).toContain(res.status());

    const text = await res.text();

    expect(text).not.toContain(TEST_ORG_SLUG);
    expect(text).not.toContain("test-org-pillar-001");
  });

  test("API rejects cross-org member directory without auth", async ({ request }) => {
    const res = await request.get(`${CP}/api/members/directory`, {
      headers: {
        "x-org-id": TEST_ORG_SLUG,
      },
    });

    expect([401, 403]).toContain(res.status());
  });

  test("Unknown org public site does not render test org content", async ({ page }) => {
    await page.goto(`${API}/sites/definitely-not-a-real-org-slug`, {
      waitUntil: "domcontentloaded",
    });

    const body = (await page.textContent("body")) ?? "";

    expect(body).not.toContain(TEST_ORG_SLUG);
    expect(body).not.toContain("test-org-pillar-001");
  });
});