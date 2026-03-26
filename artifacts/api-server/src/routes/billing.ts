import { Router, type IRouter, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { TIERS, getTierById } from "../tiers";

const router: IRouter = Router();

// GET /api/tiers — public list of subscription tiers with live Stripe price IDs
router.get("/tiers", async (_req: Request, res: Response) => {
  try {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.search({
      query: "active:'true'",
      expand: ["data.product"],
    });

    const priceMap: Record<string, string> = {};
    for (const price of prices.data) {
      const meta = (price.product as { metadata?: Record<string, string> })?.metadata;
      const tierId = meta?.tierId;
      if (tierId) {
        priceMap[tierId] = price.id;
      }
    }

    const tiers = TIERS.map((t) => ({
      ...t,
      stripePriceId: priceMap[t.id] ?? null,
    }));

    res.json({ tiers });
  } catch {
    // Fall back to static tier list if Stripe is unavailable
    res.json({ tiers: TIERS });
  }
});

// POST /api/billing/checkout — create a Stripe Checkout session
router.post("/billing/checkout", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { tierId } = req.body as { tierId?: string };
  const tier = tierId ? getTierById(tierId) : undefined;
  if (!tierId || !tier) {
    res.status(400).json({ error: "Invalid tier" });
    return;
  }

  const stripe = await getUncachableStripeClient();

  // Look up the live Stripe price ID from the API directly
  const prices = await stripe.prices.search({
    query: `active:'true' AND metadata['tierId']:'${tierId}'`,
  });

  const priceId = prices.data[0]?.id;
  if (!priceId) {
    res.status(400).json({
      error: "This tier is not yet available for purchase. Please try again later.",
    });
    return;
  }

  const userId = req.user.id;
  const userEmail = req.user.email ?? undefined;

  // Get or create Stripe customer for this user
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));

  let customerId: string | null = org?.stripeCustomerId ?? null;
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

  // At this point customerId is always a string (either retrieved or just created)
  if (!customerId) {
    res.status(500).json({ error: "Failed to resolve Stripe customer" });
    return;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
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
    res.json({
      hasSubscription: false,
      tierId: null,
      tierName: null,
      status: null,
      currentPeriodEnd: null,
      stripeCustomerId: null,
    });
    return;
  }

  // Query Stripe directly for live subscription data
  try {
    const stripe = await getUncachableStripeClient();
    const subscriptions = await stripe.subscriptions.list({
      customer: org.stripeCustomerId,
      status: "all",
      limit: 1,
    });

    const sub = subscriptions.data[0];
    if (!sub) {
      res.json({
        hasSubscription: false,
        tierId: org.tier ?? null,
        tierName: null,
        status: org.subscriptionStatus ?? null,
        currentPeriodEnd: null,
        stripeCustomerId: org.stripeCustomerId,
      });
      return;
    }

    const tierId = sub.metadata?.tierId ?? org.tier ?? null;
    const tier = tierId ? getTierById(tierId) : undefined;

    res.json({
      hasSubscription: sub.status === "active",
      tierId,
      tierName: tier?.name ?? null,
      status: sub.status,
      currentPeriodEnd: sub.items.data[0]?.current_period_end
        ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
        : null,
      stripeCustomerId: org.stripeCustomerId,
    });
  } catch {
    res.json({
      hasSubscription: org.subscriptionStatus === "active",
      tierId: org.tier ?? null,
      tierName: null,
      status: org.subscriptionStatus ?? null,
      currentPeriodEnd: null,
      stripeCustomerId: org.stripeCustomerId,
    });
  }
});

export default router;
