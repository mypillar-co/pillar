import { Router, type Request, type Response } from "express";
import { db, organizationsTable, domainsTable, notificationsTable } from "@workspace/db";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import https from "https";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";
import {
  checkAvailability,
  registerDomain,
  createCnameRecord,
  renewDomain as porkbunRenewDomain,
  isConfigured as registrarConfigured,
  DOMAIN_ADDON_PRICE_CENTS,
  DOMAIN_ADDON_LABEL,
  FREE_DOMAIN_TIERS,
} from "../porkbun";
import { promises as dns } from "dns";

const router = Router();

const PILLAR_CNAME_TARGET = "proxy.mypillar.co";
// Pillar's ingress IP address — used for A-record verification and BYOD instructions
const PILLAR_PROXY_IP = process.env.PILLAR_PROXY_IP ?? "76.76.21.21";

async function resolveOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
}

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

/**
 * Check if a domain's DNS points to Pillar's infrastructure.
 * Verifies CNAME (for www/sub) and A-record (for apex) lookups.
 * Checks both the bare domain and www.<domain>.
 */
async function checkDnsLive(domain: string): Promise<boolean> {
  const stewardTarget = PILLAR_CNAME_TARGET.toLowerCase();
  const hostnamesToCheck = [domain, `www.${domain}`];
  for (const h of hostnamesToCheck) {
    // Try CNAME first
    try {
      const cnames = await dns.resolveCname(h);
      const hit = cnames.some(r => {
        const n = r.toLowerCase().replace(/\.$/, "");
        return n === stewardTarget || n.endsWith(`.${stewardTarget}`);
      });
      if (hit) return true;
    } catch {
      // not a CNAME — try A record for apex
    }
    // Try A record (apex / ALIAS resolved)
    try {
      const addresses = await dns.resolve4(h);
      if (addresses.includes(PILLAR_PROXY_IP)) return true;
    } catch {
      // not resolved yet
    }
  }
  return false;
}

/** Check if a domain serves a valid HTTPS response (certificate is provisioned). */
function checkSslLive(domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: domain, port: 443, path: "/", method: "HEAD", timeout: 8000, rejectUnauthorized: true },
      () => resolve(true)
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/** Create a persisted in-app notification for an org. */
async function createNotification(orgId: string, type: string, title: string, body: string, metadata?: object): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      orgId,
      type,
      title,
      body,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    logger.error({ err, orgId, type }, "Failed to create notification");
  }
}

const ALL_ALLOWED_TLDS = ["com", "org", "net", "app", "info", "us", "io"];
const FREE_ALLOWED_TLDS = ["com", "org", "net", "us"];

function validateDomain(domain: string, allowedTlds: string[] = ALL_ALLOWED_TLDS): { valid: boolean; error?: string } {
  const parts = domain.split(".");
  if (parts.length < 2) return { valid: false, error: "Please enter a full domain like 'myorg.com'" };
  const tld = parts[parts.length - 1];
  if (!allowedTlds.includes(tld)) {
    return { valid: false, error: `Supported extensions: ${allowedTlds.map(t => `.${t}`).join(", ")}` };
  }
  const sld = parts.slice(0, -1).join(".");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(sld) && !/^[a-z0-9]$/.test(sld)) {
    return { valid: false, error: "Domain can only contain letters, numbers, and hyphens" };
  }
  if (sld.length < 2 || sld.length > 63) {
    return { valid: false, error: "Domain label must be between 2 and 63 characters" };
  }
  return { valid: true };
}

// ─── GET /domains ──────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const domains = await db.select().from(domainsTable).where(eq(domainsTable.orgId, org.id));
  const subdomain = org.slug ? `${org.slug}.mypillar.co` : null;
  res.json({ domains, subdomain, cnameTarget: PILLAR_CNAME_TARGET, proxyIp: PILLAR_PROXY_IP });
});

