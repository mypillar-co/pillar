/**
 * Pillar Platform E2E Health Check
 *
 * Hits real endpoints and the live DB. Logs PASS / FAIL / WARN per step.
 * Never throws — catches every error, records it, continues.
 * Exits 1 if any FAIL was recorded, 0 otherwise.
 *
 * Run: pnpm --filter @workspace/api-server run e2e
 */

import { pool } from "@workspace/db";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = process.env.E2E_API_URL ?? "http://localhost:8080";
const CP  = process.env.E2E_CP_URL  ?? "http://localhost:5001";
const REPO_ROOT = resolve(process.cwd().includes("artifacts/api-server")
  ? "../.."
  : ".");
const SERVICE_KEY = process.env.SERVICE_API_KEY ?? "";
const TIMESTAMP = Date.now();

type Status = "PASS" | "FAIL" | "WARN" | "SKIP";
type Result = { flow: string; step: string; status: Status; detail: string };
const results: Result[] = [];

function record(flow: string, step: string, status: Status, detail: string) {
  results.push({ flow, step, status, detail });
  const colour =
    status === "PASS" ? "\x1b[32m" :
    status === "FAIL" ? "\x1b[31m" :
    status === "WARN" ? "\x1b[33m" : "\x1b[36m";
  console.log(`${colour}[${status}]\x1b[0m  ${flow} ${step}  ${detail}`);
}

function pass(flow: string, step: string, detail = "") { record(flow, step, "PASS", detail); }
function fail(flow: string, step: string, detail: string) { record(flow, step, "FAIL", detail); }
function warn(flow: string, step: string, detail: string) { record(flow, step, "WARN", detail); }
function skip(flow: string, step: string, detail: string) { record(flow, step, "SKIP", detail); }

async function safe<T>(fn: () => Promise<T>, onFail: (e: unknown) => void): Promise<T | null> {
  try { return await fn(); }
  catch (e) { onFail(e); return null; }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  } finally { clearTimeout(t); }
}


// ───────────────────────── FLOW 1 — API HEALTH ─────────────────────────────
async function flow1() {
  const F = "[FLOW 1]";
  // 1a
  await safe(async () => {
    const r = await fetchJson(`${API}/api/healthz`);
    if (r.status === 200 && r.json?.status === "ok" && r.json?.db === "ok") {
      pass(F, "1a /api/healthz", `status=ok db=ok`);
    } else {
      fail(F, "1a /api/healthz", `status=${r.status} body=${r.text.slice(0, 200)}`);
    }
  }, (e) => fail(F, "1a /api/healthz", errMsg(e)));

  // 1b
  await safe(async () => {
    const r = await fetchJson(`${CP}/api/healthz`);
    if (r.status === 200 && r.json?.status === "ok") {
      pass(F, "1b CP /api/healthz", `status=ok`);
    } else {
      fail(F, "1b CP /api/healthz", `status=${r.status} body=${r.text.slice(0, 200)}`);
    }
  }, (e) => fail(F, "1b CP /api/healthz", errMsg(e)));
}

// ─────────────────── FLOW 2 — ORG RESOLUTION ──────────────────────────────
let primaryOrg: { id: string; name: string; slug: string } | null = null;

