import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import httpModule from "http";
import httpProxy from "http-proxy";
import { authMiddleware } from "./middlewares/authMiddleware";
import { csrfMiddleware } from "./lib/csrf";
import { sendErrorAlert } from "./lib/errorAlert";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import {
  db,
  sitesTable,
  domainsTable,
  organizationsTable,
  eventsTable,
  ticketTypesTable,
  eventSponsorsTable,
  sponsorsTable,
} from "@workspace/db";
import { eq, or, and, asc, sql as drizzleSql } from "drizzle-orm";
import {
  buildEventPage,
  buildEventSuccessPage,
  buildEventNotFoundPage,
} from "./eventPage";
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

// Workspace root — resolves correctly in both dev (cwd = artifacts/api-server)
// and production (cwd = workspace root) because it anchors to the bundle's absolute path.
const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const app: Express = express();

app.set("trust proxy", 1);

const proxy = httpProxy.createProxyServer({});
proxy.on("error", (err, _req, res) => {
  console.error("[x-pillar-slug proxy error]", (err as Error).message);
  const r = res as httpModule.ServerResponse;
  if (!r.headersSent) {
    r.writeHead(502);
    r.end("Community platform unavailable");
  }
});

// ── Community platform pipe proxy ────────────────────────────────────────────
// Streams the request/response directly to localhost:5001 with no buffering,
// so assets (JS/CSS) get the correct Content-Type from the CP Express static
// server and the React SPA loads correctly.
function pipeToCommunityPlatform(
  req: Request,
  res: Response,
  orgSlug: string,
): void {
  const options: httpModule.RequestOptions = {
    hostname: "localhost",
    port: 5001,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, "x-org-id": orgSlug, host: "localhost:5001" },
  };
  const proxyReq = httpModule.request(options, (proxyRes) => {
    res.writeHead(
      proxyRes.statusCode ?? 200,
      proxyRes.headers as httpModule.OutgoingHttpHeaders,
    );
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    console.error(`[CP proxy] ${orgSlug}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Community platform unavailable");
    }
  });
  req.pipe(proxyReq, { end: true });
}

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

const ALLOWED_ORIGIN_RE =
  /^https?:\/\/(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?$|\.replit\.dev$|\.replit\.app$|\.mypillar\.co$|^https:\/\/mypillar\.co$/;

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
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (["POST", "PUT", "PATCH"].includes(req.method) && req.body === undefined) {
    const ct = (req.headers["content-type"] ?? "").toLowerCase();
    if (
      !ct.startsWith("multipart/") &&
      !ct.startsWith("application/octet-stream")
    ) {
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
  message: {
    error: "Too many registration attempts — please try again in an hour",
  },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many upload requests — please try again in an hour" },
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts — please try again in an hour",
  },
});

app.use("/api/public/registrations", registrationLimiter);
app.use("/api/public/registration-docs/upload-url", uploadLimiter);
app.use("/api/public/", publicApiLimiter);
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

async function patchHomepageWithFeaturedEvents(
  orgSlug: string,
  storedHtml: string,
): Promise<string> {
  try {
    const primary =
      storedHtml.match(/--primary:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#1e2d4f";
    const accent =
      storedHtml.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#c9a84c";

    const [orgRow] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, orgSlug));
    if (!orgRow) return storedHtml;

    const eventRows = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.orgId, orgRow.id),
          eq(eventsTable.status, "published"),
          eq(eventsTable.isActive, true),
        ),
      )
      .orderBy(asc(eventsTable.startDate));

    const allEvents: PublicEvent[] = eventRows.map((e) => ({
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
    logger.warn(
      { err, orgSlug },
      "Failed to patch homepage with featured events — serving stored HTML",
    );
    return storedHtml;
  }
}

function rewriteLinksForPathBasedRouting(
  html: string,
  orgSlug: string,
): string {
  const base = `/sites/${orgSlug}`;
  let result = html;

  result = result.replace(/href="(\/events[^"]*)"/g, `href="${base}$1"`);
  result = result.replace(/href='(\/events[^']*)'/g, `href='${base}$1'`);
  result = result.replace(/href="\/"/g, `href="${base}/"`);
  result = result.replace(/href='\/'/g, `href='${base}/'`);
  result = result.replace(/href="\/#/g, `href="${base}/#`);
  result = result.replace(/href='\/\#/g, `href='${base}/#`);
  result = result.replace(
    /location\.href='(\/events[^']*)'/g,
    `location.href='${base}$1'`,
  );
  result = result.replace(
    /location\.href="(\/events[^"]*)"/g,
    `location.href="${base}$1"`,
  );
  result = result.replace(
    /window\.location\.href\s*=\s*'(\/events[^']*)'/g,
    `window.location.href='${base}$1'`,
  );
  result = result.replace(
    /window\.location\.href\s*=\s*"(\/events[^"]*)"/g,
    `window.location.href="${base}$1"`,
  );

  const escapedBase = base.replace(/[/]/g, "\\/");
  result = result.replace(
    new RegExp(`${escapedBase}${escapedBase}`, "g"),
    base,
  );

  return result;
}