// ─── POST /domains/check ───────────────────────────────────────
router.post("/check", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { domain: rawDomain } = req.body as { domain?: string };
  if (!rawDomain) { res.status(400).json({ error: "domain is required" }); return; }

  const domain = normalizeDomain(rawDomain);
  const isFreeForTier = org.tier ? FREE_DOMAIN_TIERS.has(org.tier) : false;
  const allowedTlds = isFreeForTier ? FREE_ALLOWED_TLDS : ALL_ALLOWED_TLDS;
  const validation = validateDomain(domain, allowedTlds);
  if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

  const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain));
  if (existing) {
    res.json({ domain, available: false, reason: "already registered through Pillar" });
    return;
  }

  const result = await checkAvailability(domain);

  res.json({
    ...result,
    isFreeForTier,
    price: isFreeForTier ? 0 : DOMAIN_ADDON_PRICE_CENTS / 100,
    priceFormatted: isFreeForTier ? "Included in your plan" : "$24/year",
    allowedTlds,
  });
});

// ─── POST /domains/checkout ─────────────────────────────────── (Tier 1 — $24/yr add-on)
router.post("/checkout", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { domain: rawDomain } = req.body as { domain?: string };
  if (!rawDomain) { res.status(400).json({ error: "domain is required" }); return; }

  const domain = normalizeDomain(rawDomain);
  const validation = validateDomain(domain);
  if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

  // One domain per org (MVP constraint)
  const [existingForOrg] = await db.select().from(domainsTable).where(eq(domainsTable.orgId, org.id));
  if (existingForOrg) {
    res.status(409).json({ error: "Your organization already has a domain registered. Remove it first to add a new one." });
    return;
  }

  const [existingDomain] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain));
  if (existingDomain) { res.status(409).json({ error: "That domain is already registered in Pillar." }); return; }

  const isFreeForTier = org.tier ? FREE_DOMAIN_TIERS.has(org.tier) : false;
  if (isFreeForTier) {
    res.status(400).json({ error: "Use /api/domains/claim for domains included with your plan." });
    return;
  }

  if (!org.stripeCustomerId) {
    res.status(400).json({ error: "Please subscribe to a plan before purchasing a domain." });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"]}`;

  const session = await stripe.checkout.sessions.create({
    customer: org.stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: DOMAIN_ADDON_LABEL,
          description: `Custom domain: ${domain} — 1 year registration`,
        },
        unit_amount: DOMAIN_ADDON_PRICE_CENTS,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: `${origin}/dashboard/domains?domain_success={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/domains`,
    metadata: { orgId: org.id, domain, type: "domain_addon" },
  });

  await db.insert(domainsTable).values({
    orgId: org.id,
    domain,
    tld: domain.split(".").pop() ?? "com",
    status: "pending_payment",
    stripePaymentId: session.id,
  }).onConflictDoNothing();

  res.json({ url: session.url });
});

// ─── POST /domains/confirm ──────────────────────────────────── (verify Stripe payment & register)
router.post("/confirm", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

  const [domainRecord] = await db
    .select()
    .from(domainsTable)
    .where(and(eq(domainsTable.orgId, org.id), eq(domainsTable.stripePaymentId, sessionId)));

  if (!domainRecord) { res.status(404).json({ error: "Domain record not found for this session." }); return; }
  if (domainRecord.status !== "pending_payment") {
    res.json({ domain: domainRecord, message: "Already processed." });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      res.status(400).json({ error: "Payment not yet confirmed. Please wait a moment and try again." });
      return;
    }
  } catch (err) {
    logger.error({ err, sessionId }, "Could not verify Stripe session");
    res.status(500).json({ error: "Could not verify payment. Please contact support." });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const user = req.user!;
  const regResult = await registerDomain(domainRecord.domain, {
    firstName: user.firstName ?? "Admin",
    lastName: user.lastName ?? "User",
    email: user.email ?? "admin@example.com",
    orgName: org.name,
  });

  logger.info({ domain: domainRecord.domain, regResult }, "Domain registration after payment");

  // Automatically create CNAME record pointing to Pillar proxy
  let dnsProvisioned = false;
  if (regResult.success) {
    const dnsResult = await createCnameRecord(domainRecord.domain, PILLAR_CNAME_TARGET);
    dnsProvisioned = dnsResult.success;
    logger.info({ domain: domainRecord.domain, dnsResult }, "Auto DNS record provisioning");
  }

  const [updated] = await db.update(domainsTable).set({
    status: "pending_manual",
    dnsStatus: dnsProvisioned ? "propagating" : "pending",
    purchasedAt: now,
    expiresAt,
    registrarRef: regResult.registrarRef ?? null,
    updatedAt: new Date(),
  }).where(eq(domainsTable.id, domainRecord.id)).returning();

  res.json({
    domain: updated,
    message: dnsProvisioned
      ? "Payment confirmed — domain registered and DNS configured automatically. It may take up to 48 hours to propagate."
      : "Payment confirmed — domain registration is being processed. Set up your DNS records below.",
  });
});

