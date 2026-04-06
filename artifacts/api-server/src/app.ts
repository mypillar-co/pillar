import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { authMiddleware } from "./middlewares/authMiddleware";
import { csrfMiddleware } from "./lib/csrf";
import { sendErrorAlert } from "./lib/errorAlert";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { db, sitesTable, domainsTable, organizationsTable, eventsTable, ticketTypesTable, eventSponsorsTable, sponsorsTable } from "@workspace/db";
import { eq, or, and, asc, sql as drizzleSql } from "drizzle-orm";
import { buildEventPage, buildEventSuccessPage, buildEventNotFoundPage } from "./eventPage";
import {
  buildEventsListingPage,
  buildEventDetailPage,
  buildEventNotFoundPage as buildPublicEventNotFoundPage,
  buildDynamicHomepage,
  selectFeaturedEvents,
  type PublicEvent,
  type PublicTicketType,
  type PublicSponsor,
  type OrgInfo,
} from "./publicEventPages";
import {
  buildVendorApplyPage,
  buildSponsorSignupPage,
  buildRegisterPage,
} from "./publicFormPages";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Stripe webhook must be registered BEFORE express.json() parses the body
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err) {
      req.log.error({ err }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing failed" });
    }
  },
);

const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?$|\.replit\.dev$|\.replit\.app$|\.mypillar\.co$|^https:\/\/mypillar\.co$/;

app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGIN_RE.test(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS: origin not allowed"));
      }
    },
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Safety net: ensure req.body is always at least {} for mutating requests
// so routes never crash with "Cannot destructure property of undefined".
// This guards against missing Content-Type or an empty body payload.
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (["POST", "PUT", "PATCH"].includes(req.method) && req.body === undefined) {
    const ct = (req.headers["content-type"] ?? "").toLowerCase();
    if (!ct.startsWith("multipart/") && !ct.startsWith("application/octet-stream")) {
      req.body = {};
    }
  }
  next();
});

app.use(authMiddleware);
app.use(csrfMiddleware);

// ─── Rate limiting ────────────────────────────────────────────────────────────

const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please try again later" },
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts — please try again in an hour" },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many upload requests — please try again in an hour" },
});

// Strict limiter for sensitive auth mutations (login, logout, OAuth, password reset)
// GET endpoints like /api/auth/user and /api/auth/providers are intentionally excluded
// because they are polled frequently by the frontend.
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts — please try again in an hour" },
});

app.use("/api/public/registrations", registrationLimiter);
app.use("/api/public/registration-docs/upload-url", uploadLimiter);
app.use("/api/public/", publicApiLimiter);
// Only rate-limit auth mutations, not the polling /user and /providers GETs
app.get("/api/auth/logout", authLimiter);
app.post("/api/auth/login", authLimiter);
app.post("/api/auth/register", authLimiter);
app.post("/api/auth/forgot-password", authLimiter);
app.post("/api/auth/reset-password", authLimiter);
app.get("/api/auth/google", authLimiter);
app.get("/api/auth/google/callback", authLimiter);

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", router);

const POWERED_BY_FOOTER = `<div style="position:fixed;bottom:0;left:0;right:0;text-align:center;padding:5px 12px;background:rgba(10,14,26,0.93);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-top:1px solid rgba(255,255,255,0.07);font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:rgba(148,163,184,0.75);z-index:2147483647;letter-spacing:0.01em">Powered by&nbsp;<a href="https://mypillar.co" style="color:#f59e0b;text-decoration:none;font-weight:600" target="_blank" rel="noopener noreferrer">Pillar</a>&nbsp;— AI for civic organizations</div>`;

/**
 * Fetches active events for an org and returns the homepage HTML patched with
 * a dynamic "Upcoming Events" card-grid section (replacing the static one).
 */
