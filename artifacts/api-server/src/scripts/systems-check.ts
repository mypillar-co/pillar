import { Pool } from "pg";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

type Status = "GO" | "WARN" | "NO-GO";
interface Item { category: string; name: string; status: Status; detail: string; }

const items: Item[] = [];
function add(category: string, name: string, status: Status, detail: string) {
  items.push({ category, name, status, detail });
}

const API = process.env.API_URL ?? "http://localhost:8080";
const CP = process.env.CP_URL ?? "http://localhost:5001";
const TEST_SLUG = "norwin-rotary-uic5";
const REPO_ROOT = path.resolve(process.cwd(), "../..");
const API_DIR = path.resolve(process.cwd());

interface HttpRes { status: number; body: string; ok: boolean; error?: string; }

function httpReq(method: string, url: string, opts: { headers?: Record<string,string>; body?: string; timeoutMs?: number } = {}): Promise<HttpRes> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.request({
        hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
        method, headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
        }));
      });
      req.on("error", (err) => resolve({ status: 0, body: "", ok: false, error: err.message }));
      req.setTimeout(opts.timeoutMs ?? 5000, () => { req.destroy(new Error("timeout")); });
      if (opts.body) req.write(opts.body);
      req.end();
    } catch (err) {
      resolve({ status: 0, body: "", ok: false, error: (err as Error).message });
    }
  });
}