// ─── POST /domains/claim ────────────────────────────────────── (Tier 1a+ — free domain)
router.post("/claim", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const isFreeForTier = org.tier ? FREE_DOMAIN_TIERS.has(org.tier) : false;
  if (!isFreeForTier) {
    res.status(403).json({ error: "Domain is not included in your plan. Upgrade or purchase as an add-on." });
    return;
  }

  const { domain: rawDomain } = req.body as { domain?: string };
  if (!rawDomain) { res.status(400).json({ error: "domain is required" }); return; }

  const domain = normalizeDomain(rawDomain);
  const validation = validateDomain(domain, FREE_ALLOWED_TLDS);
  if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

  const [existingForOrg] = await db.select().from(domainsTable).where(eq(domainsTable.orgId, org.id));
  if (existingForOrg) {
    res.status(409).json({ error: "Your organization already has a domain registered." });
    return;
  }

  const [existingDomain] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain));
  if (existingDomain) { res.status(409).json({ error: "Domain already registered" }); return; }

  const availability = await checkAvailability(domain);
  if (!availability.available) {
    res.status(409).json({ error: "That domain is not available for registration." });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const [inserted] = await db.insert(domainsTable).values({
    orgId: org.id,
    domain,
    tld: domain.split(".").pop() ?? "com",
    status: "pending",
    dnsStatus: "pending",
    purchasedAt: now,
    expiresAt,
    registrar: "porkbun",
  }).returning();

  const claimUser = req.user!;
  const regResult = await registerDomain(domain, {
    firstName: claimUser.firstName ?? "Admin",
    lastName: claimUser.lastName ?? "User",
    email: claimUser.email ?? "",
    orgName: org.name,
  });

  if (regResult.success) {
    // Automatically create CNAME record pointing to Pillar proxy
    const dnsResult = await createCnameRecord(domain, PILLAR_CNAME_TARGET);
    const dnsProvisioned = dnsResult.success;
    logger.info({ domain, dnsResult }, "Auto DNS record provisioning after claim");

    const [finalDomain] = await db.update(domainsTable)
      .set({
        status: "pending_manual",
        dnsStatus: dnsProvisioned ? "propagating" : "pending",
        registrarRef: regResult.registrarRef ?? null,
      })
      .where(eq(domainsTable.id, inserted.id))
      .returning();

    res.json({
      domain: finalDomain,
      message: dnsProvisioned
        ? `${domain} has been registered and DNS configured automatically! It may take up to 48 hours to propagate.`
        : `${domain} has been registered! Set up your DNS records below to go live.`,
    });
  } else {
    await db.update(domainsTable).set({ status: "pending_manual" }).where(eq(domainsTable.id, inserted.id));
    logger.warn({ domain, error: regResult.error }, "Domain registration queued for manual processing");
    res.json({
      domain: { ...inserted, status: "pending_manual" },
      message: "Domain reserved — registration processing. You'll receive confirmation within 24 hours.",
    });
  }
});

// ─── POST /domains/external ─────────────────────────────────── (bring your own domain)
router.post("/external", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!org.tier) { res.status(403).json({ error: "Active subscription required to add a custom domain." }); return; }

  const { domain: rawDomain } = req.body as { domain?: string };
  if (!rawDomain) { res.status(400).json({ error: "domain is required" }); return; }

  const domain = normalizeDomain(rawDomain);
  const validation = validateDomain(domain);
  if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

  const [existingForOrg] = await db.select().from(domainsTable).where(eq(domainsTable.orgId, org.id));
  if (existingForOrg) {
    res.status(409).json({ error: "Your organization already has a domain. Remove it first to add a new one." });
    return;
  }

  // Global uniqueness check — a domain can only be claimed by one org
  const [existingGlobal] = await db.select({ id: domainsTable.id }).from(domainsTable).where(eq(domainsTable.domain, domain));
  if (existingGlobal) {
    res.status(409).json({ error: "This domain is already registered with another organization." });
    return;
  }

  const tld = domain.split(".").pop() ?? "com";
  const [inserted] = await db.insert(domainsTable).values({
    orgId: org.id,
    domain,
    tld,
    status: "pending_manual",
    dnsStatus: "pending",
    registrar: "external",
    isExternal: true,
  }).returning();

  res.status(201).json({
    domain: inserted,
    cnameTarget: PILLAR_CNAME_TARGET,
    message: "Domain added. Configure your DNS records to connect it to your Pillar site.",
  });
});

