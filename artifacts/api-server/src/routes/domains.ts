import { Router, type Request, type Response } from "express";
import { db, organizationsTable, domainsTable } from "@workspace/db";
import { eq, and, lte, isNull, or } from "drizzle-orm";
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

const STEWARD_CNAME_TARGET = "proxy.steward.app";

async function resolveOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
}

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function validateDomain(domain: string): { valid: boolean; error?: string } {
  const parts = domain.split(".");
  if (parts.length < 2) return { valid: false, error: "Please enter a full domain like 'myorg.com'" };
  const tld = parts[parts.length - 1];
  const allowedTlds = ["com", "org", "net", "app", "info", "us", "io"];
  if (!allowedTlds.includes(tld)) {
    return { valid: false, error: `Supported TLDs: ${allowedTlds.join(", ")}` };
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
  const subdomain = org.slug ? `${org.slug}.steward.app` : null;
  res.json({ domains, subdomain, cnameTarget: STEWARD_CNAME_TARGET });
});

// ─── POST /domains/check ───────────────────────────────────────
router.post("/check", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { domain: rawDomain } = req.body as { domain?: string };
  if (!rawDomain) { res.status(400).json({ error: "domain is required" }); return; }

  const domain = normalizeDomain(rawDomain);
  const validation = validateDomain(domain);
  if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

  const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain));
  if (existing) {
    res.json({ domain, available: false, reason: "already registered through Steward" });
    return;
  }

  const result = await checkAvailability(domain);
  const isFreeForTier = org.tier ? FREE_DOMAIN_TIERS.has(org.tier) : false;

  res.json({
    ...result,
    isFreeForTier,
    price: isFreeForTier ? 0 : DOMAIN_ADDON_PRICE_CENTS / 100,
    priceFormatted: isFreeForTier ? "Included in your plan" : "$24/year",
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
  if (existingDomain) { res.status(409).json({ error: "That domain is already registered in Steward." }); return; }

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

  // Automatically create CNAME record pointing to Steward proxy
  let dnsProvisioned = false;
  if (regResult.success) {
    const dnsResult = await createCnameRecord(domainRecord.domain, STEWARD_CNAME_TARGET);
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
  const validation = validateDomain(domain);
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
    // Automatically create CNAME record pointing to Steward proxy
    const dnsResult = await createCnameRecord(domain, STEWARD_CNAME_TARGET);
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
    cnameTarget: STEWARD_CNAME_TARGET,
    message: "Domain added. Configure your DNS records to connect it to your Steward site.",
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

  let dnsLive = false;
  let dnsStatus = domainRecord.dnsStatus ?? "pending";

  try {
    // Only confirm DNS is live if the CNAME resolves exactly to the Steward proxy target.
    // A-record fallback is intentionally omitted — a domain resolving to any IP address
    // does NOT guarantee it points to Steward's infrastructure.
    const cnames = await dns.resolveCname(domainRecord.domain);
    const stewardTarget = STEWARD_CNAME_TARGET.toLowerCase();
    dnsLive = cnames.some(r => {
      const normalized = r.toLowerCase().replace(/\.$/, "");
      return normalized === stewardTarget || normalized.endsWith(`.${stewardTarget}`);
    });
    dnsStatus = dnsLive ? "live" : "propagating";
  } catch {
    // CNAME lookup failed — record hasn't propagated yet
    dnsStatus = domainRecord.dnsStatus === "live" ? "live" : "propagating";
  }

  const newStatus = dnsLive ? "active" : domainRecord.status;
  const [updated] = await db.update(domainsTable).set({
    dnsStatus,
    sslStatus: dnsLive ? "active" : (domainRecord.sslStatus ?? "pending"),
    status: newStatus ?? "pending_manual",
    updatedAt: new Date(),
  }).where(eq(domainsTable.id, domainRecord.id)).returning();

  res.json({
    domain: updated,
    dnsLive,
    message: dnsLive
      ? "DNS is live! Your domain is now connected to Steward."
      : "DNS is still propagating. This can take up to 48 hours. Check back later.",
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
  res.json({ configured: registrarConfigured(), cnameTarget: STEWARD_CNAME_TARGET });
});

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
        // 1. Charge via Stripe
        const stripe = await getUncachableStripeClient();
        const invoice = await stripe.invoices.create({
          customer: org.stripeCustomerId,
          auto_advance: false,
          collection_method: "charge_automatically",
          description: `Auto-renewal: ${d.domain} — 1 year`,
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

        // 2. Renew at registrar
        const renewResult = await porkbunRenewDomain(d.domain);
        if (!renewResult.success) {
          logger.error({ domain: d.domain, orgId: org.id, error: renewResult.error }, "Registrar renewal failed after Stripe charge — manual intervention required");
        }

        const newExpiresAt = new Date(d.expiresAt);
        newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

        await db.update(domainsTable).set({
          expiresAt: newExpiresAt,
          renewalNotifiedAt: now,
          status: "active",
          updatedAt: new Date(),
        }).where(eq(domainsTable.id, d.id));

        logger.info({ domain: d.domain, orgId: org.id, registrarRenewed: renewResult.success }, "Domain auto-renewed");
      } catch (err) {
        logger.error({ err, domain: d.domain, orgId: org.id }, "Domain auto-renewal failed");
        await db.update(domainsTable)
          .set({ renewalNotifiedAt: now, updatedAt: new Date() })
          .where(eq(domainsTable.id, d.id));
      }
    } else {
      // Log expiry warning (displayed as in-app banner when user visits Domains page)
      logger.warn(
        { domain: d.domain, daysLeft, orgId: org.id, isExternal: d.isExternal, autoRenew: d.autoRenew },
        daysLeft <= 0
          ? "Domain has expired — action required"
          : `Domain expires in ${daysLeft} days — renewal notification recorded`
      );
      await db.update(domainsTable)
        .set({ renewalNotifiedAt: now, updatedAt: new Date() })
        .where(eq(domainsTable.id, d.id));
    }
  }
}

export default router;
