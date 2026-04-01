import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "./middlewares/authMiddleware";
import { csrfMiddleware } from "./lib/csrf";
import { sendErrorAlert } from "./lib/errorAlert";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { db, sitesTable, domainsTable, organizationsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

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
app.post("/api/auth/logout", authLimiter);
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

// Shared site HTML response helper
function sendSiteHtml(res: express.Response, html: string): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'none'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const injected = html.includes("</body>")
    ? html.replace("</body>", `${POWERED_BY_FOOTER}</body>`)
    : html + POWERED_BY_FOOTER;
  res.send(injected);
}

const SITE_NOT_FOUND_HTML = `<!DOCTYPE html><html><head><title>Site Not Found</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#94a3b8;text-align:center}.box{max-width:400px;padding:2rem}.title{color:#fff;font-size:1.5rem;margin-bottom:.5rem}</style></head><body><div class="box"><div class="title">Site not found</div><p>This organization hasn't published their site yet.</p><a href="/" style="color:#f59e0b;text-decoration:none">← Pillar Home</a></div></body></html>`;

// Public site renderer — serves generated HTML at /sites/:slug (by slug path)
app.get("/sites/:slug", async (req, res) => {
  const { slug } = req.params as { slug: string };
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgSlug, slug));
  if (!site || site.status !== "published" || !site.generatedHtml) {
    res.status(404).send(SITE_NOT_FOUND_HTML);
    return;
  }
  sendSiteHtml(res, site.generatedHtml);
});

// Host-based site routing — serves sites at <slug>.mypillar.co or registered custom domains
// This middleware runs before the fallback so API paths (/api/*) are not intercepted.
app.use(async (req, res, next) => {
  // Only intercept non-API, non-static paths
  if (req.path.startsWith("/api") || req.path.startsWith("/sites")) {
    return next();
  }

  const rawHost = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as string;
  const host = rawHost.split(":")[0].toLowerCase();

  if (!host) return next();

  let orgSlug: string | null = null;

  // Pattern 1: <slug>.mypillar.co subdomain
  const subdomainMatch = host.match(/^([a-z0-9-]+)\.steward\.app$/);
  if (subdomainMatch) {
    orgSlug = subdomainMatch[1];
  }

  if (orgSlug) {
    // Serve via slug
    const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgSlug, orgSlug));
    if (site?.status === "published" && site.generatedHtml) {
      sendSiteHtml(res, site.generatedHtml);
      return;
    }
    // Subdomain exists but site not published yet
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
        sendSiteHtml(res, site.generatedHtml);
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
