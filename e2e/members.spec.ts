import { test, expect, type APIRequestContext } from "@playwright/test";

const SLUG = "norwin-rotary-uic5";

async function loginAndPrime(request: APIRequestContext) {
  await request.get("/api/auth/dev-login?email=pillartest@example.com");
  // Primer GET so the CSRF cookie gets set (POSTs need it)
  await request.get(`/api/members?slug=${SLUG}`);
  const cookies = await request.storageState();
  const csrf = cookies.cookies.find(c => c.name === "__csrf")?.value;
  return csrf!;
}

test.describe("Members API", () => {
  test("CRUD lifecycle works", async ({ request }) => {
    const csrf = await loginAndPrime(request);
    const headers = { "x-csrf-token": csrf };

    // Create
    const created = await request.post(`/api/members?slug=${SLUG}`, {
      headers,
      data: {
        firstName: "E2E",
        lastName: "Test",
        email: "e2e@example.com",
        memberType: "general",
      },
    });
    expect(created.status()).toBe(201);
    const member = await created.json();
    expect(member.firstName).toBe("E2E");
    const id = member.id as string;

    try {
      // List with search
      const listed = await request.get(`/api/members?slug=${SLUG}&search=E2E`);
      const rows = await listed.json();
      expect(rows.find((r: { id: string }) => r.id === id)).toBeTruthy();

      // Update
      const upd = await request.put(`/api/members/${id}?slug=${SLUG}`, {
        headers,
        data: { firstName: "E2E", status: "pending" },
      });
      expect(upd.status()).toBe(200);
      expect((await upd.json()).status).toBe("pending");
    } finally {
      // Cleanup
      const del = await request.delete(`/api/members/${id}?slug=${SLUG}`, { headers });
      expect(del.status()).toBe(204);
    }
  });

  test("validation rejects bad input", async ({ request }) => {
    const csrf = await loginAndPrime(request);
    const headers = { "x-csrf-token": csrf };

    const badEmail = await request.post(`/api/members?slug=${SLUG}`, {
      headers, data: { firstName: "X", email: "not-an-email" },
    });
    expect(badEmail.status()).toBe(400);
    expect((await badEmail.json()).error).toMatch(/email/i);

    const blank = await request.post(`/api/members?slug=${SLUG}`, {
      headers, data: { firstName: "   " },
    });
    expect(blank.status()).toBe(400);
    expect((await blank.json()).error).toMatch(/firstName/i);

    const badType = await request.post(`/api/members?slug=${SLUG}`, {
      headers, data: { firstName: "X", memberType: "vip" },
    });
    expect(badType.status()).toBe(400);
  });

  test("CSRF token is required for mutations", async ({ request }) => {
    await request.get("/api/auth/dev-login?email=pillartest@example.com");
    await request.get(`/api/members?slug=${SLUG}`); // primer
    // Send POST without x-csrf-token header
    const res = await request.post(`/api/members?slug=${SLUG}`, {
      data: { firstName: "Hacker" },
    });
    expect(res.status()).toBe(403);
  });
});