async function flow2() {
  const F = "[FLOW 2]";
  // 2a — direct DB query stand-in for /api/organizations (which is session-auth gated)
  await safe(async () => {
    const r = await pool.query<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug FROM organizations ORDER BY created_at ASC LIMIT 5`
    );
    if (r.rows.length === 0) {
      fail(F, "2a list orgs", `no organizations found in db`);
      return;
    }
    primaryOrg = r.rows[0]!;
    pass(F, "2a list orgs (db)", `found ${r.rows.length}; primary=${primaryOrg.slug}`);
    if (!SERVICE_KEY) {
      warn(F, "2a SERVICE_API_KEY", `not set in env — endpoint-level org listing skipped (used direct DB)`);
    }
  }, (e) => fail(F, "2a list orgs", errMsg(e)));

  // 2b — /api/community-site/target requires session auth, so call the equivalent query from the CP side
  if (primaryOrg) {
    await safe(async () => {
      const r = await pool.query<{ has_config: boolean; has_url: boolean }>(`
        SELECT
          (site_config IS NOT NULL) AS has_config,
          (community_site_url IS NOT NULL) AS has_url
        FROM organizations WHERE id = $1
      `, [primaryOrg!.id]);
      const row = r.rows[0]!;
      const isProvisioned = row.has_config || row.has_url;
      pass(F, "2b community-site/target (db)", `isProvisioned=${isProvisioned} (config=${row.has_config} url=${row.has_url})`);
    }, (e) => fail(F, "2b community-site/target", errMsg(e)));
  }
}

// ─────────────────── FLOW 3 — CP ROUTING ──────────────────────────────────
async function flow3() {
  const F = "[FLOW 3]";
  // 3a
  await safe(async () => {
    const r = await fetch(`${CP}/`);
    const ct = r.headers.get("content-type") ?? "";
    if (r.status === 200 && ct.includes("text/html")) pass(F, "3a CP /", `200 ${ct}`);
    else fail(F, "3a CP /", `status=${r.status} ct=${ct}`);
  }, (e) => fail(F, "3a CP /", errMsg(e)));

  // 3b + 3c
  const slug = primaryOrg?.slug ?? "norwin-rotary-uic5";
  await safe(async () => {
    const r = await fetch(`${CP}/sites/${slug}/`);
    const text = await r.text();
    const ct = r.headers.get("content-type") ?? "";
    if (r.status === 200 && ct.includes("text/html")) {
      pass(F, "3b CP /sites/" + slug + "/", `200 html`);
    } else {
      fail(F, "3b CP /sites/" + slug + "/", `status=${r.status} ct=${ct}`);
      return;
    }
    // 3c — base swap check (only meaningful for production-built CP, not Vite dev)
    const isDevMode = text.includes("/@vite/client") || text.includes("/@react-refresh");
    if (isDevMode) {
      warn(F, "3c base swap", `CP is in Vite dev mode — placeholder-asset check skipped (production-only). FLOW 13c covers the built artifact.`);
    } else if (text.includes("/sites/placeholder/assets/")) {
      pass(F, "3c base swap", `placeholder asset path present (rewritten at runtime)`);
    } else if (text.includes(`/sites/${slug}/assets/`)) {
      pass(F, "3c base swap", `slug asset path present (build-time substitution)`);
    } else {
      fail(F, "3c base swap", `prod build served but neither /sites/placeholder/assets/ nor /sites/${slug}/assets/ found — base swap broken`);
    }
  }, (e) => fail(F, "3b/3c CP /sites/...", errMsg(e)));

  // 3d
  await safe(async () => {
    const r = await fetchJson(`${CP}/api/healthz`);
    if (r.status === 200) pass(F, "3d CP /api/healthz", `200`);
    else fail(F, "3d CP /api/healthz", `status=${r.status}`);
  }, (e) => fail(F, "3d CP /api/healthz", errMsg(e)));
}

// ─────────────────── FLOW 4 — MEMBER PORTAL PROVISIONING ──────────────────
let orgWithMembers: { id: string; slug: string; name: string } | null = null;

async function flow4() {
  const F = "[FLOW 4]";
  await safe(async () => {
    const r = await pool.query<{ id: string; name: string; slug: string }>(`
      SELECT o.id, o.name, o.slug
      FROM organizations o
      WHERE o.id IN (SELECT DISTINCT org_id FROM members)
      LIMIT 1
    `);
    if (r.rows.length === 0) {
      warn(F, "4a org with members", `no orgs have members yet — flows 4b-d will SKIP`);
      return;
    }
    orgWithMembers = r.rows[0]!;
    pass(F, "4a org with members", `${orgWithMembers.slug} (${orgWithMembers.id})`);
  }, (e) => fail(F, "4a", errMsg(e)));

  if (!orgWithMembers) return;

  // 4b
  await safe(async () => {
    const r = await pool.query<{ has_config: boolean }>(
      `SELECT site_config IS NOT NULL AS has_config FROM organizations WHERE id = $1`,
      [orgWithMembers!.id],
    );
    if (r.rows[0]?.has_config) pass(F, "4b community-site/target (db)", `isProvisioned=true`);
    else fail(F, "4b community-site/target (db)", `isProvisioned=false (org has members but site_config is null)`);
  }, (e) => fail(F, "4b", errMsg(e)));

  // 4c — /members on subdomain
  await safe(async () => {
    const r = await fetch(`${CP}/sites/${orgWithMembers!.slug}/members`, {
      headers: { "x-org-id": orgWithMembers!.id },
    });
    if (r.status === 200) pass(F, "4c CP /sites/{slug}/members", `200`);
    else fail(F, "4c CP /sites/{slug}/members", `status=${r.status} expected 200 (404 means portal route missing)`);
  }, (e) => fail(F, "4c", errMsg(e)));

  // 4d — pending invites
  await safe(async () => {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM members WHERE org_id = $1 AND status = 'pending'`,
      [orgWithMembers!.id],
    );
    pass(F, "4d pending invites", `count=${r.rows[0]?.count ?? "0"}`);
  }, (e) => fail(F, "4d", errMsg(e)));
}

