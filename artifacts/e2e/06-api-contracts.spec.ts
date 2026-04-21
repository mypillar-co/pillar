import { test, expect } from "@playwright/test";
import { API, CP, TEST_ORG_SLUG } from "./helpers";

test.describe("API Contracts", () => {
  test("GET /api/healthz shape", async ({ request }) => {
    const r = await request.get(`${API}/api/healthz`);
    const body = await r.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("ts");
  });

  test("CP GET /api/org-config returns config or empty", async ({ request }) => {
    const r = await request.get(`${CP}/api/org-config`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toBeTruthy();
  });

  test("CP GET /api/events returns array", async ({ request }) => {
    const r = await request.get(`${CP}/api/events`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("CP GET /api/members/directory requires auth", async ({ request }) => {
    const r = await request.get(`${CP}/api/members/directory`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(r.status()).toBe(401);
  });

  test("CP GET /api/members/announcements requires auth", async ({ request }) => {
    const r = await request.get(`${CP}/api/members/announcements`, { headers: { "x-org-id": TEST_ORG_SLUG } });
    expect(r.status()).toBe(401);
  });

  test("Invalid token returns 404 not 500", async ({ request }) => {
    const r = await request.post(`${CP}/api/members/register`, {
      data: { token: "completely-invalid-token", password: "TestPass123!" },
      headers: { "x-org-id": TEST_ORG_SLUG },
    });
    expect(r.status()).toBe(404);
    expect(r.status()).not.toBe(500);
  });

  test("Login with wrong password returns 401 not 500", async ({ request }) => {
    const r = await request.post(`${CP}/api/members/login`, {
      data: { email: "nobody@nowhere.com", password: "wrongpassword" },
      headers: { "x-org-id": TEST_ORG_SLUG },
    });
    expect(r.status()).toBe(401);
    expect(r.status()).not.toBe(500);
  });

  test("Forgot password always returns 200", async ({ request }) => {
    const r = await request.post(`${CP}/api/members/forgot-password`, {
      data: { email: "nobody@nowhere.com" },
      headers: { "x-org-id": TEST_ORG_SLUG },
    });
    expect(r.status()).toBe(200);
  });
});