// ─── POST /domains/:id/verify ───────────────────────────────── (check DNS propagation)
router.post("/:id/verify", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const domainId = String(req.params.id);
  const [domainRecord] = await db
    .select()
    .from(domainsTable)
    .where(and(eq(domainsTable.id, domainId), eq(domainsTable.orgId, org.id)));

  if (!domainRecord) { res.status(404).json({ error: "Domain not found" }); return; }

  // Use shared DNS check: verifies CNAME→target and A-record→proxyIp for both
  // bare domain and www.<domain>, so apex and www setups both work.
  const dnsLive = await checkDnsLive(domainRecord.domain).catch(() => false);
  const dnsStatus = dnsLive ? "live" : (domainRecord.dnsStatus === "live" ? "live" : "propagating");

  // SSL provisioning: moves to "provisioning" when DNS is first detected live,
  // and to "active" once the certificate has had time to provision (24h later).
  let newSslStatus = domainRecord.sslStatus ?? "pending";
  if (dnsLive) {
    if (newSslStatus === "pending") {
      newSslStatus = "provisioning";
    }
  }

  const newStatus = dnsLive ? "active" : (domainRecord.status ?? "pending_manual");
  const [updated] = await db.update(domainsTable).set({
    dnsStatus,
    sslStatus: newSslStatus,
    status: newStatus,
    updatedAt: new Date(),
  }).where(eq(domainsTable.id, domainRecord.id)).returning();

  res.json({
    domain: updated,
    dnsLive,
    message: dnsLive
      ? "DNS is live! Your domain is now connected to Pillar. SSL provisioning may take up to 24 hours."
      : "DNS is still propagating. This can take up to 48 hours. If your domain uses ALIAS/ANAME records for apex domains, contact support to verify.",
  });
});

// ─── PUT /domains/:id ───────────────────────────────────────── (update auto-renew)
router.put("/:id", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const putId = String(req.params.id);
  const [domainRecord] = await db
    .select()
    .from(domainsTable)
    .where(and(eq(domainsTable.id, putId), eq(domainsTable.orgId, org.id)));

  if (!domainRecord) { res.status(404).json({ error: "Domain not found" }); return; }

  const { autoRenew } = req.body as { autoRenew?: boolean };
  if (typeof autoRenew !== "boolean") { res.status(400).json({ error: "autoRenew must be a boolean" }); return; }

  const [updated] = await db.update(domainsTable)
    .set({ autoRenew, updatedAt: new Date() })
    .where(eq(domainsTable.id, domainRecord.id))
    .returning();

  res.json(updated);
});

// ─── DELETE /domains/:id ─────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const id = String(req.params.id);
  const [domain] = await db.select().from(domainsTable).where(eq(domainsTable.id, id));

  if (!domain || domain.orgId !== org.id) {
    res.status(404).json({ error: "Domain not found" }); return;
  }

  if (domain.status === "active") {
    res.status(400).json({ error: "Active domains cannot be removed. Contact support to release your domain." }); return;
  }

  await db.delete(domainsTable).where(eq(domainsTable.id, id));
  res.json({ ok: true });
});

// ─── GET /domains/registrar-status ───────────────────────────
router.get("/registrar-status", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ configured: registrarConfigured(), cnameTarget: PILLAR_CNAME_TARGET });
});

