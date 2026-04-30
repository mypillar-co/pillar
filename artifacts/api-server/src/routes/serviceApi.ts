/**
 * Service API — machine-to-machine access for trusted Replit projects.
 *
 * Auth: Authorization: Bearer <SERVICE_API_KEY>
 *       or X-Service-Key: <SERVICE_API_KEY>
 *
 * All routes are under /api/service/...
 * No session cookies needed. Org is resolved by slug from the URL.
 */

import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sessionsTable, sitesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "../lib/logger";
import { createSession, SESSION_COOKIE } from "../lib/auth";
import { createOpenAIClient } from "../lib/openaiClient";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Workspace root — same anchor pattern used everywhere in the API server
const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// Directories the file-reading endpoint is allowed to serve.
// Paths are relative to WORKSPACE_ROOT.
const READABLE_ROOTS = [
  "artifacts/api-server/src",
  "artifacts/steward/src",
  "lib/site",
  "lib/db",
  "lib/api-zod",
];

function isReadablePath(relPath: string): boolean {
  // Reject any traversal attempts
  const normalized = path.normalize(relPath);
  if (normalized.includes("..")) return false;
  return READABLE_ROOTS.some(root => normalized.startsWith(root + "/") || normalized === root);
}

function walkDir(dir: string, base: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(base, full);
      if (e.isDirectory()) {
        results.push(...walkDir(full, base));
      } else {
        results.push(rel);
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return results;
}

const router = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────

function serviceAuth(req: Request, res: Response, next: () => void) {
  // Production hard-guard: never accept the dev fallback in prod.
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.SERVICE_API_KEY &&
    !process.env.PILLAR_SERVICE_KEY
  ) {
    res.status(503).json({ error: "Service API not configured in production" });
    return;
  }

  // Dev/test fallback so e2e is self-contained and not blocked on
  // environment-secret propagation. Only active outside production.
  const key =
    process.env.SERVICE_API_KEY ||
    process.env.PILLAR_SERVICE_KEY ||
    (process.env.NODE_ENV !== "production" ? "pillar-local-e2e-service-key" : undefined);

  if (!key) {
    res.status(503).json({
      error: "Service API not configured (missing SERVICE_API_KEY or PILLAR_SERVICE_KEY)",
    });
    return;
  }

  const authHeader = req.headers["authorization"];
  const serviceHeader = req.headers["x-service-key"] as string | undefined;
  let provided: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    provided = authHeader.slice(7);
  } else if (serviceHeader) {
    provided = serviceHeader;
  }

  if (!provided || provided !== key) {
    res.status(401).json({ error: "Invalid or missing service key" });
    return;
  }

  next();
}

router.use(serviceAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgBySlug(slug: string) {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug));
  return org ?? null;
}

function getOpenAIClient() {
  return createOpenAIClient();
}

// ─── GET /api/service/health ──────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "pillar-api", timestamp: new Date().toISOString() });
});

// ─── GET /api/service/session-token ───────────────────────────────────────────
//
// TEST-ONLY: mints a short-lived session cookie scoped to a test org for use
// by automated end-to-end healthchecks. Hits the same session store and
// authMiddleware that real user sessions use, so it exercises the full
// session-cookie / req.user / resolveFullOrg path without needing OAuth.
//
// Query params:
//   orgSlug   (required) — slug of the org whose owning user becomes req.user
//   ttlSec    (optional, default 300, max 3600) — session lifetime
//
// Returns:
//   {
//     sid: "<hex>",                 // raw session id (also useful as Bearer token)
//     cookie: "sid=<hex>; ...",     // ready to set as Cookie header
//     cookieName: "sid",
//     user: { id, email, ... },     // the user the session is bound to
//     orgId, orgSlug,
//     expiresAt: <unix-ms>,
//   }
//
// Hard-disabled when NODE_ENV === "production". Authenticated by SERVICE_API_KEY
// via the existing serviceAuth middleware, so callers must already be trusted.