function sendSiteHtml(
  res: express.Response,
  html: string,
  pathBasedOrgSlug?: string,
): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "img-src * data: blob:; " +
      "connect-src 'none'; " +
      "frame-ancestors 'none'",
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

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "preview",
  "mail",
  "docs",
  "blog",
  "status",
  "dev",
  "staging",
  "proxy",
  "cdn",
  "static",
  "assets",
  "media",
  "help",
  "support",
  "dashboard",
  "login",
  "auth",
  "billing",
]);

function resolveSiteFromHost(
  host: string,
): { orgSlug: string; isPreview: boolean } | null {
  const h = host.split(":")[0].toLowerCase();
  const liveMatch = h.match(/^([a-z0-9][a-z0-9-]{0,62})\.mypillar\.co$/);
  if (!liveMatch) return null;
  const sub = liveMatch[1];
  if (sub.startsWith("preview-")) {
    const slug = sub.slice("preview-".length);
    if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null;
    return { orgSlug: slug, isPreview: true };
  }
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  return { orgSlug: sub, isPreview: false };
}

// ── Main site routing middleware ──────────────────────────────────────────────
// Handles all tenant site requests — both path-based (/sites/:slug/*)
// and host-based (<slug>.mypillar.co). CP org API calls are proxied to
// port 5001; non-CP API calls are passed through to the Pillar router.
// NOTE: does NOT skip /api paths at the top — CP orgs need /api/* proxied.
app.use(async (req, res, next) => {
  let orgSlug: string | null = null;
  let isPreview = false;
  let subPath: string = req.path;
  let host = "";
  let isPathBased = false;

  // ── Pattern 1: Path-based routing /sites/:slug[/*] ────────────────────────
  const pathBasedMatch = req.path.match(
    /^\/sites\/([a-z0-9][a-z0-9-]{0,62})(\/.*)?$/,
  );
  if (pathBasedMatch) {
    if (pathBasedMatch[1].startsWith("_")) return next();
    orgSlug = pathBasedMatch[1];
    subPath = pathBasedMatch[2] || "/";
    isPathBased = true;
  } else {
    // ── Pattern 2: Host-based routing (<slug>.mypillar.co or custom domain) ─
    // Skip plain /api/* paths that aren't under a tenant slug
    if (req.path.startsWith("/api")) return next();

    const rawHost = (req.headers["x-forwarded-host"] ??
      req.headers.host ??
      "") as string;
    host = rawHost.split(":")[0].toLowerCase();
    if (!host) return next();
    const resolved = resolveSiteFromHost(host);
    if (resolved) {
      orgSlug = resolved.orgSlug;
      isPreview = resolved.isPreview;
    }
  }

  if (orgSlug) {
    const cfgCheck = await db.execute(
      drizzleSql`SELECT slug, (site_config IS NOT NULL) AS has_react_site, community_site_url
                 FROM organizations
                 WHERE slug = ${orgSlug}
                    OR community_site_url LIKE ${"%" + orgSlug + ".mypillar.co%"}
                 LIMIT 1`,
    );
    const cfgRow = cfgCheck.rows[0] as Record<string, unknown> | undefined;
    const hasReactSite = Boolean(cfgRow?.has_react_site);
    const communitySiteUrl =
      (cfgRow?.community_site_url as string | null) ?? null;
    const isCpSite = !!communitySiteUrl?.includes(".mypillar.co");
    const cpOrgSlug = (cfgRow?.slug as string | null) ?? orgSlug;

    // ── Community platform orgs: pipe ALL requests to the CP server ───────────
    // This includes HTML, assets, and /api/* calls (e.g. /api/org-config).
    if (!isPreview && isCpSite) {
      req.url =
        subPath +
        (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
      pipeToCommunityPlatform(req, res, cpOrgSlug);
      return;
    }

    // ── API early-return for path-based non-CP orgs ────────────────────────────
    // Strip /sites/:slug prefix so Pillar API route handlers receive the request.
    if (isPathBased && (subPath.startsWith("/api/") || subPath === "/api")) {
      req.url =
        subPath +
        (req.url && req.url.includes("?")
          ? "?" + req.url.split("?").slice(1).join("?")
          : "");
      return next();
    }

    // ── React template orgs: serve the Vite SPA ───────────────────────────────
    if (!isPreview && hasReactSite) {
      const reactDistDir = path.join(
        WORKSPACE_ROOT,
        "artifacts/norwin-rotary/dist/public",
      );
      const reactIndexHtml = path.join(reactDistDir, "index.html");

      if (fs.existsSync(reactIndexHtml)) {
        if (
          subPath.startsWith("/assets/") ||
          subPath.match(/\.(ico|png|jpg|jpeg|svg|webp|woff2?|ttf|eot)$/i)
        ) {
          const assetPath = path.join(reactDistDir, subPath);
          if (fs.existsSync(assetPath)) {
            res.sendFile(assetPath);
            return;
          }
        }
        let html = fs.readFileSync(reactIndexHtml, "utf-8");
        if (isPathBased) {
          const base = `/sites/${orgSlug}`;
          html = html.replace(/(src|href)="\/assets\//g, `$1="${base}/assets/`);
          html = html.replace(
            /(src|href)="\/(favicon\.|manifest\.)/g,
            `$1="${base}/$2`,
          );
        }
        res.setHeader("Cache-Control", "no-cache, no-store");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      }
    }

    if (hasReactSite) {
      res.status(503).send("Site is building. Try again in a moment.");
      return;
    }

    // ── Events listing page ────────────────────────────────────────────────────
    if (subPath === "/events" && !isPreview) {
      const [orgRow] = await db
        .select({
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          stripeConnectAccountId: organizationsTable.stripeConnectAccountId,
          stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded,
          senderEmail: organizationsTable.senderEmail,
          tier: organizationsTable.tier,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, orgSlug));
      const [site] = await db
        .select({ generatedHtml: sitesTable.generatedHtml })
        .from(sitesTable)
        .where(eq(sitesTable.orgSlug, orgSlug));
      const siteHtml = site?.generatedHtml ?? null;

      if (!orgRow) {
        res.status(404).send(SITE_NOT_FOUND_HTML);
        return;
      }

      const org: OrgInfo = {
        name: orgRow.name,
        slug: orgRow.slug ?? orgSlug,
        stripeConnectAccountId: orgRow.stripeConnectAccountId ?? null,
        stripeConnectOnboarded: orgRow.stripeConnectOnboarded ?? null,
        contactEmail: orgRow.senderEmail ?? null,
      };

      const eventRows = await db
        .select()
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.orgId, orgRow.id),
            eq(eventsTable.status, "published"),
            eq(eventsTable.isActive, true),
          ),
        )
        .orderBy(asc(eventsTable.startDate));

      const events: PublicEvent[] = eventRows.map((e) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        description: e.description ?? null,
        eventType: e.eventType ?? null,
        startDate: e.startDate ?? null,
        endDate: e.endDate ?? null,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        location: e.location ?? null,
        isTicketed: e.isTicketed ?? null,
        ticketPrice: e.ticketPrice ?? null,
        ticketCapacity: e.ticketCapacity ?? null,
        hasRegistration: e.hasRegistration ?? null,
        hasSponsorSection:
          ((e as Record<string, unknown>).hasSponsorSection as boolean) ?? null,
        registrationClosed: e.registrationClosed ?? null,
        imageUrl: e.imageUrl ?? null,
        featured: e.featured ?? null,
      }));

      const html = buildEventsListingPage({ events, org, siteHtml });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.send(
        isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html,
      );
      return;
    }

    // ── Event detail page ──────────────────────────────────────────────────────
    const eventDetailMatch = subPath.match(/^\/events\/([^/]+)$/);
    if (eventDetailMatch && !isPreview) {
      const eventSlug = eventDetailMatch[1];
      const [orgRow] = await db
        .select({
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          stripeConnectAccountId: organizationsTable.stripeConnectAccountId,
          stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded,
          senderEmail: organizationsTable.senderEmail,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, orgSlug));
      const [site] = await db
        .select({ generatedHtml: sitesTable.generatedHtml })
        .from(sitesTable)
        .where(eq(sitesTable.orgSlug, orgSlug));
      const siteHtml = site?.generatedHtml ?? null;

      if (!orgRow) {
        res.status(404).send(SITE_NOT_FOUND_HTML);
        return;
      }

      const org: OrgInfo = {
        name: orgRow.name,
        slug: orgRow.slug ?? orgSlug,
        stripeConnectAccountId: orgRow.stripeConnectAccountId ?? null,
        stripeConnectOnboarded: orgRow.stripeConnectOnboarded ?? null,
        contactEmail: orgRow.senderEmail ?? null,
      };

      const [eventRow] = await db
        .select()
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.slug, eventSlug),
            eq(eventsTable.orgId, orgRow.id),
            eq(eventsTable.status, "published"),
            eq(eventsTable.isActive, true),
          ),
        );

      if (!eventRow) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(404).send(buildPublicEventNotFoundPage(org, siteHtml));
        return;
      }

      const eventRowAny = eventRow as Record<string, unknown>;
      const event: PublicEvent = {
        id: eventRow.id,
        name: eventRow.name,
        slug: eventRow.slug,
        description: eventRow.description ?? null,
        eventType: eventRow.eventType ?? null,
        startDate: eventRow.startDate ?? null,
        endDate: eventRow.endDate ?? null,
        startTime: eventRow.startTime ?? null,
        endTime: eventRow.endTime ?? null,
        location: eventRow.location ?? null,
        isTicketed: eventRow.isTicketed ?? null,
        ticketPrice: eventRow.ticketPrice ?? null,
        ticketCapacity: eventRow.ticketCapacity ?? null,
        hasRegistration: eventRow.hasRegistration ?? null,
        hasSponsorSection: (eventRowAny.hasSponsorSection as boolean) ?? null,
        registrationClosed: eventRow.registrationClosed ?? null,
        imageUrl: eventRow.imageUrl ?? null,
        featured: eventRow.featured ?? null,
        ticketSaleOpen: (eventRowAny.ticketSaleOpen as string | null) ?? null,
        ticketSaleClose: (eventRowAny.ticketSaleClose as string | null) ?? null,
      };

      const [ticketTypeRows, sponsorRows] = await Promise.all([
        db
          .select()
          .from(ticketTypesTable)
          .where(
            and(
              eq(ticketTypesTable.eventId, eventRow.id),
              eq(ticketTypesTable.isActive, true),
            ),
          ),
        event.hasSponsorSection
          ? db
              .select({
                sponsorId: eventSponsorsTable.sponsorId,
                tier: eventSponsorsTable.tier,
                tierRank: sponsorsTable.tierRank,
                name: sponsorsTable.name,
                logoUrl: sponsorsTable.logoUrl,
                website: sponsorsTable.website,
              })
              .from(eventSponsorsTable)
              .innerJoin(
                sponsorsTable,
                eq(eventSponsorsTable.sponsorId, sponsorsTable.id),
              )
              .where(
                and(
                  eq(eventSponsorsTable.eventId, eventRow.id),
                  eq(sponsorsTable.siteVisible, true),
                  eq(sponsorsTable.status, "active"),
                ),
              )
          : Promise.resolve([]),
      ]);

      const ticketTypes: PublicTicketType[] = ticketTypeRows.map((tt) => ({
        id: tt.id,
        name: tt.name,
        description: tt.description ?? null,
        price: tt.price,
        quantity: tt.quantity ?? null,
        sold: tt.sold,
      }));

      const sponsors: PublicSponsor[] = sponsorRows.map((s) => ({
        sponsorId: s.sponsorId,
        name: s.name,
        tier: s.tier ?? null,
        tierRank: s.tierRank ?? null,
        logoUrl: s.logoUrl ?? null,
        website: s.website ?? null,
      }));

      const html = buildEventDetailPage({
        event,
        ticketTypes,
        sponsors,
        org,
        siteHtml,
        cancelled: req.query.cancelled === "true",
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.send(
        isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html,
      );
      return;
    }

    // ── Ticket pages ───────────────────────────────────────────────────────────
    const eventTicketsMatch = subPath.match(
      /^\/events\/([^/]+)\/tickets(\/success)?$/,
    );
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
          org: {
            name: orgName,
            slug: orgSlug,
            stripeConnectAccountId: org?.stripeConnectAccountId ?? null,
            stripeConnectOnboarded: org?.stripeConnectOnboarded ?? null,
          },
          siteHtml,
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(
          isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html,
        );
        return;
      }

      const ticketTypes = await db
        .select()
        .from(ticketTypesTable)
        .where(
          and(
            eq(ticketTypesTable.eventId, event.id),
            eq(ticketTypesTable.isActive, true),
          ),
        );

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
      res.send(
        isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html,
      );
      return;
    }

    // ── Event form pages ───────────────────────────────────────────────────────
    const eventFormMatch = subPath.match(
      /^\/events\/([^/]+)\/(vendor-apply|sponsor-signup|register)$/,
    );
    if (eventFormMatch && !isPreview) {
      const eventSlug = eventFormMatch[1];
      const formType = eventFormMatch[2] as
        | "vendor-apply"
        | "sponsor-signup"
        | "register";

      const [orgRow] = await db
        .select({
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          stripeConnectAccountId: organizationsTable.stripeConnectAccountId,
          stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded,
          senderEmail: organizationsTable.senderEmail,
        })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, orgSlug));
      const [siteRow] = await db
        .select({ generatedHtml: sitesTable.generatedHtml })
        .from(sitesTable)
        .where(eq(sitesTable.orgSlug, orgSlug));
      const siteHtml = siteRow?.generatedHtml ?? null;

      if (!orgRow) {
        res.status(404).send(SITE_NOT_FOUND_HTML);
        return;
      }

      const org: OrgInfo = {
        name: orgRow.name,
        slug: orgRow.slug ?? orgSlug,
        stripeConnectAccountId: orgRow.stripeConnectAccountId ?? null,
        stripeConnectOnboarded: orgRow.stripeConnectOnboarded ?? null,
        contactEmail: orgRow.senderEmail ?? null,
      };

      const [eventRow] = await db
        .select()
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.slug, eventSlug),
            eq(eventsTable.orgId, orgRow.id),
            eq(eventsTable.isActive, true),
          ),
        );

      if (!eventRow) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(404).send(buildPublicEventNotFoundPage(org, siteHtml));
        return;
      }

      const event: PublicEvent = {
        id: eventRow.id,
        name: eventRow.name,
        slug: eventRow.slug,
        description: eventRow.description ?? null,
        eventType: eventRow.eventType ?? null,
        startDate: eventRow.startDate ?? null,
        endDate: eventRow.endDate ?? null,
        startTime: eventRow.startTime ?? null,
        endTime: eventRow.endTime ?? null,
        location: eventRow.location ?? null,
        isTicketed: eventRow.isTicketed ?? null,
        ticketPrice: eventRow.ticketPrice ?? null,
        ticketCapacity: eventRow.ticketCapacity ?? null,
        hasRegistration: eventRow.hasRegistration ?? null,
        hasSponsorSection:
          ((eventRow as Record<string, unknown>)
            .hasSponsorSection as boolean) ?? null,
        registrationClosed: eventRow.registrationClosed ?? null,
        imageUrl: eventRow.imageUrl ?? null,
        featured: eventRow.featured ?? null,
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
      res.send(
        isPathBased ? rewriteLinksForPathBasedRouting(html, orgSlug) : html,
      );
      return;
    }

    // ── Legacy HTML / preview ──────────────────────────────────────────────────
    const [site] = await db
      .select()
      .from(sitesTable)
      .where(eq(sitesTable.orgSlug, orgSlug));

    if (isPreview) {
      if (site?.generatedHtml) {
        const html = (site as any).proposedHtml ?? site.generatedHtml;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader(
          "Content-Security-Policy",
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
        );
        res.send(html);
        return;
      }
      res.status(404).send(SITE_NOT_FOUND_HTML);
      return;
    }

    if (site?.status === "published" && site.generatedHtml) {
      const patchedHomepage = await patchHomepageWithFeaturedEvents(
        orgSlug,
        site.generatedHtml,
      );
      sendSiteHtml(res, patchedHomepage);
      return;
    }
    res.status(404).send(SITE_NOT_FOUND_HTML);
    return;
  }

  // ── Custom domain routing ──────────────────────────────────────────────────
  const isInternalHost =
    host.includes("mypillar.co") ||
    host.includes("replit.dev") ||
    host.includes("replit.app") ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (!isInternalHost && host.includes(".")) {
    const lookupHost = host.replace(/^www\./, "");
    const [domainRecord] = await db
      .select({ domain: domainsTable, org: organizationsTable })
      .from(domainsTable)
      .innerJoin(
        organizationsTable,
        eq(domainsTable.orgId, organizationsTable.id),
      )
      .where(eq(domainsTable.domain, lookupHost));

    if (
      domainRecord &&
      (domainRecord.domain.status === "active" ||
        domainRecord.domain.dnsStatus === "live")
    ) {
      const orgId = domainRecord.org.id;
      const [site] = await db
        .select()
        .from(sitesTable)
        .where(
          or(
            eq(sitesTable.orgId, orgId),
            eq(sitesTable.orgSlug, domainRecord.org.slug ?? ""),
          ),
        );
      if (site?.status === "published" && site.generatedHtml) {
        const domainSlug = domainRecord.org.slug ?? "";
        const patchedCustomDomain = await patchHomepageWithFeaturedEvents(
          domainSlug,
          site.generatedHtml,
        );
        sendSiteHtml(res, patchedCustomDomain);
        return;
      }
    }
    if (domainRecord) {
      res.status(404).send(SITE_NOT_FOUND_HTML);
      return;
    }
  }

  next();
});

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const status =
    (err as NodeJS.ErrnoException & { status?: number }).status ?? 500;
  req.log?.error({ err }, err.message ?? "Internal server error");
  if (status >= 500) {
    sendErrorAlert(`HTTP ${status}: ${req.method} ${req.path}`, err).catch(
      () => {},
    );
  }
  if (res.headersSent) return;
  res.status(status).json({ error: err.message ?? "Internal server error" });
});

export default app;
