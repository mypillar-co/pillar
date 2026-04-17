import { test, expect } from "@playwright/test";

test.describe("API health", () => {
  test("api healthz returns ok", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