router.get("/session-token", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "session-token endpoint is disabled in production" });
    return;
  }

  const orgSlug = typeof req.query.orgSlug === "string" ? req.query.orgSlug.trim() : "";
  if (!orgSlug) {
    res.status(400).json({ error: "orgSlug query parameter is required" });
    return;
  }

  const ttlSecRaw = Number(req.query.ttlSec ?? 300);
  const ttlSec = Number.isFinite(ttlSecRaw) ? Math.min(Math.max(Math.trunc(ttlSecRaw), 30), 3600) : 300;

  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    res.status(404).json({ error: `Organization not found: ${orgSlug}` });
    return;
  }
  if (!org.userId) {
    res.status(409).json({ error: `Organization ${orgSlug} has no owning user_id; cannot mint a session` });
    return;
  }

  // Look up the user that owns the org. If the row exists, we use its real
  // email/name so the session is indistinguishable from a real login. If the
  // user row is missing, we fall back to a synthetic user with just the id —
  // resolveFullOrg only needs req.user.id to find the org.
  let userRow: { id: string; email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null = null;
  try {
    const r = await db.execute(sql`
      SELECT id, email, first_name AS "firstName", last_name AS "lastName", profile_image_url AS "profileImageUrl"
      FROM users WHERE id = ${org.userId}
      LIMIT 1
    `);
    const row = (r.rows as Record<string, unknown>[])[0];
    if (row) {
      userRow = {
        id: String(row.id),
        email: (row.email as string | null) ?? null,
        firstName: (row.firstName as string | null) ?? null,
        lastName: (row.lastName as string | null) ?? null,
        profileImageUrl: (row.profileImageUrl as string | null) ?? null,
      };
    }
  } catch {
    // users table might not be queryable in this exact shape — fall through
    userRow = null;
  }

  const user = userRow ?? {
    id: org.userId,
    email: null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
  };

  // Mint the session. createSession writes the row with the standard 7-day
  // TTL, so we immediately UPDATE the expire column down to the requested
  // short ttlSec — without this the "test-only" claim would be false and a
  // leaked SID could log in for a week. authMiddleware → getSession() rejects
  // any row whose expire < now() and deletes it, so the short window is real.
  const sid = await createSession({ user });
  const expiresAtMs = Date.now() + ttlSec * 1000;
  await db
    .update(sessionsTable)
    .set({ expire: new Date(expiresAtMs) })
    .where(eq(sessionsTable.sid, sid));
  const expiresAt = expiresAtMs;

  // Build a Cookie header value the e2e script can replay verbatim.
  const cookieValue = `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax`;

  logger.info(
    { orgSlug, orgId: org.id, userId: user.id, ttlSec },
    "[service-api] minted test session token",
  );

  res.json({
    sid,
    cookie: cookieValue,
    cookieName: SESSION_COOKIE,
    user,
    orgId: org.id,
    orgSlug: org.slug,
    expiresAt,
    note: "TEST-ONLY. Disabled when NODE_ENV=production. Use as Cookie header or as Bearer token.",
  });
});

// ─── GET /api/service/files ───────────────────────────────────────────────────
// Two modes controlled by query params:
//
//   ?path=artifacts/api-server/src/routes/siteEngine.ts
//       → returns { path, content, size, lines } for that single file
//
//   ?dir=artifacts/api-server/src/routes
//       → returns { dir, files: string[] } listing every file under that dir
//
//   (no params) → returns { roots: string[] } showing what's readable
//
// All paths are relative to workspace root. Path traversal is rejected.

router.get("/files", (req: Request, res: Response) => {
  const filePath  = typeof req.query.path === "string" ? req.query.path.trim() : null;
  const dirPath   = typeof req.query.dir  === "string" ? req.query.dir.trim()  : null;

  // ── No params: return the readable root listing ──────────────────────────
  if (!filePath && !dirPath) {
    res.json({ roots: READABLE_ROOTS });
    return;
  }

  // ── Dir listing ───────────────────────────────────────────────────────────
  if (dirPath) {
    const normalized = path.normalize(dirPath);
    if (normalized.includes("..") || !READABLE_ROOTS.some(r => normalized.startsWith(r + "/") || normalized === r || r.startsWith(normalized + "/"))) {
      res.status(403).json({ error: "Path not in allowed roots", allowed: READABLE_ROOTS });
      return;
    }
    const abs = path.join(WORKSPACE_ROOT, normalized);
    if (!fs.existsSync(abs)) {
      res.status(404).json({ error: "Directory not found", path: normalized });
      return;
    }
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "Path is a file, not a directory. Use ?path= to read files." });
      return;
    }
    const files = walkDir(abs, WORKSPACE_ROOT);
    res.json({ dir: normalized, files });
    return;
  }

  // ── Single file read ──────────────────────────────────────────────────────
  if (!isReadablePath(filePath!)) {
    res.status(403).json({ error: "Path not in allowed roots", allowed: READABLE_ROOTS });
    return;
  }

  const abs = path.join(WORKSPACE_ROOT, filePath!);
  if (!fs.existsSync(abs)) {
    res.status(404).json({ error: "File not found", path: filePath });
    return;
  }
  if (fs.statSync(abs).isDirectory()) {
    res.status(400).json({ error: "Path is a directory. Use ?dir= to list directories." });
    return;
  }

  try {
    const content = fs.readFileSync(abs, "utf8");
    res.json({
      path: filePath,
      content,
      size: Buffer.byteLength(content, "utf8"),
      lines: content.split("\n").length,
    });
  } catch (err) {
    logger.error({ err }, "Service API file read error");
    res.status(500).json({ error: "Failed to read file" });
  }
});