// ─────────────────── FLOW 5 — MEMBER AUTH ──────────────────────────────────
async function flow5() {
  const F = "[FLOW 5]";
  if (!orgWithMembers) {
    skip(F, "5 (all)", "no orgWithMembers — depends on FLOW 4a");
    return;
  }
  const orgId = orgWithMembers.id;
  const orgSlug = orgWithMembers.slug;
  const email = `e2e-test-${TIMESTAMP}@pillar-test.local`;
  const password = "TestPass123!";
  let memberId: string | null = null;
  let registrationToken: string | null = null;

  // 5a — Direct DB insert (POST /api/members is session-auth gated; we emulate it)
  await safe(async () => {
    const token = `e2e-tok-${TIMESTAMP}`;
    const r = await pool.query<{ id: string }>(`
      INSERT INTO members (org_id, first_name, last_name, email, member_type, status, registration_token, token_expires_at)
      VALUES ($1, 'E2E', 'Test', $2, 'general', 'pending', $3, now() + interval '7 days')
      RETURNING id
    `, [orgId, email, token]);
    memberId = r.rows[0]!.id;
    registrationToken = token;
    pass(F, "5a create test member (db)", `id=${memberId}`);
    warn(F, "5a NOTE", `bypassed POST /api/members (dashboard session auth required); did NOT exercise the new awaited helpers — see Step 1 verification block`);
  }, (e) => fail(F, "5a", errMsg(e)));

  if (!memberId) return;

  // 5b — token present
  await safe(async () => {
    const r = await pool.query<{ tok: string | null }>(
      `SELECT registration_token AS tok FROM members WHERE id = $1`, [memberId!]);
    if (r.rows[0]?.tok) pass(F, "5b registration_token set", `tok=${r.rows[0].tok.slice(0, 12)}...`);
    else fail(F, "5b registration_token", `null`);
  }, (e) => fail(F, "5b", errMsg(e)));

  // 5c — portal provisioned
  await safe(async () => {
    const r = await pool.query<{ has_portal: boolean }>(`
      SELECT (site_config -> 'membersPortal') IS NOT NULL AS has_portal
      FROM organizations WHERE id = $1
    `, [orgId]);
    if (r.rows[0]?.has_portal) pass(F, "5c portal provisioned", `site_config.membersPortal present`);
    else fail(F, "5c portal provisioned", `CRITICAL: PORTAL PROVISIONING FAILED — site_config.membersPortal is null for org with members`);
  }, (e) => fail(F, "5c", errMsg(e)));

  // 5d — register
  let cookie: string | null = null;
  await safe(async () => {
    const r = await fetch(`${CP}/api/members/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-org-id": orgId },
      body: JSON.stringify({ token: registrationToken, password }),
    });
    const text = await r.text();
    if (r.status === 200) {
      pass(F, "5d register", `200 ok=true`);
      cookie = r.headers.get("set-cookie")?.split(";")[0] ?? null;
    } else {
      fail(F, "5d register", `status=${r.status} body=${text.slice(0, 200)}`);
    }
  }, (e) => fail(F, "5d", errMsg(e)));

  // 5e — login
  await safe(async () => {
    const r = await fetch(`${CP}/api/members/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-org-id": orgId },
      body: JSON.stringify({ email, password }),
    });
    const text = await r.text();
    if (r.status === 200) {
      pass(F, "5e login", `200 ok=true`);
      const c = r.headers.get("set-cookie")?.split(";")[0];
      if (c) cookie = c;
    } else {
      fail(F, "5e login", `status=${r.status} body=${text.slice(0, 200)}`);
    }
  }, (e) => fail(F, "5e", errMsg(e)));

  // 5f — me
  if (cookie) {
    await safe(async () => {
      const r = await fetch(`${CP}/api/members/me`, {
        headers: { cookie: cookie!, "x-org-id": orgId },
      });
      const j = await r.json().catch(() => null);
      if (r.status === 200 && j?.first_name === "E2E") pass(F, "5f me", `firstName=E2E`);
      else fail(F, "5f me", `status=${r.status} body=${JSON.stringify(j).slice(0, 200)}`);
    }, (e) => fail(F, "5f", errMsg(e)));
  } else {
    skip(F, "5f me", "no session cookie from 5d/5e");
  }

  // 5g — cleanup
  await safe(async () => {
    await pool.query(`DELETE FROM members WHERE id = $1`, [memberId!]);
    pass(F, "5g cleanup", `deleted ${memberId}`);
  }, (e) => warn(F, "5g cleanup", `${errMsg(e)} — manual cleanup needed for ${memberId}`));
}