async function patchHomepageWithFeaturedEvents(orgSlug: string, storedHtml: string): Promise<string> {
  try {
    const primary = storedHtml.match(/--primary:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#1e2d4f";
    const accent = storedHtml.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#c9a84c";

    // Fetch all active+published events for this org
    const [orgRow] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, orgSlug));
    if (!orgRow) return storedHtml;

    const eventRows = await db
      .select()
      .from(eventsTable)
      .where(and(
        eq(eventsTable.orgId, orgRow.id),
        eq(eventsTable.status, "published"),
        eq(eventsTable.isActive, true),
      ))
      .orderBy(asc(eventsTable.startDate));

    const allEvents: PublicEvent[] = eventRows.map(e => ({
      id: e.id,
      name: e.name,
      slug: e.slug ?? "",
      description: e.description ?? null,
      eventType: e.eventType ?? null,
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      location: e.location ?? null,
      isTicketed: e.isTicketed ?? null,
      ticketPrice: e.ticketPrice ? Number(e.ticketPrice) : null,
      ticketCapacity: e.ticketCapacity ?? null,
      hasRegistration: e.hasRegistration ?? null,
      hasSponsorSection: e.hasSponsorSection ?? null,
      registrationClosed: e.registrationClosed ?? null,
      imageUrl: e.imageUrl ?? null,
      featured: e.featured ?? null,
    }));

    const featured = selectFeaturedEvents(allEvents);
    return buildDynamicHomepage(storedHtml, featured, primary, accent);
  } catch (err) {
    logger.warn({ err, orgSlug }, "Failed to patch homepage with featured events — serving stored HTML");
    return storedHtml;
  }
}

/**
 * Rewrites root-relative internal links to include the /sites/:slug prefix.
 * Required when serving via path-based routing (/sites/:slug) so that clicking
 * event cards, nav links, etc. stays within the correct org context.
 * In production (host-based routing at slug.mypillar.co), this is NOT applied —
 * root-relative links already resolve correctly against the org's subdomain.
 */
function rewriteLinksForPathBasedRouting(html: string, orgSlug: string): string {
  const base = `/sites/${orgSlug}`;
  let result = html;

  // href="/events..." → href="/sites/slug/events..."
  result = result.replace(/href="(\/events[^"]*)"/g, `href="${base}$1"`);
  result = result.replace(/href='(\/events[^']*)'/g, `href='${base}$1'`);

  // href="/" exactly (home link) → href="/sites/slug/"
  result = result.replace(/href="\/"/g, `href="${base}/"`);
  result = result.replace(/href='\/'/g, `href='${base}/'`);

  // href="/#section" → href="/sites/slug/#section"
  result = result.replace(/href="\/#/g, `href="${base}/#`);
  result = result.replace(/href='\/\#/g, `href='${base}/#`);

  // onclick: location.href='/events/...' → location.href='/sites/slug/events/...'
  result = result.replace(/location\.href='(\/events[^']*)'/g, `location.href='${base}$1'`);
  result = result.replace(/location\.href="(\/events[^"]*)"/g, `location.href="${base}$1"`);

  // window.location.href='/events/...' (fetch/JS)
  result = result.replace(/window\.location\.href\s*=\s*'(\/events[^']*)'/g, `window.location.href='${base}$1'`);
  result = result.replace(/window\.location\.href\s*=\s*"(\/events[^"]*)"/g, `window.location.href="${base}$1"`);

  // Guard: strip any double-prefix that crept in (idempotent)
  const escapedBase = base.replace(/[/]/g, "\\/");
  result = result.replace(new RegExp(`${escapedBase}${escapedBase}`, "g"), base);

  return result;
}

// Shared site HTML response helper
function sendSiteHtml(res: express.Response, html: string, pathBasedOrgSlug?: string): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  // Allow inline scripts (site animations/observer), Google Fonts, and external images (Unsplash, org CDNs)
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src * data: blob:; " +
    "connect-src 'none'; " +
    "frame-ancestors 'none'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  let content = pathBasedOrgSlug
    ? rewriteLinksForPathBasedRouting(html, pathBasedOrgSlug)
    : html;
  content = content.includes("</body>")
    ? content.replace("</body>", `${POWERED_BY_FOOTER}</body>`)
    : content + POWERED_BY_FOOTER;
  res.send(content);
}

const SITE_NOT_FOUND_HTML = `<!DOCTYPE html><html><head><title>Site Not Found</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#94a3b8;text-align:center}.box{max-width:400px;padding:2rem}.title{color:#fff;font-size:1.5rem;margin-bottom:.5rem}</style></head><body><div class="box"><div class="title">Site not found</div><p>This organization hasn't published their site yet.</p><a href="/" style="color:#f59e0b;text-decoration:none">← Pillar Home</a></div></body></html>`;