// ─── Automatic DNS Propagation Poller (called from scheduler) ──────
// Polls domains in pending/propagating state and transitions them to live
// automatically — users don't need to click "Check DNS".
export async function pollDnsPropagation(): Promise<void> {
  // Include:
  // - propagating: domains in propagation (auto + BYOD after first verify)
  // - pending + active: Porkbun-registered domains DNS not yet confirmed
  // - pending + pending_manual: BYOD/external domains waiting for DNS configuration
  //   This ensures BYOD domains are automatically checked without requiring manual verify
  const pendingDomains = await db
    .select({ domain: domainsTable, org: organizationsTable })
    .from(domainsTable)
    .innerJoin(organizationsTable, eq(domainsTable.orgId, organizationsTable.id))
    .where(
      or(
        eq(domainsTable.dnsStatus, "propagating"),
        eq(domainsTable.dnsStatus, "pending")
      )
    );

  for (const { domain: d, org } of pendingDomains) {
    try {
      // Use shared checkDnsLive: verifies CNAME→target and A-record→proxyIp
      // for both bare domain and www.<domain>.
      const dnsLive = await checkDnsLive(d.domain).catch(() => false);

      if (dnsLive) {
        await db.update(domainsTable).set({
          dnsStatus: "live",
          sslStatus: "provisioning",
          status: "active",
          updatedAt: new Date(),
        }).where(eq(domainsTable.id, d.id));

        await createNotification(
          org.id,
          "domain_live",
          `Domain is live: ${d.domain}`,
          `Your domain ${d.domain} is now pointing to Pillar. SSL certificate provisioning has started and will complete within 24 hours.`,
          { domain: d.domain }
        );
        logger.info({ domain: d.domain, orgId: org.id }, "DNS auto-poller: domain went live");
      }
    } catch (err) {
      logger.warn({ err, domain: d.domain }, "DNS auto-poller: check failed");
    }
  }
}

// ─── SSL Provisioning Check Job (called from scheduler) ─────────
// Checks domains that are DNS-live but SSL is still provisioning.
// Makes a real HTTPS request; on success → sslStatus = "active".
export async function checkSslProvisioning(): Promise<void> {
  const provisioningDomains = await db
    .select({ domain: domainsTable, org: organizationsTable })
    .from(domainsTable)
    .innerJoin(organizationsTable, eq(domainsTable.orgId, organizationsTable.id))
    .where(
      and(
        eq(domainsTable.dnsStatus, "live"),
        eq(domainsTable.sslStatus, "provisioning")
      )
    );

  for (const { domain: d, org } of provisioningDomains) {
    try {
      const sslLive = await checkSslLive(d.domain);
      if (sslLive) {
        await db.update(domainsTable).set({ sslStatus: "active", updatedAt: new Date() }).where(eq(domainsTable.id, d.id));
        await createNotification(
          org.id,
          "ssl_active",
          `SSL is now active: ${d.domain}`,
          `Your SSL certificate for ${d.domain} has been provisioned. Your site is now reachable over HTTPS.`,
          { domain: d.domain }
        );
        logger.info({ domain: d.domain, orgId: org.id }, "SSL provisioning confirmed via HTTPS check");
      }
    } catch (err) {
      logger.warn({ err, domain: d.domain }, "SSL check failed — still provisioning");
    }
  }
}