function envCheck(category: string, label: string, varName: string, required = true) {
  const present = !!process.env[varName] && process.env[varName]!.length > 0;
  if (present) add(category, label, "GO", `${varName} is set`);
  else add(category, label, required ? "NO-GO" : "WARN", `${varName} is not set`);
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  try { await pool.query(`SELECT 1 FROM ${table} LIMIT 1`); return true; } catch { return false; }
}
async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 LIMIT 1`,
      [table, column],
    );
    return r.rowCount! > 0;
  } catch { return false; }
}

async function main() {
  const startedAt = new Date().toISOString();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // ── INFRASTRUCTURE ──
  {
    const r = await httpReq("GET", `${API}/api/healthz`);
    if (r.ok) add("INFRASTRUCTURE", "API server responding", "GO", `${API}/api/healthz returned ${r.status}`);
    else add("INFRASTRUCTURE", "API server responding", "NO-GO", `${API}/api/healthz returned ${r.status} ${r.error ?? ""}`);

    let dbStatus: string | undefined;
    try { dbStatus = (JSON.parse(r.body || "{}") as { db?: string }).db; } catch {}
    if (dbStatus === "ok") add("INFRASTRUCTURE", "Database connected", "GO", "healthz reports db ok");
    else add("INFRASTRUCTURE", "Database connected", "NO-GO", `healthz db field: ${dbStatus ?? "unknown"}`);
  }
  {
    const r = await httpReq("GET", `${CP}/api/healthz`);
    if (r.ok) add("INFRASTRUCTURE", "Community platform responding", "GO", `${CP}/api/healthz returned ${r.status}`);
    else add("INFRASTRUCTURE", "Community platform responding", "NO-GO", `${CP}/api/healthz returned ${r.status} ${r.error ?? ""}`);
  }
  {
    const cpDist = path.join(REPO_ROOT, "artifacts/community-platform/dist/public/index.html");
    if (fs.existsSync(cpDist)) {
      add("INFRASTRUCTURE", "Deploy gate artifact exists", "GO", cpDist);
      const html = fs.readFileSync(cpDist, "utf8");
      if (html.includes("/sites/placeholder/assets/")) {
        add("INFRASTRUCTURE", "Deploy gate base path correct", "GO", "index.html contains /sites/placeholder/assets/");
      } else {
        add("INFRASTRUCTURE", "Deploy gate base path correct", "NO-GO", "index.html missing /sites/placeholder/assets/ prefix");
      }
    } else {
      add("INFRASTRUCTURE", "Deploy gate artifact exists", "NO-GO", `not found: ${cpDist}`);
      add("INFRASTRUCTURE", "Deploy gate base path correct", "NO-GO", "skipped - no index.html");
    }
  }
  envCheck("INFRASTRUCTURE", "Sentry configured", "SENTRY_DSN", false);
  envCheck("INFRASTRUCTURE", "Resend configured", "RESEND_API_KEY", false);
  envCheck("INFRASTRUCTURE", "Stripe configured", "STRIPE_SECRET_KEY", true);
  envCheck("INFRASTRUCTURE", "Service key configured", "SERVICE_API_KEY", true);
  envCheck("INFRASTRUCTURE", "Pillar service key configured", "PILLAR_SERVICE_KEY", true);
  if (
    process.env.OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.AI_INTEGRATIONS_OPENAI_KEY
  ) {
    add("INFRASTRUCTURE", "OpenAI configured", "GO", "OpenAI API key present");
  } else {
    add("INFRASTRUCTURE", "OpenAI configured", "WARN", "OPENAI_API_KEY not set");
  }

  // ── ORGANIZATIONS ──
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM organizations");
    const n = r.rows[0].n as number;
    if (n > 0) add("ORGANIZATIONS", "At least one org exists", "GO", `${n} orgs in database`);
    else add("ORGANIZATIONS", "At least one org exists", "NO-GO", "organizations table is empty");
  } catch (err) {
    add("ORGANIZATIONS", "At least one org exists", "NO-GO", `query failed: ${(err as Error).message}`);
  }
  try {
    const hasCsu = await columnExists(pool, "organizations", "community_site_url");
    if (hasCsu) {
      const r = await pool.query("SELECT COUNT(*)::int AS n FROM organizations WHERE community_site_url IS NOT NULL");
      const n = r.rows[0].n as number;
      if (n > 0) add("ORGANIZATIONS", "Org has provisioned community site", "GO", `${n} orgs with community_site_url`);
      else add("ORGANIZATIONS", "Org has provisioned community site", "WARN", "no orgs have community_site_url set");
    } else {
      add("ORGANIZATIONS", "Org has provisioned community site", "WARN", "no community_site_url column");
    }
  } catch (err) {
    add("ORGANIZATIONS", "Org has provisioned community site", "WARN", (err as Error).message);
  }
  try {
    const r = await pool.query(
      "SELECT COUNT(*)::int AS n FROM organizations WHERE site_config->>'primaryColor' IS NOT NULL",
    );
    const n = r.rows[0].n as number;
    if (n > 0) add("ORGANIZATIONS", "Org has brand colors set", "GO", `${n} orgs with site_config.primaryColor`);
    else add("ORGANIZATIONS", "Org has brand colors set", "WARN", "no orgs have site_config.primaryColor set");
  } catch (err) {
    add("ORGANIZATIONS", "Org has brand colors set", "WARN", (err as Error).message);
  }
  try {
    const r = await pool.query("SELECT slug FROM organizations WHERE slug IS NOT NULL");
    const slugs = r.rows.map((row) => row.slug as string);
    const dirty = slugs.filter((s) => /-[a-z0-9]{4,}$/i.test(s) && !/-uic5$/.test(s));
    // norwin-rotary-uic5 is the known test slug; others ending in random suffixes would be the smell
    if (slugs.length === 0) {
      add("ORGANIZATIONS", "Slug generation clean", "WARN", "no slugs to inspect");
    } else if (dirty.length === 0) {
      add("ORGANIZATIONS", "Slug generation clean", "GO", `${slugs.length} slugs scanned, no random-suffix pollution`);
    } else {
      add("ORGANIZATIONS", "Slug generation clean", "WARN", `${dirty.length} slugs end in random-looking suffix: ${dirty.slice(0,3).join(", ")}`);
    }
  } catch (err) {
    add("ORGANIZATIONS", "Slug generation clean", "WARN", (err as Error).message);
  }

  // ── COMMUNITY PLATFORM ──
  {
    const r = await httpReq("GET", `${API}/sites/${TEST_SLUG}/`);
    if (r.status === 200) add("COMMUNITY PLATFORM", "Test org site loads", "GO", `/sites/${TEST_SLUG}/ returned 200`);
    else add("COMMUNITY PLATFORM", "Test org site loads", "NO-GO", `/sites/${TEST_SLUG}/ returned ${r.status} ${r.error ?? ""}`);
  }
  {
    const r = await httpReq("GET", `${CP}/api/org-config`, { headers: { "x-org-id": TEST_SLUG } });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.body); } catch {}
    const isEmpty = parsed["_empty"] === true;
    if (r.ok && !isEmpty && Object.keys(parsed).length > 1) {
      add("COMMUNITY PLATFORM", "Org config resolves", "GO", `org-config returned ${Object.keys(parsed).length} fields`);
    } else if (r.ok && isEmpty) {
      add("COMMUNITY PLATFORM", "Org config resolves", "NO-GO", `org-config returned _empty for ${TEST_SLUG}`);
    } else {
      add("COMMUNITY PLATFORM", "Org config resolves", "NO-GO", `org-config returned ${r.status} ${r.error ?? ""}`);
    }
    const hasContact = parsed && (("contactEmail" in parsed) || ("contact" in parsed) || ("contact_email" in parsed));
    if (r.ok && hasContact) add("COMMUNITY PLATFORM", "Contact endpoint works", "GO", "org-config exposes contact fields");
    else add("COMMUNITY PLATFORM", "Contact endpoint works", "WARN", "no contact field on org-config");
  }
  {
    const r = await httpReq("GET", `${CP}/api/events`, { headers: { "x-org-id": TEST_SLUG } });
    let arr: unknown = null;
    try { arr = JSON.parse(r.body); } catch {}
    if (r.ok && Array.isArray(arr)) add("COMMUNITY PLATFORM", "Events endpoint works", "GO", `returned array of ${arr.length}`);
    else add("COMMUNITY PLATFORM", "Events endpoint works", "NO-GO", `events returned ${r.status}`);
  }
  {
    const r = await httpReq("POST", `${CP}/api/members/register`, {
      headers: { "x-org-id": TEST_SLUG },
      body: JSON.stringify({ token: "definitely-not-a-real-token", password: "TestPass123!" }),
    });
    if (r.status === 404) add("COMMUNITY PLATFORM", "Public registration rejects bad token", "GO", "returned 404");
    else if (r.status === 500) add("COMMUNITY PLATFORM", "Public registration rejects bad token", "NO-GO", "returned 500");
    else add("COMMUNITY PLATFORM", "Public registration rejects bad token", "WARN", `returned ${r.status} (expected 404)`);
  }
  {
    const r = await httpReq("POST", `${CP}/api/members/login`, {
      headers: { "x-org-id": TEST_SLUG },
      body: JSON.stringify({ email: "nobody@nowhere.test", password: "wrong" }),
    });
    if (r.status === 401) add("COMMUNITY PLATFORM", "Login rejects wrong password", "GO", "returned 401");
    else if (r.status === 500) add("COMMUNITY PLATFORM", "Login rejects wrong password", "NO-GO", "returned 500");
    else add("COMMUNITY PLATFORM", "Login rejects wrong password", "WARN", `returned ${r.status}`);
  }
  {
    const r = await httpReq("POST", `${CP}/api/members/forgot-password`, {
      headers: { "x-org-id": TEST_SLUG },
      body: JSON.stringify({ email: "nobody@nowhere.test" }),
    });
    if (r.status === 200) add("COMMUNITY PLATFORM", "Forgot password returns 200", "GO", "returned 200");
    else add("COMMUNITY PLATFORM", "Forgot password returns 200", "NO-GO", `returned ${r.status}`);
  }

  // ── MEMBER PORTAL ──
  add("MEMBER PORTAL", "Members table exists", (await tableExists(pool, "members")) ? "GO" : "NO-GO", "SELECT 1 FROM members LIMIT 1");
  try {
    const r = await pool.query(
      "SELECT COUNT(*)::int AS n FROM organizations WHERE site_config->'membersPortal' IS NOT NULL",
    );
    const n = r.rows[0].n as number;
    add(
      "MEMBER PORTAL",
      "Org has portal provisioned",
      n > 0 ? "GO" : "WARN",
      n > 0 ? `${n} orgs with site_config.membersPortal` : "no orgs have site_config.membersPortal",
    );
  } catch (err) {
    add("MEMBER PORTAL", "Org has portal provisioned", "WARN", (err as Error).message);
  }
  {
    const r = await httpReq("GET", `${CP}/api/members-portal/config`, { headers: { "x-org-id": TEST_SLUG } });
    if (r.status === 200 || r.status === 401) add("MEMBER PORTAL", "Portal config endpoint works", "GO", `returned ${r.status}`);
    else add("MEMBER PORTAL", "Portal config endpoint works", "NO-GO", `returned ${r.status}`);
  }
  add("MEMBER PORTAL", "Invite flow column exists",       (await columnExists(pool, "members", "registration_token")) ? "GO" : "NO-GO", "members.registration_token");
  add("MEMBER PORTAL", "Password reset column exists",    (await columnExists(pool, "members", "reset_token"))         ? "GO" : "NO-GO", "members.reset_token");
  add("MEMBER PORTAL", "Renewal reminder column exists",  (await columnExists(pool, "members", "renewal_date"))        ? "GO" : "NO-GO", "members.renewal_date");

  // ── EVENTS AND TICKETS ──
  add("EVENTS AND TICKETS", "Events table exists",       (await tableExists(pool, "events"))       ? "GO" : "NO-GO", "");
  add("EVENTS AND TICKETS", "Ticket types table exists", (await tableExists(pool, "ticket_types")) ? "GO" : "NO-GO", "");
  add("EVENTS AND TICKETS", "Ticket sales table exists", (await tableExists(pool, "ticket_sales")) ? "GO" : "NO-GO", "");
  {
    const r = await httpReq("GET", `${CP}/api/events`, { headers: { "x-org-id": TEST_SLUG } });
    add("EVENTS AND TICKETS", "Events API returns array", r.ok ? "GO" : "NO-GO", `returned ${r.status}`);
  }
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM events");
    add("EVENTS AND TICKETS", "Total event count", "GO", `${r.rows[0].n} events across all orgs`);
  } catch {
    add("EVENTS AND TICKETS", "Total event count", "WARN", "could not count events");
  }

  // ── CONTENT AND AI ──
  {
    const aiBase = process.env.OPENAI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com";
    try {
      const u = new URL(aiBase);
      const req = await new Promise<{ status: number; error?: string }>((resolve) => {
        const useHttps = u.protocol === "https:";
        const lib = useHttps ? require("node:https") as typeof import("node:https") : http;
        const r = lib.request({
          hostname: u.hostname, port: u.port || (useHttps ? 443 : 80), path: u.pathname || "/", method: "HEAD",
        }, (resp) => resolve({ status: resp.statusCode ?? 0 }));
        r.on("error", (err) => resolve({ status: 0, error: err.message }));
        r.setTimeout(4000, () => { r.destroy(new Error("timeout")); });
        r.end();
      });
      if (req.status >= 200 && req.status < 600) add("CONTENT AND AI", "AI service reachable", "GO", `HEAD ${aiBase} returned ${req.status}`);
      else add("CONTENT AND AI", "AI service reachable", "WARN", req.error ?? `unexpected status ${req.status}`);
    } catch (err) {
      add("CONTENT AND AI", "AI service reachable", "WARN", (err as Error).message);
    }
  }
  {
    const r = await httpReq("GET", `${API}/api/content/tasks`);
    if (r.status === 200 || r.status === 401) add("CONTENT AND AI", "Content studio endpoint", "GO", `returned ${r.status}`);
    else add("CONTENT AND AI", "Content studio endpoint", "NO-GO", `returned ${r.status}`);
  }
  {
    const r = await httpReq("GET", `${API}/api/content/history`);
    if (r.status === 200 || r.status === 401) add("CONTENT AND AI", "Content history endpoint", "GO", `returned ${r.status}`);
    else add("CONTENT AND AI", "Content history endpoint", "NO-GO", `returned ${r.status}`);
  }
  {
    const r = await httpReq("POST", `${API}/api/community-site/ai-edit`, { body: "{}" });
    if (r.status === 400 || r.status === 401 || r.status === 403) add("CONTENT AND AI", "AI edit endpoint", "GO", `returned ${r.status} (route exists, auth-protected)`);
    else if (r.status === 404) add("CONTENT AND AI", "AI edit endpoint", "NO-GO", "returned 404");
    else add("CONTENT AND AI", "AI edit endpoint", "WARN", `returned ${r.status}`);
  }
  {
    const sectionRegistryPath = path.join(API_DIR, "src/lib/sectionRegistry.ts");
    if (fs.existsSync(sectionRegistryPath)) {
      const src = fs.readFileSync(sectionRegistryPath, "utf8");
      const startIdx = src.indexOf("SECTION_REGISTRY:");
      const body = startIdx >= 0 ? src.slice(startIdx) : src;
      const matches = body.match(/^\s{2}[a-z_][a-z0-9_]*:\s*\{/gim) ?? [];
      if (matches.length >= 6) add("CONTENT AND AI", "Section registry loaded", "GO", `${matches.length} section types defined`);
      else add("CONTENT AND AI", "Section registry loaded", "NO-GO", `only ${matches.length} section types found (expected ≥6)`);
    } else {
      add("CONTENT AND AI", "Section registry loaded", "NO-GO", "sectionRegistry.ts not found");
    }
  }

  // ── AUTOPILOT AGENT ──
  {
    const r = await httpReq("POST", `${API}/api/management/agent`, { body: "{}" });
    if (r.status === 400 || r.status === 401 || r.status === 403) add("AUTOPILOT AGENT", "Agent endpoint exists", "GO", `returned ${r.status} (route exists, auth-protected)`);
    else if (r.status === 404) add("AUTOPILOT AGENT", "Agent endpoint exists", "NO-GO", "returned 404");
    else add("AUTOPILOT AGENT", "Agent endpoint exists", "WARN", `returned ${r.status}`);
  }
  {
    const mgmtPath = path.join(API_DIR, "src/routes/management.ts");
    if (fs.existsSync(mgmtPath)) {
      const src = fs.readFileSync(mgmtPath, "utf8");
      const matches = src.match(/^\s+name:\s*["'][a-z_]+["'],/gm) ?? [];
      if (matches.length > 0) add("AUTOPILOT AGENT", "Agent tool count", "GO", `${matches.length} tools defined in management.ts`);
      else add("AUTOPILOT AGENT", "Agent tool count", "WARN", "no tool definitions found");
    } else {
      add("AUTOPILOT AGENT", "Agent tool count", "NO-GO", "management.ts not found");
    }
  }

  // ── SOCIAL AND BUFFER ──
  {
    const r = await httpReq("GET", `${API}/api/social/accounts`);
    if (r.status === 200 || r.status === 401) add("SOCIAL AND BUFFER", "Social accounts endpoint", "GO", `returned ${r.status}`);
    else if (r.status === 404) add("SOCIAL AND BUFFER", "Social accounts endpoint", "NO-GO", "returned 404");
    else add("SOCIAL AND BUFFER", "Social accounts endpoint", "WARN", `returned ${r.status}`);
  }
  envCheck("SOCIAL AND BUFFER", "Buffer client ID configured", "BUFFER_CLIENT_ID", true);

  // ── SPONSORS ──
  add("SPONSORS", "Sponsors table exists", (await tableExists(pool, "cs_sponsors")) ? "GO" : "NO-GO", "");
  {
    const r = await httpReq("GET", `${CP}/api/sponsors`, { headers: { "x-org-id": TEST_SLUG } });
    if (r.status === 200 || r.status === 401) add("SPONSORS", "Sponsors endpoint", "GO", `returned ${r.status}`);
    else if (r.status === 404) add("SPONSORS", "Sponsors endpoint", "NO-GO", "returned 404");
    else add("SPONSORS", "Sponsors endpoint", "WARN", `returned ${r.status}`);
  }

  // ── NEWSLETTERS ──
  {
    const csNl = await tableExists(pool, "cs_newsletter_subscribers");
    const nl = await tableExists(pool, "newsletter_subscribers");
    if (csNl || nl) add("NEWSLETTERS", "Newsletter subscribers table", "GO", csNl ? "cs_newsletter_subscribers" : "newsletter_subscribers");
    else add("NEWSLETTERS", "Newsletter subscribers table", "NO-GO", "no subscribers table found");
  }
  {
    const r = await httpReq("GET", `${API}/api/newsletter/subscribers`);
    if (r.status === 200 || r.status === 401) add("NEWSLETTERS", "Newsletter endpoint", "GO", `returned ${r.status}`);
    else if (r.status === 404) add("NEWSLETTERS", "Newsletter endpoint", "NO-GO", "returned 404");
    else add("NEWSLETTERS", "Newsletter endpoint", "WARN", `returned ${r.status}`);
  }

  // ── ANNOUNCEMENTS ──
  add("ANNOUNCEMENTS", "Announcements table exists", (await tableExists(pool, "cs_announcements")) ? "GO" : "NO-GO", "");
  {
    const mgmtPath = path.join(API_DIR, "src/routes/management.ts");
    if (fs.existsSync(mgmtPath)) {
      const src = fs.readFileSync(mgmtPath, "utf8");
      if (/announcement/i.test(src)) add("ANNOUNCEMENTS", "Announcements covered by agent tools", "GO", "management.ts mentions announcement");
      else add("ANNOUNCEMENTS", "Announcements covered by agent tools", "WARN", "no announcement tool found");
    } else {
      add("ANNOUNCEMENTS", "Announcements covered by agent tools", "WARN", "management.ts not found");
    }
  }

  // ── SCHEDULED TASKS ──
  {
    const sp = path.join(API_DIR, "src/scheduler.ts");
    if (fs.existsSync(sp)) {
      add("SCHEDULED TASKS", "Scheduler file exists", "GO", sp);
      const src = fs.readFileSync(sp, "utf8");
      if (src.includes("sendMemberRenewalReminders")) add("SCHEDULED TASKS", "Renewal reminder function defined", "GO", "sendMemberRenewalReminders found");
      else add("SCHEDULED TASKS", "Renewal reminder function defined", "NO-GO", "sendMemberRenewalReminders not found");
    } else {
      add("SCHEDULED TASKS", "Scheduler file exists", "NO-GO", "scheduler.ts missing");
      add("SCHEDULED TASKS", "Renewal reminder function defined", "NO-GO", "skipped");
    }
  }

  // ── STORAGE AND UPLOADS ──
  {
    const hasDir = !!process.env.PRIVATE_OBJECT_DIR;
    const hasBucket = !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (hasDir || hasBucket) add("STORAGE", "Object storage configured", "GO", `${hasDir ? "PRIVATE_OBJECT_DIR " : ""}${hasBucket ? "DEFAULT_OBJECT_STORAGE_BUCKET_ID" : ""}`.trim());
    else add("STORAGE", "Object storage configured", "NO-GO", "no object storage env vars");
  }
  {
    const r = await httpReq("POST", `${API}/api/community-site/logo-upload-url`, { body: "{}" });
    if (r.status === 200 || r.status === 401 || r.status === 403) add("STORAGE", "Logo upload endpoint", "GO", `returned ${r.status} (route exists, auth-protected)`);
    else if (r.status === 404) add("STORAGE", "Logo upload endpoint", "NO-GO", "returned 404");
    else add("STORAGE", "Logo upload endpoint", "WARN", `returned ${r.status}`);
  }

  // ── DEPLOY AND SAFETY ──
  {
    const dp = path.join(REPO_ROOT, "deploy-cp.sh");
    if (fs.existsSync(dp)) {
      add("DEPLOY AND SAFETY", "deploy-cp.sh exists", "GO", dp);
      try {
        const st = fs.statSync(dp);
        const exec = !!(st.mode & 0o111);
        add("DEPLOY AND SAFETY", "deploy-cp.sh is executable", exec ? "GO" : "NO-GO", `mode ${(st.mode & 0o777).toString(8)}`);
      } catch { add("DEPLOY AND SAFETY", "deploy-cp.sh is executable", "WARN", "stat failed"); }
    } else {
      add("DEPLOY AND SAFETY", "deploy-cp.sh exists", "NO-GO", "missing");
      add("DEPLOY AND SAFETY", "deploy-cp.sh is executable", "NO-GO", "skipped");
    }
  }
  {
    const vc = path.join(REPO_ROOT, "artifacts/community-platform/vite.config.ts");
    if (fs.existsSync(vc)) {
      const src = fs.readFileSync(vc, "utf8");
      if (src.includes('command === "build"') || src.includes("command === 'build'")) {
        add("DEPLOY AND SAFETY", "vite.config has build-time conditional base", "GO", "found command === \"build\"");
      } else {
        add("DEPLOY AND SAFETY", "vite.config has build-time conditional base", "NO-GO", "no command === \"build\" guard");
      }
      const hardcoded = /^\s*base:\s*["']\/["']\s*,?\s*$/m.test(src);
      if (hardcoded) add("DEPLOY AND SAFETY", "Base swap not hardcoded to /", "NO-GO", "found bare base: \"/\"");
      else add("DEPLOY AND SAFETY", "Base swap not hardcoded to /", "GO", "no bare base: \"/\" assignment");
    } else {
      add("DEPLOY AND SAFETY", "vite.config has build-time conditional base", "NO-GO", "vite.config.ts missing");
      add("DEPLOY AND SAFETY", "Base swap not hardcoded to /", "WARN", "skipped");
    }
  }

  // ── TEST SUITE ──
  {
    const e2e = path.join(API_DIR, "src/scripts/e2e-healthcheck.ts");
    add("TEST SUITE", "e2e healthcheck script exists", fs.existsSync(e2e) ? "GO" : "NO-GO", e2e);
    const pwc = path.join(REPO_ROOT, "artifacts/playwright.config.ts");
    add("TEST SUITE", "Playwright config exists", fs.existsSync(pwc) ? "GO" : "NO-GO", pwc);
    const e2eDir = path.join(REPO_ROOT, "artifacts/e2e");
    if (fs.existsSync(e2eDir)) {
      const specs = fs.readdirSync(e2eDir).filter((f) => f.endsWith(".spec.ts"));
      if (specs.length > 0) add("TEST SUITE", "Playwright spec files exist", "GO", `${specs.length} spec files in artifacts/e2e/`);
      else add("TEST SUITE", "Playwright spec files exist", "NO-GO", "no .spec.ts files");
    } else {
      add("TEST SUITE", "Playwright spec files exist", "NO-GO", "artifacts/e2e/ missing");
    }
  }

  await pool.end();

  // ── REPORT ──
  const categories = Array.from(new Set(items.map((i) => i.category)));
  const colorize = (s: Status): string =>
    process.stdout.isTTY
      ? (s === "GO" ? `\x1b[32m${s}\x1b[0m` : s === "WARN" ? `\x1b[33m${s}\x1b[0m` : `\x1b[31m${s}\x1b[0m`)
      : s;

  console.log("");
  for (const cat of categories) {
    console.log(`── ${cat} ─────────────────────────────`);
    for (const it of items.filter((i) => i.category === cat)) {
      console.log(`  [${colorize(it.status).padEnd(it.status === "GO" ? 8 : it.status === "WARN" ? 6 : 6)}] ${it.name} — ${it.detail}`);
    }
    console.log("");
  }

  const sumLine = (cat: string) => {
    const rows = items.filter((i) => i.category === cat);
    const go = rows.filter((r) => r.status === "GO").length;
    return { cat, go, total: rows.length };
  };
  const totals = categories.map(sumLine);
  const totalGo = items.filter((i) => i.status === "GO").length;
  const totalWarn = items.filter((i) => i.status === "WARN").length;
  const totalNoGo = items.filter((i) => i.status === "NO-GO").length;

  console.log("════════════════════════════════════════════");
  console.log("PILLAR SYSTEMS STATUS REPORT");
  console.log(startedAt);
  console.log("════════════════════════════════════════════");
  for (const t of totals) {
    console.log(`${t.cat.padEnd(22)} ${t.go}/${t.total} GO`);
  }
  console.log("────────────────────────────────────────────");
  console.log(`OVERALL: ${totalGo}/${items.length} GO  ${totalWarn} WARN  ${totalNoGo} NO-GO`);
  console.log("────────────────────────────────────────────");

  if (totalNoGo > 0) {
    console.log("NO-GO ITEMS:");
    for (const it of items.filter((i) => i.status === "NO-GO")) {
      console.log(`  • [${it.category}] ${it.name} — ${it.detail}`);
    }
  }
  if (totalWarn > 0) {
    console.log("WARN ITEMS:");
    for (const it of items.filter((i) => i.status === "WARN")) {
      console.log(`  • [${it.category}] ${it.name} — ${it.detail}`);
    }
  }
  console.log("════════════════════════════════════════════");

  process.exit(totalNoGo > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("systems-check failed:", err);
  process.exit(2);
});
