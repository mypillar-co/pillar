import { test, expect } from "@playwright/test";
import { CP, TEST_ORG_SLUG } from "./helpers";

test.describe("Validation Victor — Public Forms", () => {
  test("Newsletter endpoint rejects or safely handles invalid email", async ({ request }) => {
    const res = await request.post(`${CP}/api/newsletter/subscribe`, {
      headers: { "x-org-id": TEST_ORG_SLUG },
      data: {
        email: "not-an-email",
        name: "Victor Invalid",
      },
    });

    expect(res.status()).toBeLessThan(500);

    const text = await res.text();
    expect(text).not.toContain("Internal Server Error");
    expect(text).not.toContain("ECONNREFUSED");
  });

  test("Contact endpoint rejects or safely handles missing message", async ({ request }) => {
    const res = await request.post(`${CP}/api/contact`, {
      headers: { "x-org-id": TEST_ORG_SLUG },
      data: {
        name: "Victor",
        email: "victor@example.com",
      },
    });

    expect(res.status()).toBeLessThan(500);

    const text = await res.text();
    expect(text).not.toContain("Internal Server Error");
    expect(text).not.toContain("ECONNREFUSED");
  });
});
