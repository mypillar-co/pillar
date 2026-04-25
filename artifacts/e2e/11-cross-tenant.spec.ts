import { test, expect } from "@playwright/test";
import { CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Cross-Tenant Isolation", () => {
  test("Org config for invalid org does not expose test org data", async ({ request }) => {
    const res = await request.get(`${CP}/api/org-config`, {
      headers: { "x-org-id": "e2e-invalid-tenant" },
    });
    expect([200, 404]).toContain(res.status());
    const text = await res.text();
    expect(text).not.toContain(TEST_ORG_SLUG);
    expect(text).not.toContain("test-org-pillar-001");
  });

  test("Member directory requires auth for test org", async ({ request }) => {
    const res = await request.get(`${CP}/api/members/directory`, {
      headers: { "x-org-id": TEST_ORG_SLUG },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("Member announcements require auth for test org", async ({ request }) => {
    const res = await request.get(`${CP}/api/members/announcements`, {
      headers: { "x-org-id": TEST_ORG_SLUG },
    });
    expect([401, 403]).toContain(res.status());
  });
});