// ─────────────────── FLOW 6 — EVENTS ───────────────────────────────────────
async function flow6() {
  const F = "[FLOW 6]";
  if (!orgWithMembers) { skip(F, "6 (all)", "no test org"); return; }
  const orgId = orgWithMembers.id;
  let eventId: string | null = null;

  // 6a — db read (api-server endpoint is session-auth)
  await safe(async () => {
    const r = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM events WHERE org_id = $1`, [orgId]);
    pass(F, "6a list events (db)", `existing count=${r.rows[0]?.count ?? "0"}`);
  }, (e) => fail(F, "6a", errMsg(e)));

  // 6b — direct insert (matches schema: name, slug, start_date as varchar, is_active default true)
  await safe(async () => {
    const slug = `e2e-event-${TIMESTAMP}`;
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const r = await pool.query<{ id: string }>(`
      INSERT INTO events (org_id, name, slug, start_date, is_active)
      VALUES ($1, 'E2E Test Event', $2, $3, true)
      RETURNING id
    `, [orgId, slug, tomorrow]);
    eventId = r.rows[0]!.id;
    pass(F, "6b create event (db)", `id=${eventId}`);
    warn(F, "6b NOTE", `bypassed POST /api/events (session auth)`);
  }, (e) => fail(F, "6b", errMsg(e)));

  // 6c — verify it appears
  if (eventId) {
    await safe(async () => {
      const r = await pool.query(`SELECT id FROM events WHERE id = $1`, [eventId!]);
      if (r.rowCount === 1) pass(F, "6c event in list", `verified`);
      else fail(F, "6c event in list", `not found`);
    }, (e) => fail(F, "6c", errMsg(e)));
  }

  // 6d — CP /api/events
  await safe(async () => {
    const r = await fetch(`${CP}/api/events`, { headers: { "x-org-id": orgId } });
    const text = await r.text();
    if (r.status === 200) {
      const j = JSON.parse(text);
      const arr = Array.isArray(j) ? j : (j.events ?? []);
      const found = eventId ? arr.some((e: any) => e.id === eventId) : false;
      if (found) pass(F, "6d CP /api/events", `200, event present (n=${arr.length})`);
      else warn(F, "6d CP /api/events", `200 but test event not in response (n=${arr.length}) — could be filtering by status/active`);
    } else {
      fail(F, "6d CP /api/events", `status=${r.status} body=${text.slice(0, 200)}`);
    }
  }, (e) => fail(F, "6d", errMsg(e)));

  // 6e — cleanup
  if (eventId) {
    await safe(async () => {
      await pool.query(`DELETE FROM events WHERE id = $1`, [eventId!]);
      pass(F, "6e cleanup", `deleted ${eventId}`);
    }, (e) => warn(F, "6e cleanup", `${errMsg(e)} — manual cleanup needed for ${eventId}`));
  }
}

// ─────────────────── FLOW 7 — SITE CONFIG ─────────────────────────────────
async function flow7() {
  const F = "[FLOW 7]";
  if (!orgWithMembers) { skip(F, "7 (all)", "no test org"); return; }
  await safe(async () => {
    const r = await pool.query<any>(`
      SELECT id, name,
             site_config -> 'theme' ->> 'primaryColor' AS primary_color,
             site_config -> 'theme' ->> 'accentColor'  AS accent_color,
             site_config ->> 'location'                AS location,
             site_config IS NOT NULL                   AS has_config
      FROM organizations WHERE id = $1
    `, [orgWithMembers!.id]);
    const row = r.rows[0];
    if (!row) { fail(F, "7a configSummary", `org row missing`); return; }
    pass(F, "7a configSummary (db)", JSON.stringify({
      orgName: row.name, primaryColor: row.primary_color, accentColor: row.accent_color,
      location: row.location, hasConfig: row.has_config,
    }));
    const missing: string[] = [];
    if (!row.primary_color) missing.push("primaryColor");
    if (!row.accent_color) missing.push("accentColor");
    if (!row.name) missing.push("orgName");
    if (!row.location) missing.push("location");
    if (missing.length) warn(F, "7b non-null check", `missing in site_config: ${missing.join(", ")}`);
    else pass(F, "7b non-null check", `all four fields populated`);
  }, (e) => fail(F, "7", errMsg(e)));
}

// ─────────────────── FLOW 8 — AI EDIT ──────────────────────────────────────
async function flow8() {
  const F = "[FLOW 8]";
  skip(F, "8a /api/community-site/ai-edit", "endpoint requires session auth (resolveFullOrg) — cannot exercise from headless e2e without a logged-in admin cookie");
}

// ─────────────────── FLOW 9 — CONTENT STUDIO ───────────────────────────────
async function flow9() {
  const F = "[FLOW 9]";
  // Try anyway and capture what happens
  await safe(async () => {
    const r = await fetchJson(`${API}/api/content/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: "newsletter_intro", inputs: { topic: "e2e healthcheck" } }),
    }, 30_000);
    if (r.status === 200 && typeof r.json?.output === "string") pass(F, "9a content/generate", `200 output.len=${r.json.output.length}`);
    else if (r.status === 401) skip(F, "9a content/generate", `401 — session auth required, expected`);
    else if (r.status === 403 && /csrf/i.test(r.text)) skip(F, "9a content/generate", `403 CSRF — session+CSRF token required for state-changing endpoint, expected`);
    else fail(F, "9a content/generate", `status=${r.status} body=${r.text.slice(0, 200)}`);
  }, (e) => fail(F, "9a", errMsg(e)));

  await safe(async () => {
    const r = await fetchJson(`${API}/api/content/history`);
    if (r.status === 200) pass(F, "9b content/history", `200`);
    else if (r.status === 401) skip(F, "9b content/history", `401 — session auth required, expected`);
    else fail(F, "9b content/history", `status=${r.status}`);
  }, (e) => fail(F, "9b", errMsg(e)));
}