// Temporary: diagnostic endpoint to verify production DB access
app.get("/sites/__diag", async (_req, res) => {
  try {
    const result = await db.execute(drizzleSql`SELECT id, org_slug, status, length(generated_html) as html_len FROM sites WHERE org_slug = 'norwin-rotary-club' LIMIT 1`);
    const allSites = await db.execute(drizzleSql`SELECT id, org_slug, status FROM sites LIMIT 10`);
    res.json({ found: result.rows, allSites: allSites.rows });
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) });
  }
});

// Public site renderer — serves generated HTML at /sites/:slug (by slug path)
app.get("/sites/:slug", async (req, res) => {
  try {
    const { slug } = req.params as { slug: string };
    logger.info({ slug }, "[/sites/:slug] received");
    const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgSlug, slug));
    logger.info({ slug, found: !!site, status: site?.status, hasHtml: !!site?.generatedHtml, htmlLen: site?.generatedHtml?.length ?? 0 }, "[/sites/:slug] db result");
    if (!site || site.status !== "published" || !site.generatedHtml) {
      const reason = !site ? "not_found" : site.status !== "published" ? `status_is_${site.status}` : "no_html";
      logger.info({ slug, reason }, "[/sites/:slug] 404");
      res.status(404).send(SITE_NOT_FOUND_HTML);
      return;
    }
    const patchedHtml = await patchHomepageWithFeaturedEvents(slug, site.generatedHtml);
    // Pass slug so root-relative links (/events/...) are rewritten to /sites/:slug/events/...
    // This is only needed for path-based dev routing; in production, host routing handles it.
    sendSiteHtml(res, patchedHtml, slug);
  } catch (err) {
    logger.error({ err }, "[/sites/:slug] error");
    res.status(404).send(SITE_NOT_FOUND_HTML);
  }
});

// Reserved subdomains that must never map to an org site
const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "preview", "mail", "docs", "blog", "status",
  "dev", "staging", "proxy", "cdn", "static", "assets", "media", "help",
  "support", "dashboard", "login", "auth", "billing",
]);

/**
 * Resolve which org site to serve from a hostname.
 * Returns { orgSlug, isPreview } or null if the host is not a Pillar subdomain.
 *
 * Patterns supported:
 *   <slug>.mypillar.co          → live (published) site
 *   preview-<slug>.mypillar.co  → preview (draft) site — requires auth or signed token
 */
function resolveSiteFromHost(host: string): { orgSlug: string; isPreview: boolean } | null {
  // strip port
  const h = host.split(":")[0].toLowerCase();
  const liveMatch = h.match(/^([a-z0-9][a-z0-9-]{0,62})\.mypillar\.co$/);
  if (!liveMatch) return null;
  const sub = liveMatch[1];
  // Preview pattern: preview-<slug>
  if (sub.startsWith("preview-")) {
    const slug = sub.slice("preview-".length);
    if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null;
    return { orgSlug: slug, isPreview: true };
  }
  // Reserved infra subdomain — pass through to app
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  return { orgSlug: sub, isPreview: false };
}

