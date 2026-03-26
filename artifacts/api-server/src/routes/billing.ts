import { Router, type IRouter, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { TIERS, getTierById } from "../tiers";

const router: IRouter = Router();

// GET /api/tiers — public list of subscription tiers
router.get("/tiers", async (_req: Request, res: Response) => {
  // Look up live Stripe price IDs from the synced stripe.prices table
  let tiers = TIERS;
  try {
    const priceRows = await db.execute(sql`
      SELECT p.id as price_id, p.metadata->>'tierId' as tier_id
      FROM stripe.prices p
      WHERE p.active = true AND p.metadata->>'tierId' IS NOT NULL
    `);
    const priceMap: Record<string, string> = {};
    for (const row of priceRows.rows as Array<{ price_id: string; tier_id: string }>) {
      priceMap[row.tier_id] = row.price_id;
    }
    tiers = TIERS.map((t) => ({
      ...t,
      stripePriceId: priceMap[t.id] ?? null,
    }));
  } catch {
    // stripe schema may not exist yet; return tiers without price IDs
  }
  res.json({ tiers });
});

// POST /api/billing/checkout — create a Stripe Checkout session
router.post("/billing/checkout", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { tierId } = req.body as { tierId?: string };
  const tier = tierId ? getTierById(tierId) : undefined;
  if (!tier) {
    res.status(400).json({ error: "Invalid tier" });
    return;
  }

  if (!tier.stripePriceId) {
    res.status(400).json({ error: "This tier is not yet available for purchase. Please contact support." });
    return;
  }

  const userId = req.user.id;
  const userEmail = req.user.email ?? undefined;

  // Ensure the org exists and get/create Stripe customer
  let [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));

  const stripe = await getUncachableStripeClient();

  let customerId = org?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { userId },
    });
    customerId = customer.id;
    if (org) {
      await db
        .update(organizationsTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(organizationsTable.userId, userId));
    }
  }

  const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"]}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: tier.stripePriceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${origin}/?billing=success&tier=${tierId}`,
    cancel_url: `${origin}/?billing=cancelled`,
    metadata: { userId, tierId },
  });

  res.json({ url: session.url });
});

// POST /api/billing/portal — create a Stripe Customer Portal session
router.post("/billing/portal", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user.id;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));

  if (!org?.stripeCustomerId) {
    res.status(400).json({ error: "No billing account found. Please subscribe first." });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"]}`;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${origin}/`,
  });

  res.json({ url: portalSession.url });
});

// GET /api/billing/subscription — get current subscription status
router.get("/billing/subscription", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user.id;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));

  if (!org?.stripeCustomerId) {
    res.json({ hasSubscription: false, tierId: null, tierName: null, status: null, currentPeriodEnd: null, stripeCustomerId: null });
    return;
  }

  // Query the stripe schema for live subscription data
  try {
    const rows = await db.execute(sql`
      SELECT s.id, s.status, s.current_period_end, s.metadata->>'tierId' as tier_id
      FROM stripe.subscriptions s
      WHERE s.customer = ${org.stripeCustomerId}
      ORDER BY s.created DESC
      LIMIT 1
    `);
    const sub = rows.rows[0] as { id: string; status: string; current_period_end: string; tier_id: string } | undefined;
    if (!sub) {
      res.json({ hasSubscription: false, tierId: null, tierName: null, status: null, currentPeriodEnd: null, stripeCustomerId: org.stripeCustomerId });
      return;
    }
    const tier = sub.tier_id ? getTierById(sub.tier_id) : undefined;
    res.json({
      hasSubscription: sub.status === "active",
      tierId: sub.tier_id ?? org.tier,
      tierName: tier?.name ?? null,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      stripeCustomerId: org.stripeCustomerId,
    });
  } catch {
    res.json({ hasSubscription: false, tierId: org.tier ?? null, tierName: null, status: org.subscriptionStatus ?? null, currentPeriodEnd: null, stripeCustomerId: org.stripeCustomerId });
  }
});

export default router;