// ─── GET /api/service/org/:orgSlug ───────────────────────────────────────────
// Returns org metadata + current site status

router.get("/org/:orgSlug", async (req: Request, res: Response) => {
  const org = await getOrgBySlug(req.params.orgSlug);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const [site] = await db
    .select({
      id: sitesTable.id,
      status: sitesTable.status,
      orgSlug: sitesTable.orgSlug,
      publishedAt: sitesTable.publishedAt,
      updatedAt: sitesTable.updatedAt,
      hasHtml: sql<boolean>`${sitesTable.generatedHtml} IS NOT NULL`,
    })
    .from(sitesTable)
    .where(eq(sitesTable.orgId, org.id));

  res.json({
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      tier: org.tier,
      aiMessagesUsed: org.aiMessagesUsed,
    },
    site: site ?? null,
    publicUrl: org.slug ? `https://${org.slug}.mypillar.co` : null,
  });
});

// ─── GET /api/service/org/:orgSlug/site ──────────────────────────────────────
// Returns the full generated HTML

router.get("/org/:orgSlug/site", async (req: Request, res: Response) => {
  const org = await getOrgBySlug(req.params.orgSlug);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const [site] = await db
    .select()
    .from(sitesTable)
    .where(eq(sitesTable.orgId, org.id));

  if (!site) { res.status(404).json({ error: "No site found for this org" }); return; }

  res.json({
    id: site.id,
    status: site.status,
    orgSlug: site.orgSlug,
    generatedHtml: site.generatedHtml,
    publishedAt: site.publishedAt,
    updatedAt: site.updatedAt,
  });
});

// ─── PUT /api/service/org/:orgSlug/site ──────────────────────────────────────
// Writes new HTML directly to the site (bypasses AI generation). Use for patches.

router.put("/org/:orgSlug/site", async (req: Request, res: Response) => {
  const org = await getOrgBySlug(req.params.orgSlug);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const { html, status } = req.body as { html?: string; status?: string };
  if (!html || typeof html !== "string") {
    res.status(400).json({ error: "html (string) is required in request body" });
    return;
  }

  const [existing] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.orgId, org.id));

  if (existing) {
    await db.update(sitesTable)
      .set({
        generatedHtml: html,
        status: (status ?? "draft") as "draft" | "published",
        updatedAt: new Date(),
      })
      .where(eq(sitesTable.orgId, org.id));
  } else {
    await db.insert(sitesTable).values({
      orgId: org.id,
      orgSlug: org.slug,
      generatedHtml: html,
      status: (status ?? "draft") as "draft" | "published",
    });
  }

  res.json({ ok: true, action: existing ? "updated" : "created" });
});

// ─── POST /api/service/org/:orgSlug/chat ─────────────────────────────────────
// Run one turn of the AI interview. Returns plain JSON (not SSE).
// Body: { message: string, history: {role, content}[], orgName?: string, orgType?: string }

router.post("/org/:orgSlug/chat", async (req: Request, res: Response) => {
  const org = await getOrgBySlug(req.params.orgSlug);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const { message, history = [], orgName, orgType } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const name = orgName ?? org.name;
  const type = orgType ?? org.type ?? "organization";
  const trimmedHistory = history.slice(-20);

  const systemPrompt = `You are a friendly, professional website consultant for Pillar — an AI platform that builds websites for civic organizations, nonprofits, clubs, and community groups.

Key rules:
- If the user provides a URL at ANY point: STOP the interview immediately. Say: "Got it — use the Import from existing site button to pull your content automatically. I'll only follow up if there's anything it couldn't find."
- Ask ONE question at a time. Be warm, conversational, and brief.
- If a user's answer already covers a future question, skip that question.
- Keep every response under 65 words.

You're helping ${name} (a ${type}) build their public website.

Interview sequence — ask in order, skip any already answered:

BLOCK 1 — Identity:
1. "Let's build ${name}'s website! In one sentence — what does ${name} do? Include how long you've been around if you know it."
2. "Do you have an existing website? If so, share the URL and I'll pull your content automatically. If not, just say 'no existing site' and we'll build from scratch."
3. "What's your short name or abbreviation? (e.g. 'IBPA', 'VFW Post 1', 'Lodge #601') — it appears in the logo badge and page titles."
4. "What are your top programs, services, or activities? Name them and give a sentence on each — these become the highlight cards on your site."

BLOCK 2 — Events & Registration:
5. "List every event you have: name, date, and whether it's annual or one-time. Include regular meetings too (e.g. 'Weekly Tuesday lunch')."
6. "Do any events sell tickets or charge admission? If so: price, capacity, and when ticket sales open and close."

BLOCK 3 — Stats & Community:
7. "A few quick numbers: roughly how many events per year? Approximate total attendees? And how many local businesses or members does your org support?"
8. "Do you have community partners — other organizations, businesses, or government offices you collaborate with?"
9. "Would you like a News & Updates section on your site? (yes or no)"

BLOCK 4 — Contact & Social:
10. "Where are you located? Include address, meeting venue, meeting schedule, email, phone, and social media accounts."

BLOCK 5 — Design:
11. "Last one — do you have a logo or brand colors? If not, I'll match your org type's standard colors automatically. Any websites whose look you like? (Optional)"

After ALL blocks are collected, say EXACTLY: "I have everything I need! Click Generate My Site to build your website."

After each answer, acknowledge in ONE sentence that shows you heard it, then ask the next question. NEVER make up events, programs, or descriptions the user didn't provide.`;

  try {
    const client = getOpenAIClient();
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...trimmedHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: message },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.chat.completions.create as any)({
      model: "gpt-5-mini",
      max_completion_tokens: 700,
      messages,
    });

    const reply = response.choices[0]?.message?.content ?? "";

    // Increment usage counter (fire and forget)
    db.update(organizationsTable)
      .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
      .where(eq(organizationsTable.id, org.id))
      .catch((err: unknown) => logger.error({ err }, "Failed to increment aiMessagesUsed"));

    res.json({ reply, orgId: org.id });
  } catch (err) {
    logger.error({ err }, "Service API chat error");
    res.status(500).json({ error: "AI service error" });
  }
});