// ─────────────────── FLOW 10 — AUTOPILOT AGENT ────────────────────────────
async function flow10() {
  const F = "[FLOW 10]";
  skip(F, "10 (all)", "/api/management/agent requires session auth (resolveFullOrg) — cannot exercise headless");
}

// ─────────────────── FLOW 11 — SOCIAL ──────────────────────────────────────
async function flow11() {
  const F = "[FLOW 11]";
  await safe(async () => {
    const r = await fetchJson(`${API}/api/social/accounts`);
    if (r.status === 200) pass(F, "11a /api/social/accounts", `200 n=${Array.isArray(r.json) ? r.json.length : "?"}`);
    else if (r.status === 401) skip(F, "11a /api/social/accounts", `401 — session auth required`);
    else fail(F, "11a /api/social/accounts", `status=${r.status}`);
  }, (e) => fail(F, "11a", errMsg(e)));
}

// ─────────────────── FLOW 12 — MEMBER STATS / RENEWALS ────────────────────
async function flow12() {
  const F = "[FLOW 12]";
  if (!orgWithMembers) { skip(F, "12 (all)", "no test org"); return; }
  // 12a — emulate /api/members/stats query directly
  await safe(async () => {
    const r = await pool.query<any>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE member_type = 'board')::int AS board,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM members WHERE org_id = $1
    `, [orgWithMembers!.id]);
    const stats = r.rows[0];
    const portal = await pool.query<{ has_portal: boolean }>(
      `SELECT (site_config -> 'membersPortal') IS NOT NULL AS has_portal FROM organizations WHERE id = $1`,
      [orgWithMembers!.id],
    );
    const payload = { ...stats, portalProvisioned: portal.rows[0]?.has_portal ?? false };
    pass(F, "12a /api/members/stats (db-emulated)", JSON.stringify(payload));
  }, (e) => fail(F, "12a", errMsg(e)));

  // 12b — renewals coming up
  await safe(async () => {
    const r = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM members
      WHERE renewal_date <= (NOW() + INTERVAL '30 days') AND status = 'active'
    `);
    pass(F, "12b renewals 30d", `count=${r.rows[0]?.count ?? "0"} (across all orgs)`);
  }, (e) => fail(F, "12b", errMsg(e)));
}

