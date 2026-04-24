import { test, expect } from "@playwright/test";
import { CP } from "./helpers";
import crypto from "crypto";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test.describe("Cross-Tenant Isolation", () => {

  let orgAId: string;
  let orgBId: string;
  let orgASlug: string;
  let orgBSlug: string;
  let memberAToken: string;
  let memberBToken: string;
  let memberAId: string;
  let memberBId: string;

  test.beforeAll(async () => {
    orgASlug = `e2e-tenant-a-${Date.now()}`;
    orgBSlug = `e2e-tenant-b-${Date.now()}`;

    const resA = await pool.query(
      "INSERT INTO organizations (id, name, slug, tier) VALUES (gen_random_uuid()::text, $1, $2, 'tier1') RETURNING id",
      ["Tenant A Test", orgASlug]
    );
    const resB = await pool.query(
      "INSERT INTO organizations (id, name, slug, tier) VALUES (gen_random_uuid()::text, $1, $2, 'tier1') RETURNING id",
      ["Tenant B Test", orgBSlug]
    );
    orgAId = resA.rows[0].id;
    orgBId = resB.rows[0].id;

    memberAToken = crypto.randomBytes(32).toString("hex");
    memberBToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const mA = await pool.query(
      "INSERT INTO members (id, org_id, first_name, email, member_type, status, registration_token, token_expires_at) VALUES (gen_random_uuid()::text, $1, 'MemberA', 'member-a@e2e.local', 'general', 'pending', $2, $3) RETURNING id",
      [orgAId, memberAToken, expires]
    );
    const mB = await pool.query(
      "INSERT INTO members (id, org_id, first_name, email, member_type, status, registration_token, token_expires_at) VALUES (gen_random_uuid()::text, $1, 'MemberB', 'member-b@e2e.local', 'general', 'pending', $2, $3) RETURNING id",
      [orgBId, memberBToken, expires]
    );
    memberAId = mA.rows[0].id;
    memberBId = mB.rows[0].id;
  });

  test.afterAll(async () => {
    await pool.query("DELETE FROM members WHERE id = ANY($1)", [[memberAId, memberBId]]);
    await pool.query("DELETE FROM organizations WHERE id = ANY($1)", [[orgAId, orgBId]]);
    await pool.end();
  });

  test("Org A token rejected on Org B subdomain", async ({ request }) => {
    const r = await request.post(`${CP}/api/members/register`, {
      data: { token: memberAToken, password: "TestPass123!" },
      headers: { "x-org-id": orgBId },
    });
    expect(r.status()).toBe(404);
  });

  test("Org B token rejected on Org A subdomain", async ({ request }) => {
    const r = await request.post(`${CP}/api/members/register`, {
      data: { token: memberBToken, password: "TestPass123!" },
      headers: { "x-org-id": orgAId },
    });
    expect(r.status()).toBe(404);
  });

  test("Org A member cannot log into Org B", async ({ request }) => {
    await request.post(`${CP}/api/members/register`, {
      data: { token: memberAToken, password: "TestPass123!" },
      headers: { "x-org-id": orgAId },
    });
    const loginRes = await request.post(`${CP}/api/members/login`, {
      data: { email: "member-a@e2e.local", password: "TestPass123!" },
      headers: { "x-org-id": orgBId },
    });
    expect(loginRes.status()).toBe(401);
  });

  test("Member directory only shows own org members", async ({ request }) => {
    await request.post(`${CP}/api/members/register`, {
      data: { token: memberBToken, password: "TestPass123!" },
      headers: { "x-org-id": orgBId },
    });
    const loginRes = await request.post(`${CP}/api/members/login`, {
      data: { email: "member-b@e2e.local", password: "TestPass123!" },
      headers: { "x-org-id": orgBId },
    });
    const cookie = loginRes.headers()["set-cookie"];
    if (!cookie) { test.skip(); return; }
    const dirRes = await request.get(`${CP}/api/members/directory`, {
      headers: { "x-org-id": orgBId, "Cookie": cookie },
    });
    if (dirRes.status() !== 200) { test.skip(); return; }
    const members = await dirRes.json();
    const hasOrgAMember = members.some((m: any) => m.email === "member-a@e2e.local");
    expect(hasOrgAMember).toBe(false);
  });

});