// Host-based site routing — serves sites at <slug>.mypillar.co or registered custom domains
// Also handles path-based routing /sites/:slug[/*] used by Replit's deployment proxy,
// which converts <slug>.mypillar.co/<path> → /sites/<slug>/<path>.
app.use(async (req, res, next) => {
  // Skip API paths
  if (req.path.startsWith("/api")) return next();

  let orgSlug: string | null = null;
  let isPreview = false;
  // subPath is the "virtual" path for this org (e.g. "/events", "/events/golf", "/")
  let subPath: string = req.path;
  // host is set when routing via Host header (pattern 2) so custom-domain routing can use it
  let host = "";
  // isPathBased is true when routing via /sites/:slug (dev/Replit proxy environment).
  // In this mode, root-relative links (/events/slug) need to be rewritten to
  // include the /sites/:slug prefix so navigation stays within the correct org context.
  let isPathBased = false;

  // ── Pattern 1: Path-based routing /sites/:slug[/*] ────────────────────────
  // Replit's deployment proxy converts norwin-rotary-club.mypillar.co/foo → /sites/norwin-rotary-club/foo
  const pathBasedMatch = req.path.match(/^\/sites\/([a-z0-9][a-z0-9-]{0,62})(\/.*)?$/);
  if (pathBasedMatch) {
    // Let named diagnostic/static routes (/sites/__diag) pass through as normal
    if (pathBasedMatch[1].startsWith("_")) return next();
    orgSlug = pathBasedMatch[1];
    subPath = pathBasedMatch[2] || "/";
    isPathBased = true;
  } else {
    // ── Pattern 2: Host-based routing (<slug>.mypillar.co or custom domain) ─
    const rawHost = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as string;
    host = rawHost.split(":")[0].toLowerCase();
    if (!host) return next();
    const resolved = resolveSiteFromHost(host);
    if (resolved) {
      orgSlug = resolved.orgSlug;
      isPreview = resolved.isPreview;
    }
  }

  if (orgSlug) {
    // ── Determine if this org uses the React template ─────────────────────────
    // React-template orgs have site_config set on the organizations row.
    // We check this FIRST (before any fs or legacy-HTML checks) so that
    // React-template orgs never accidentally fall through to the old HTML path.
    const cfgCheck = await db.execute(
      drizzleSql`SELECT (site_config IS NOT NULL) AS has_react_site FROM organizations WHERE slug = ${orgSlug} LIMIT 1`,
    );
    const cfgRow = cfgCheck.rows[0] as Record<string, unknown> | undefined;
    const hasReactSite = Boolean(cfgRow?.has_react_site);

    // ── React template orgs: serve the Vite SPA ───────────────────────────────
    // In production the built files live at artifacts/norwin-rotary/dist/public/.
    // In dev the Vite dev server owns the app; dist won't exist, so we fall
    // through and let the dev server handle it (it runs on a separate port).
    if (!isPreview && hasReactSite) {
      const reactDistDir = path.resolve(process.cwd(), "artifacts/norwin-rotary/dist/public");
      const reactIndexHtml = path.join(reactDistDir, "index.html");

      if (fs.existsSync(reactIndexHtml)) {
        // Serve static assets (JS/CSS/images) directly; SPA fallback for all other paths
        if (subPath.startsWith("/assets/") || subPath.match(/\.(ico|png|jpg|jpeg|svg|webp|woff2?|ttf|eot)$/i)) {
          const assetPath = path.join(reactDistDir, subPath);
          if (fs.existsSync(assetPath)) {
            res.sendFile(assetPath);
            return;
          }
        }
        // SPA: all non-asset paths get index.html (React Router handles navigation)
        res.setHeader("Cache-Control", "no-cache, no-store");
        res.sendFile(reactIndexHtml);
        return;
      }
      // dist not built yet (local dev without a build) — fall through so the
      // Vite dev server can handle it. In production this should never happen
      // because build.mjs builds the frontend when CI=true.
    }

    // ── Legacy HTML handlers (only for orgs WITHOUT a React site_config) ────────
    // React-template orgs return early above. Everything below is the old
    // server-rendered HTML path and must never run for site_config orgs.
    if (hasReactSite) {
      // React site but dist wasn't built (shouldn't happen in production).
      res.status(503).send("Site is building. Try again in a moment.");
      return;
    }

    // ── Events listing page: <orgSlug>.mypillar.co/events ─────────────────────
    if (subPath === "/events" && !isPreview) {
      const [orgRow] = await db
        .select({ id: organizationsTable.id, name: organizationsTable.name, slug: organizationsTable.slug, stripeConnectAccountId: organizationsTable.stripeConnectAccountId, stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded, senderEmail: organizationsTable.senderEmail, tier: organizationsTable.tier })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, orgSlug));
      const [site] = await db.select({ generatedHtml: sitesTable.generatedHtml }).from(sitesTable).where(eq(sitesTable.orgSlug, orgSlug));
      const siteHtml = site?.generatedHtml ?? null;

      if (!orgRow) { res.status(404).send(SITE_NOT_FOUND_HTML); return; }

      const org: OrgInfo = { name: orgRow.name, slug: orgRow.slug ?? orgSlug, stripeConnectAccountId: orgRow.stripeConnectAccountId ?? null, stripeConnectOnboarded: orgRow.stripeConnectOnboarded ?? null, contactEmail: orgRow.senderEmail ?? null };

      const eventRows = await db
        .select()
        .from(eventsTable)
        .where(and(eq(eventsTable.orgId, orgRow.id), eq(eventsTable.status, "published"), eq(eventsTable.isActive, true)))
        .orderBy(asc(eventsTable.startDate));

      const events: PublicEvent[] = eventRows.map(e => ({
        id: e.id, name: e.name, slug: e.slug, description: e.description ?? null,
        eventType: e.eventType ?? null, startDate: e.startDate ?? null, endDate: e.endDate ?? null,
        startTime: e.startTime ?? null, endTime: e.endTime ?? null, location: e.location ?? null,
        isTicketed: e.isTicketed ?? null, ticketPrice: e.ticketPrice ?? null, ticketCapacity: e.ticketCapacity ?? null,
        hasRegistration: e.hasRegistration ?? null, hasSponsorSection: (e as Record<string,unknown>).hasSponsorSection as boolean ?? null,
        registrationClosed: e.registrationClosed ?? null, imageUrl: e.imageUrl ?? null, featured: e.featured ?? null,
      }));

      const html = buildEventsListingPage({ events, org, siteHtml });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.send(isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html);
      return;
    }

    // ── Event detail page: <orgSlug>.mypillar.co/events/:slug ─────────────────
    const eventDetailMatch = subPath.match(/^\/events\/([^/]+)$/);
    if (eventDetailMatch && !isPreview) {
      const eventSlug = eventDetailMatch[1];
      const [orgRow] = await db
        .select({ id: organizationsTable.id, name: organizationsTable.name, slug: organizationsTable.slug, stripeConnectAccountId: organizationsTable.stripeConnectAccountId, stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded, senderEmail: organizationsTable.senderEmail })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, orgSlug));
      const [site] = await db.select({ generatedHtml: sitesTable.generatedHtml }).from(sitesTable).where(eq(sitesTable.orgSlug, orgSlug));
      const siteHtml = site?.generatedHtml ?? null;

      if (!orgRow) { res.status(404).send(SITE_NOT_FOUND_HTML); return; }

      const org: OrgInfo = { name: orgRow.name, slug: orgRow.slug ?? orgSlug, stripeConnectAccountId: orgRow.stripeConnectAccountId ?? null, stripeConnectOnboarded: orgRow.stripeConnectOnboarded ?? null, contactEmail: orgRow.senderEmail ?? null };

      const [eventRow] = await db
        .select()
        .from(eventsTable)
        .where(and(eq(eventsTable.slug, eventSlug), eq(eventsTable.orgId, orgRow.id), eq(eventsTable.status, "published"), eq(eventsTable.isActive, true)));

      if (!eventRow) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(404).send(buildPublicEventNotFoundPage(org, siteHtml));
        return;
      }

      const eventRowAny = eventRow as Record<string, unknown>;
      const event: PublicEvent = {
        id: eventRow.id, name: eventRow.name, slug: eventRow.slug, description: eventRow.description ?? null,
        eventType: eventRow.eventType ?? null, startDate: eventRow.startDate ?? null, endDate: eventRow.endDate ?? null,
        startTime: eventRow.startTime ?? null, endTime: eventRow.endTime ?? null, location: eventRow.location ?? null,
        isTicketed: eventRow.isTicketed ?? null, ticketPrice: eventRow.ticketPrice ?? null, ticketCapacity: eventRow.ticketCapacity ?? null,
        hasRegistration: eventRow.hasRegistration ?? null, hasSponsorSection: eventRowAny.hasSponsorSection as boolean ?? null,
        registrationClosed: eventRow.registrationClosed ?? null, imageUrl: eventRow.imageUrl ?? null, featured: eventRow.featured ?? null,
        ticketSaleOpen: (eventRowAny.ticketSaleOpen as string | null) ?? null,
        ticketSaleClose: (eventRowAny.ticketSaleClose as string | null) ?? null,
      };

      const [ticketTypeRows, sponsorRows] = await Promise.all([
        db.select().from(ticketTypesTable).where(and(eq(ticketTypesTable.eventId, eventRow.id), eq(ticketTypesTable.isActive, true))),
        event.hasSponsorSection
          ? db.select({ sponsorId: eventSponsorsTable.sponsorId, tier: eventSponsorsTable.tier, tierRank: sponsorsTable.tierRank, name: sponsorsTable.name, logoUrl: sponsorsTable.logoUrl, website: sponsorsTable.website })
              .from(eventSponsorsTable)
              .innerJoin(sponsorsTable, eq(eventSponsorsTable.sponsorId, sponsorsTable.id))
              .where(and(eq(eventSponsorsTable.eventId, eventRow.id), eq(sponsorsTable.siteVisible, true), eq(sponsorsTable.status, "active")))
          : Promise.resolve([]),
      ]);

      const ticketTypes: PublicTicketType[] = ticketTypeRows.map(tt => ({
        id: tt.id, name: tt.name, description: tt.description ?? null,
        price: tt.price, quantity: tt.quantity ?? null, sold: tt.sold,
      }));

      const sponsors: PublicSponsor[] = sponsorRows.map(s => ({
        sponsorId: s.sponsorId, name: s.name, tier: s.tier ?? null,
        tierRank: s.tierRank ?? null, logoUrl: s.logoUrl ?? null, website: s.website ?? null,
      }));

      const html = buildEventDetailPage({
        event, ticketTypes, sponsors, org, siteHtml,
        cancelled: req.query.cancelled === "true",
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.send(isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html);
      return;
    }

    // ── Event pages: <orgSlug>.mypillar.co/events/:eventSlug/tickets[/success] ──
    const eventTicketsMatch = subPath.match(/^\/events\/([^/]+)\/tickets(\/success)?$/);
    if (eventTicketsMatch && !isPreview) {
      const eventSlug = eventTicketsMatch[1];
      const isSuccess = !!eventTicketsMatch[2];

      const [org] = await db
        .select({
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          stripeConnectAccountId: organizationsTable.stripeConnectAccountId,
          stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, orgSlug));

      const [site] = await db
        .select({ generatedHtml: sitesTable.generatedHtml })
        .from(sitesTable)
        .where(eq(sitesTable.orgSlug, orgSlug));

      const siteHtml = site?.generatedHtml ?? null;
      const orgName = org?.name ?? orgSlug;

      const [event] = await db
        .select()
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.slug, eventSlug),
            eq(eventsTable.status, "published"),
            eq(eventsTable.isActive, true),
          ),
        );

      if (!event) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(404).send(buildEventNotFoundPage(orgName, siteHtml));
        return;
      }

      if (isSuccess) {
        const html = buildEventSuccessPage({
          event,
          org: { name: orgName, slug: orgSlug, stripeConnectAccountId: org?.stripeConnectAccountId ?? null, stripeConnectOnboarded: org?.stripeConnectOnboarded ?? null },
          siteHtml,
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html);
        return;
      }

      const ticketTypes = await db
        .select()
        .from(ticketTypesTable)
        .where(and(eq(ticketTypesTable.eventId, event.id), eq(ticketTypesTable.isActive, true)));

      const html = buildEventPage({
        event,
        ticketTypes: ticketTypes.map((tt) => ({
          id: tt.id,
          name: tt.name,
          description: tt.description,
          price: tt.price,
          quantity: tt.quantity,
          sold: tt.sold,
        })),
        org: {
          name: orgName,
          slug: orgSlug,
          stripeConnectAccountId: org?.stripeConnectAccountId ?? null,
          stripeConnectOnboarded: org?.stripeConnectOnboarded ?? null,
        },
        siteHtml,
        cancelled: req.query.cancelled === "true",
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.send(isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html);
      return;
    }

    // ── Event form pages: /events/:eventSlug/vendor-apply|sponsor-signup|register ─
    const eventFormMatch = subPath.match(/^\/events\/([^/]+)\/(vendor-apply|sponsor-signup|register)$/);
    if (eventFormMatch && !isPreview) {
      const eventSlug = eventFormMatch[1];
      const formType = eventFormMatch[2] as "vendor-apply" | "sponsor-signup" | "register";

      const [orgRow] = await db
        .select({ id: organizationsTable.id, name: organizationsTable.name, slug: organizationsTable.slug, stripeConnectAccountId: organizationsTable.stripeConnectAccountId, stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded, senderEmail: organizationsTable.senderEmail })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, orgSlug));
      const [siteRow] = await db.select({ generatedHtml: sitesTable.generatedHtml }).from(sitesTable).where(eq(sitesTable.orgSlug, orgSlug));
      const siteHtml = siteRow?.generatedHtml ?? null;

      if (!orgRow) { res.status(404).send(SITE_NOT_FOUND_HTML); return; }

      const org: OrgInfo = { name: orgRow.name, slug: orgRow.slug ?? orgSlug, stripeConnectAccountId: orgRow.stripeConnectAccountId ?? null, stripeConnectOnboarded: orgRow.stripeConnectOnboarded ?? null, contactEmail: orgRow.senderEmail ?? null };

      const [eventRow] = await db
        .select()
        .from(eventsTable)
        .where(and(eq(eventsTable.slug, eventSlug), eq(eventsTable.orgId, orgRow.id), eq(eventsTable.isActive, true)));

      if (!eventRow) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(404).send(buildPublicEventNotFoundPage(org, siteHtml));
        return;
      }

      const event: PublicEvent = {
        id: eventRow.id, name: eventRow.name, slug: eventRow.slug, description: eventRow.description ?? null,
        eventType: eventRow.eventType ?? null, startDate: eventRow.startDate ?? null, endDate: eventRow.endDate ?? null,
        startTime: eventRow.startTime ?? null, endTime: eventRow.endTime ?? null, location: eventRow.location ?? null,
        isTicketed: eventRow.isTicketed ?? null, ticketPrice: eventRow.ticketPrice ?? null, ticketCapacity: eventRow.ticketCapacity ?? null,
        hasRegistration: eventRow.hasRegistration ?? null, hasSponsorSection: (eventRow as Record<string, unknown>).hasSponsorSection as boolean ?? null,
        registrationClosed: eventRow.registrationClosed ?? null, imageUrl: eventRow.imageUrl ?? null, featured: eventRow.featured ?? null,
      };

      let html: string;
      if (formType === "vendor-apply") {
        html = buildVendorApplyPage({ event, org, siteHtml });
      } else if (formType === "sponsor-signup") {
        html = buildSponsorSignupPage({ event, org, siteHtml });
      } else {
        html = buildRegisterPage({ event, org, siteHtml });
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.send(isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html);
      return;
    }

    const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgSlug, orgSlug));

    if (isPreview) {
      // Preview subdomain: serve draft HTML (no strict auth — slugs are random)
      if (site?.generatedHtml) {
        const html = (site as any).proposedHtml ?? site.generatedHtml;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
        res.send(html);
        return;
      }
      res.status(404).send(SITE_NOT_FOUND_HTML);
      return;
    }

    // Live subdomain: only serve published sites
    if (site?.status === "published" && site.generatedHtml) {
      const patchedHomepage = await patchHomepageWithFeaturedEvents(orgSlug, site.generatedHtml);
      sendSiteHtml(res, patchedHomepage);
      return;
    }
    res.status(404).send(SITE_NOT_FOUND_HTML);
    return;
  }

  // Pattern 2: registered custom domain (myorg.com or www.myorg.com)
  // Only apply to non-Pillar, non-Replit hosts
  const isInternalHost = host.includes("mypillar.co") || host.includes("replit.dev") || host.includes("replit.app") || host === "localhost" || host === "127.0.0.1";
  if (!isInternalHost && host.includes(".")) {
    // Normalize: domains are stored without www. prefix, so strip it from lookup host
    const lookupHost = host.replace(/^www\./, "");
    const [domainRecord] = await db
      .select({ domain: domainsTable, org: organizationsTable })
      .from(domainsTable)
      .innerJoin(organizationsTable, eq(domainsTable.orgId, organizationsTable.id))
      .where(eq(domainsTable.domain, lookupHost));

    if (domainRecord && (domainRecord.domain.status === "active" || domainRecord.domain.dnsStatus === "live")) {
      // Look up the org's site
      const orgId = domainRecord.org.id;
      const [site] = await db.select().from(sitesTable).where(
        or(eq(sitesTable.orgId, orgId), eq(sitesTable.orgSlug, domainRecord.org.slug ?? ""))
      );
      if (site?.status === "published" && site.generatedHtml) {
        const domainSlug = domainRecord.org.slug ?? "";
        const patchedCustomDomain = await patchHomepageWithFeaturedEvents(domainSlug, site.generatedHtml);
        sendSiteHtml(res, patchedCustomDomain);
        return;
      }
    }
    // Custom domain registered but site not ready
    if (domainRecord) {
      res.status(404).send(SITE_NOT_FOUND_HTML);
      return;
    }
  }

  next();
});

// Global error handler — must be last middleware (4 args = Express error handler)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as NodeJS.ErrnoException & { status?: number }).status ?? 500;
  req.log?.error({ err }, err.message ?? "Internal server error");
  if (status >= 500) {
    sendErrorAlert(`HTTP ${status}: ${req.method} ${req.path}`, err).catch(() => {});
  }
  if (res.headersSent) return;
  res.status(status).json({ error: err.message ?? "Internal server error" });
});

export default app;