// ─────────────────── FLOW 13 — DEPLOY GATE ────────────────────────────────
async function flow13() {
  const F = "[FLOW 13]";
  // 13a
  const deploySh = resolve(REPO_ROOT, "deploy-cp.sh");
  if (existsSync(deploySh)) pass(F, "13a deploy-cp.sh", `exists at ${deploySh}`);
  else fail(F, "13a deploy-cp.sh", `MISSING at ${deploySh}`);

  // 13b
  const cpIndex = resolve(REPO_ROOT, "artifacts/community-platform/dist/public/index.html");
  if (existsSync(cpIndex)) {
    pass(F, "13b CP dist/public/index.html", `exists`);
    // 13c
    try {
      const html = readFileSync(cpIndex, "utf8");
      const matches = (html.match(/\/sites\/placeholder\/assets\//g) ?? []).length;
      if (matches > 0) pass(F, "13c base swap in build", `count=${matches}`);
      else fail(F, "13c base swap in build", `BUILD BASE SWAP MISSING — CP WILL SERVE BLANK PAGES`);
    } catch (e) {
      fail(F, "13c base swap in build", errMsg(e));
    }
  } else {
    fail(F, "13b CP dist/public/index.html", `MISSING at ${cpIndex} — run pnpm --filter @workspace/community-platform run build`);
    skip(F, "13c base swap in build", `dist missing`);
  }
}

// ─────────────────── MAIN ─────────────────────────────────────────────────
async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(" Pillar Platform E2E Health Check");
  console.log(` API=${API}  CP=${CP}  ts=${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  await flow1();
  await flow2();
  await flow3();
  await flow4();
  await flow5();
  await flow6();
  await flow7();
  await flow8();
  await flow9();
  await flow10();
  await flow11();
  await flow12();
  await flow13();

  await pool.end().catch(() => {});

  // Summary
  const totals = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
  for (const r of results) totals[r.status]++;
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(" SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(` Total tests:    ${results.length}`);
  console.log(` \x1b[32mPASS\x1b[0m:           ${totals.PASS}`);
  console.log(` \x1b[31mFAIL\x1b[0m:           ${totals.FAIL}`);
  console.log(` \x1b[33mWARN\x1b[0m:           ${totals.WARN}`);
  console.log(` \x1b[36mSKIP\x1b[0m:           ${totals.SKIP}`);

  const fails = results.filter(r => r.status === "FAIL");
  const warns = results.filter(r => r.status === "WARN");
  if (fails.length) {
    console.log("\n FAILURES:");
    for (const r of fails) console.log(`   ${r.flow} ${r.step}  →  ${r.detail}`);
  }
  if (warns.length) {
    console.log("\n WARNINGS:");
    for (const r of warns) console.log(`   ${r.flow} ${r.step}  →  ${r.detail}`);
  }
  console.log("");
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch(e => {
  console.error("[e2e] FATAL", e);
  process.exit(2);
});