// ─── Domain Renewal Job (called from scheduler) ───────────────
export async function checkAndRenewDomains(): Promise<void> {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const expiringDomains = await db
    .select({ domain: domainsTable, org: organizationsTable })
    .from(domainsTable)
    .innerJoin(organizationsTable, eq(domainsTable.orgId, organizationsTable.id))
    .where(
      and(
        lte(domainsTable.expiresAt, thirtyDaysFromNow),
        or(
          isNull(domainsTable.renewalNotifiedAt),
          lte(domainsTable.renewalNotifiedAt, sevenDaysAgo)
        )
      )
    );

  for (const { domain: d, org } of expiringDomains) {
    if (!d.expiresAt) continue;
    const daysLeft = Math.ceil((d.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (d.autoRenew && !d.isExternal && org.stripeCustomerId) {
      try {
        // Step 1: Renew at registrar FIRST — before any billing.
        // This ensures the domain is actually renewed before charging the customer.
        const renewResult = await porkbunRenewDomain(d.domain);
        if (!renewResult.success) {
          logger.error({ domain: d.domain, orgId: org.id, error: renewResult.error }, "Registrar renewal failed — skipping Stripe charge");
          await createNotification(
            org.id,
            "domain_renewal_failed",
            `Auto-renewal failed: ${d.domain}`,
            `We were unable to renew your domain ${d.domain} with the registrar. No charge was made. Please contact support.`,
            { domain: d.domain }
          );
          await db.update(domainsTable)
            .set({ renewalNotifiedAt: now, updatedAt: new Date() })
            .where(eq(domainsTable.id, d.id));
          continue;
        }

        // Step 2: Registrar renewal succeeded — now charge Stripe.
        const stripe = await getUncachableStripeClient();
        let chargeSucceeded = false;
        try {
          const invoice = await stripe.invoices.create({
            customer: org.stripeCustomerId,
            auto_advance: false,
            collection_method: "charge_automatically",
            description: `Auto-renewal: ${d.domain} — 1 year`,
            metadata: { domainId: d.id, domain: d.domain },
          });
          await stripe.invoiceItems.create({
            customer: org.stripeCustomerId,
            invoice: invoice.id,
            amount: DOMAIN_ADDON_PRICE_CENTS,
            currency: "usd",
            description: `${DOMAIN_ADDON_LABEL}: ${d.domain}`,
          });
          await stripe.invoices.finalizeInvoice(invoice.id);
          await stripe.invoices.pay(invoice.id);
          chargeSucceeded = true;
        } catch (stripeErr) {
          // Registrar renewal succeeded but Stripe charge failed.
          // Domain IS renewed — extend DB record but log critically for manual follow-up.
          logger.error({ stripeErr, domain: d.domain, orgId: org.id }, "CRITICAL: Registrar renewed but Stripe charge failed — domain extended, requires manual billing follow-up");
          await createNotification(
            org.id,
            "domain_renewal_failed",
            `Billing issue: ${d.domain}`,
            `Your domain ${d.domain} was renewed with the registrar, but we could not charge your payment method. Please update your payment information.`,
            { domain: d.domain }
          );
        }

        // Step 3: Extend domain expiry in DB (domain IS renewed regardless of billing result)
        const newExpiresAt = new Date(d.expiresAt);
        newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

        await db.update(domainsTable).set({
          expiresAt: newExpiresAt,
          renewalNotifiedAt: now,
          status: "active",
          updatedAt: new Date(),
        }).where(eq(domainsTable.id, d.id));

        if (chargeSucceeded) {
          await createNotification(
            org.id,
            "domain_renewed",
            `Domain renewed: ${d.domain}`,
            `Your domain ${d.domain} has been renewed for another year and your payment method was charged.`,
            { domain: d.domain }
          );
        }

        logger.info({ domain: d.domain, orgId: org.id, chargeSucceeded }, "Domain auto-renewed");
      } catch (err) {
        logger.error({ err, domain: d.domain, orgId: org.id }, "Domain auto-renewal failed unexpectedly");
        await db.update(domainsTable)
          .set({ renewalNotifiedAt: now, updatedAt: new Date() })
          .where(eq(domainsTable.id, d.id));
      }
    } else {
      // No auto-renew or external domain — send expiry warning notification
      if (daysLeft <= 30 && !d.renewalNotifiedAt) {
        const urgentMsg = daysLeft <= 0
          ? `Your domain ${d.domain} has expired. Please renew it immediately to restore your site.`
          : daysLeft <= 7
          ? `Your domain ${d.domain} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Renew now to avoid losing access.`
          : `Your domain ${d.domain} expires in ${daysLeft} days. Consider enabling auto-renew or renewing manually.`;
        const notifType = daysLeft <= 0 ? "domain_expired" : "domain_expiry_warning";
        const notifTitle = daysLeft <= 0 ? `Domain expired: ${d.domain}` : `Domain expiring: ${d.domain}`;
        await createNotification(org.id, notifType, notifTitle, urgentMsg, { domain: d.domain, daysLeft });
      }
      logger.warn(
        { domain: d.domain, daysLeft, orgId: org.id, isExternal: d.isExternal, autoRenew: d.autoRenew },
        daysLeft <= 0
          ? "Domain has expired — action required"
          : `Domain expires in ${daysLeft} days — notification queued`
      );
      await db.update(domainsTable)
        .set({ renewalNotifiedAt: now, updatedAt: new Date() })
        .where(eq(domainsTable.id, d.id));
    }
  }
}

export default router;
