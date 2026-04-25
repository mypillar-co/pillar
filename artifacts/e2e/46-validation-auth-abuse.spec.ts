import { test, expect } from "@playwright/test";
import { API, STEWARD } from "./helpers";

test.describe("Validation Victor — Auth Abuse", () => {
  test("Bad login attempts return controlled errors", async ({ request }) => {
    const res = await request.post(`${API}/api/auth/login`, {
      data: {
        email: "victor.invalid@example.com",
        password: "wrong-password",
      },
    });

    expect([400, 401, 403, 404]).toContain(res.status());

    const text = await res.text();
    expect(text).not.toContain("Internal Server Error");
    expect(text).not.toContain("stack");
  });

  test("Protected dashboard API rejects unauthenticated access cleanly", async ({ request }) => {
    const res = await request.get(`${STEWARD}/api/auth/user`);

    expect([200, 401, 403]).toContain(res.status());

    const text = await res.text();
    expect(text).not.toContain("Internal Server Error");
    expect(text).not.toContain("ECONNREFUSED");
  });
});