// ─── POST /api/service/org/:orgSlug/generate ─────────────────────────────────
// Trigger full site generation from an interview history.
// Body: { history: {role, content}[], logoDataUrl?: string }
// Returns: { html: string }  (can be large — ~50–200 KB)

router.post("/org/:orgSlug/generate", async (req: Request, res: Response) => {
  const org = await getOrgBySlug(req.params.orgSlug);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const { history = [], logoDataUrl } = req.body as {
    history: { role: string; content: string }[];
    logoDataUrl?: string;
  };

  if (!history.length) {
    res.status(400).json({ error: "history array is required and must not be empty" });
    return;
  }

  const interviewContext = history
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const systemPrompt = `You are an expert web developer building a complete, production-quality single-page HTML website for a civic organization. Generate ONLY the full HTML document — no markdown, no explanation.

MANDATORY RULES:
1. Hero section MUST have a colored background (dark navy, royal blue, or org brand color) — NEVER white or light gray.
2. Include up to 3 featured event cards near the top of the page with icons and hover effects.
3. Use org-type-specific brand colors. Rotary clubs = royal blue #0c4da2 + gold #f7a81b. Never use generic gray for orgs with known brand colors.
4. Alternate section backgrounds (e.g. dark/light/dark) — never all white.
5. Dark footer with org contact info and social links.
6. NO placeholder text like "Lorem ipsum" or "[Organization Name]" — use only what the interview provided.
7. No duplicate content across sections.
8. All CSS inline in <style> tag. No external CDN dependencies.
9. Fully responsive — works on mobile and desktop.
10. Include a sticky header with the org name/logo and navigation anchors.

Here is the interview data collected from the organization:

${interviewContext}

${logoDataUrl ? `Organization logo (base64 data URL): ${logoDataUrl.slice(0, 100)}...` : "No logo provided — use a text-based logo badge with the org initials."}

Generate the complete HTML now:`;

  try {
    const client = getOpenAIClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.chat.completions.create as any)({
      model: "gpt-5-mini",
      max_completion_tokens: 10000,
      messages: [{ role: "user", content: systemPrompt }],
    });

    const html = response.choices[0]?.message?.content ?? "";
    if (!html.includes("<!DOCTYPE") && !html.includes("<html")) {
      res.status(500).json({ error: "AI returned invalid HTML. Please try again." });
      return;
    }

    // Persist to DB
    const [existing] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.orgId, org.id));
    if (existing) {
      await db.update(sitesTable)
        .set({ generatedHtml: html, status: "draft", orgSlug: org.slug, updatedAt: new Date() })
        .where(eq(sitesTable.orgId, org.id));
    } else {
      await db.insert(sitesTable).values({
        orgId: org.id,
        orgSlug: org.slug,
        generatedHtml: html,
        status: "draft",
      });
    }

    res.json({ html, saved: true });
  } catch (err) {
    logger.error({ err }, "Service API generate error");
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ─── POST /api/service/org/:orgSlug/publish ───────────────────────────────────
// Mark the current draft as published

router.post("/org/:orgSlug/publish", async (req: Request, res: Response) => {
  const org = await getOrgBySlug(req.params.orgSlug);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site) { res.status(404).json({ error: "No site to publish" }); return; }

  await db.update(sitesTable)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(sitesTable.orgId, org.id));

  res.json({ ok: true, publicUrl: org.slug ? `https://${org.slug}.mypillar.co` : null });
});

export default router;
