import { Router, type Request, type Response } from "express";
import { db, organizationsTable, domainsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import {
  checkAvailability,
  registerDomain,
  isConfigured as registrarConfigured,
  DOMAIN_ADDON_PRICE_CENTS,
  DOMAIN_ADDON_LABEL,
  FREE_DOMAIN_TIERS,
} from "../namecheap";

const router = Router();

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
  const allowedTlds = ["com", "org", "net", "app", "info", "us"];
  if (!allowedTlds.includes(tld)) {
    return { valid: false, error: `Only ${allowedTlds.join(", ")} domains are supported` };
  }
  const sld = parts.slice(0, -1).join(".");
  if (!/^[a-z0-9-]+$/.test(sld)) {
    return { valid: false, error: "Domain can only contain letters, numbers, and hyphens" };
  }
  if (sld.length < 2 || sld.length > 63) {
    return { valid: false, error: "Domain must be between 2 and 63 characters" };
  }
  return { valid: true };
}

// GET /api/domains — list org's domains
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const domains = await db.select().from(domainsTable).where(eq(domainsTable.orgId, org.id));
  res.json({ domains });
});

// POST /api/domains/check — check domain availability
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
    price: isFreeForTier ? 0 : DOMAIN_ADDON_PRICE_CENTS,
    priceFormatted: isFreeForTier ? "Included in your plan" : "$24/year",
  });
});

// POST /api/domains/checkout — initiate domain purchase (Tier 1 add-on)
router.post("/checkout", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { domain: rawDomain } = req.body as { domain?: string };
  if (!rawDomain) { res.status(400).json({ error: "domain is required" }); return; }

  const domain = normalizeDomain(rawDomain);
  const validation = validateDomain(domain);
  if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

  const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain));
  if (existing) { res.status(409).json({ error: "Domain already registered" }); return; }

  const isFreeForTier = org.tier ? FREE_DOMAIN_TIERS.has(org.tier) : false;

  if (isFreeForTier) {
    res.status(400).json({ error: "Use /api/domains/claim for included domains" });
    return;
  }

  if (!org.stripeCustomerId) {
    res.status(400).json({ error: "Please subscribe to a plan before purchasing a domain" });
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
    success_url: `${origin}/dashboard/domains?domain=${encodeURIComponent(domain)}&status=success`,
    cancel_url: `${origin}/dashboard/domains?status=cancelled`,
    metadata: { orgId: org.id, domain, type: "domain_addon" },
  });

  // Record domain as pending payment
  await db.insert(domainsTable).values({
    orgId: org.id,
    domain,
    tld: domain.split(".").pop() ?? "com",
    status: "pending_payment",
    stripePaymentId: session.id,
  }).onConflictDoNothing();

  res.json({ url: session.url });
});

// POST /api/domains/claim — claim a free included domain (Tier 1a+)
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

  const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain));
  if (existing) { res.status(409).json({ error: "Domain already registered" }); return; }

  const availability = await checkAvailability(domain);
  if (!availability.available) {
    res.status(409).json({ error: "That domain is not available" });
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
    purchasedAt: now,
    expiresAt,
  }).returning();

  const regResult = await registerDomain(domain, {
    firstName: req.user?.firstName ?? "Admin",
    lastName: req.user?.lastName ?? "User",
    email: req.user?.email ?? "",
    orgName: org.name,
  });

  if (regResult.success) {
    await db.update(domainsTable)
      .set({ status: "active", registrarRef: regResult.registrarRef ?? null })
      .where(eq(domainsTable.id, inserted.id));
    res.json({ domain: { ...inserted, status: "active", registrarRef: regResult.registrarRef } });
  } else {
    await db.update(domainsTable)
      .set({ status: "pending_manual" })
      .where(eq(domainsTable.id, inserted.id));
    req.log?.warn({ domain, error: regResult.error }, "Domain registration queued for manual processing");
    res.json({
      domain: { ...inserted, status: "pending_manual" },
      message: "Domain reserved — registration processing. You'll receive confirmation within 24 hours.",
    });
  }
});

// DELETE /api/domains/:id — remove a pending/failed domain record
router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const id = String(req.params.id);
  const [domain] = await db.select().from(domainsTable)
    .where(eq(domainsTable.id, id));

  if (!domain || domain.orgId !== org.id) {
    res.status(404).json({ error: "Domain not found" }); return;
  }

  if (domain.status === "active") {
    res.status(400).json({ error: "Active domains cannot be removed" }); return;
  }

  await db.delete(domainsTable).where(eq(domainsTable.id, id));
  res.json({ ok: true });
});

// GET /api/domains/registrar-status — whether Namecheap is configured
router.get("/registrar-status", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ configured: registrarConfigured() });
});

export default router;
