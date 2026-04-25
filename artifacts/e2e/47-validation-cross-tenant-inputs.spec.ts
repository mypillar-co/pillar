import { test, expect } from "@playwright/test";
import { CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Validation Victor — Cross-Tenant Inputs", () => {
  test("Invalid org header cannot expose test org member data", async ({ request }) => {
    const res = await request.get(`${CP}/api/members/directory`, {
      headers: {
        "x-org-id": `../${TEST_ORG_SLUG}`,
      },
    });

    expect(res.status()).toBeLessThan(500);

    const text = await res.text();
    expect(text).not.toContain("test-org-pillar-001");
    expect(text).not.toContain(TEST_ORG_SLUG);
  });

  test("SQL-looking org header is safely handled", async ({ request }) => {
    const res = await request.get(`${CP}/api/org-config`, {
      headers: {
        "x-org-id": "'; DROP TABLE organizations; --",
      },
    });

    expect(res.status()).toBeLessThan(500);

    const text = await res.text();
    expect(text).not.toContain("Internal Server Error");
    expect(text).not.toContain("syntax error");
  });
});
