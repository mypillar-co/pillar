import { Router, type Request, type Response } from "express";
import { db, organizationsTable, eventsTable, ticketTypesTable, ticketSalesTable, eventSponsorsTable, sponsorsTable } from "@workspace/db";
import { eq, and, sum, sql } from "drizzle-orm";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { resolveFullOrg } from "../lib/resolveOrg";
import { checkAndFirePostPurchaseHooks, getTotalTicketsSold } from "../ticketHooks";

const router = Router();

router.get("/connect/status", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  let accountStatus = null;
  let payoutsEnabled = false;
  let chargesEnabled = false;
  let detailsSubmitted = false;

  if (org.stripeConnectAccountId) {
    try {
      const stripe = await getUncachableStripeClient();
      const account = await stripe.accounts.retrieve(org.stripeConnectAccountId);
      payoutsEnabled = account.payouts_enabled ?? false;
      chargesEnabled = account.charges_enabled ?? false;
      detailsSubmitted = account.details_submitted ?? false;
      accountStatus = chargesEnabled && payoutsEnabled ? "active" : detailsSubmitted ? "pending" : "incomplete";
    } catch {
      accountStatus = "error";
    }
  }

  const [revenueResult] = await db
    .select({ total: sum(ticketSalesTable.amountPaid) })
    .from(ticketSalesTable)
    .where(and(
      eq(ticketSalesTable.orgId, org.id),
      eq(ticketSalesTable.paymentStatus, "paid")
    ));

  const [salesCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketSalesTable)
    .where(eq(ticketSalesTable.orgId, org.id));

  res.json({
    hasConnectAccount: !!org.stripeConnectAccountId,
    connectAccountId: org.stripeConnectAccountId ?? null,
    onboarded: org.stripeConnectOnboarded ?? false,
    accountStatus,
    payoutsEnabled,
    chargesEnabled,
    detailsSubmitted,
    isNonprofit: org.isNonprofit ?? false,
    totalRevenue: parseFloat(String(revenueResult?.total ?? 0)),
    totalSales: salesCount?.count ?? 0,
  });
});

router.post("/connect/onboard", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  try {
    const stripe = await getUncachableStripeClient();
    const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"]}`;

    let accountId = org.stripeConnectAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: req.user?.email ?? undefined,
        metadata: {
          orgId: org.id,
          orgName: org.name,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: org.isNonprofit ? "non_profit" : "company",
      });
      accountId = account.id;

      await db
        .update(organizationsTable)
        .set({ stripeConnectAccountId: accountId })
        .where(eq(organizationsTable.id, org.id));
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/dashboard/payments?connect=refresh`,
      return_url: `${origin}/dashboard/payments?connect=complete`,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    // Surface a helpful message for the most common setup error
    if (raw.includes("signed up for Connect")) {
      res.status(503).json({ error: "Stripe payment setup is not yet available on this platform. Please contact support." });
      return;
    }
    res.status(500).json({ error: "Could not start Stripe setup. Please try again or contact support." });
  }
});

router.post("/connect/dashboard", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!org.stripeConnectAccountId) {
    res.status(400).json({ error: "No payment account connected. Set up payments first." });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const loginLink = await stripe.accounts.createLoginLink(org.stripeConnectAccountId);
  res.json({ url: loginLink.url });
});

router.post("/connect/update-nonprofit", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { isNonprofit, taxIdNumber } = req.body as { isNonprofit?: boolean; taxIdNumber?: string };

  await db
    .update(organizationsTable)
    .set({
      isNonprofit: isNonprofit ?? org.isNonprofit,
      taxIdNumber: taxIdNumber ?? org.taxIdNumber,
    })
    .where(eq(organizationsTable.id, org.id));

  res.json({ success: true });
});

router.post("/public/events/:slug/checkout", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const {
    ticketTypeId, quantity, attendeeName, attendeeEmail, attendeePhone,
    _hp,       // honeypot field — must be empty
    _ts,       // form load timestamp (ms since epoch) — bot timing check
  } = req.body as {
    ticketTypeId: string;
    quantity: number;
    attendeeName: string;
    attendeeEmail?: string;
    attendeePhone?: string;
    _hp?: string;
    _ts?: number;
  };

  // ── Bot protection ────────────────────────────────────────────────────────
  // 1. Honeypot: any bot that fills the hidden _hp field is silently rejected.
  if (_hp) {
    res.status(400).json({ error: "Invalid submission" });
    return;
  }
  // 2. Timing: legitimate humans take at least 1.5 s to fill the form.
  if (_ts && Date.now() - _ts < 1500) {
    res.status(400).json({ error: "Please take a moment before submitting" });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (!ticketTypeId || !quantity || quantity < 1 || !attendeeName) {
    res.status(400).json({ error: "Missing required fields: ticketTypeId, quantity, attendeeName" });
    return;
  }

  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.slug, slug), eq(eventsTable.status, "published")));

  if (!event) {
    res.status(404).json({ error: "Event not found or not published" });
    return;
  }

  // ── Registration window check ─────────────────────────────────────────────
  // If the event's registration window is closed (and not force-overridden), reject.
  if (event.registrationClosed && !event.registrationForceOpen) {
    res.status(400).json({ error: "Ticket sales for this event are currently closed" });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const [ticketType] = await db
    .select()
    .from(ticketTypesTable)
    .where(and(eq(ticketTypesTable.id, ticketTypeId), eq(ticketTypesTable.eventId, event.id)));

  if (!ticketType || !ticketType.isActive) {
    res.status(404).json({ error: "Ticket type not found or unavailable" });
    return;
  }

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, event.orgId));

  const totalAmountCents = Math.round(ticketType.price * 100) * quantity;

  const reserveResult = ticketType.quantity !== null
    ? await db
        .update(ticketTypesTable)
        .set({ sold: sql`${ticketTypesTable.sold} + ${quantity}` })
        .where(
          and(
            eq(ticketTypesTable.id, ticketTypeId),
            sql`${ticketTypesTable.sold} + ${quantity} <= ${ticketTypesTable.quantity}`
          )
        )
        .returning()
    : await db
        .update(ticketTypesTable)
        .set({ sold: sql`${ticketTypesTable.sold} + ${quantity}` })
        .where(eq(ticketTypesTable.id, ticketTypeId))
        .returning();

  if (!reserveResult.length) {
    res.status(400).json({ error: "Not enough tickets available" });
    return;
  }

  if (totalAmountCents === 0) {
    // Snapshot total sold BEFORE this purchase for milestone detection
    const previousSold = await getTotalTicketsSold(event.id);

    const [sale] = await db
      .insert(ticketSalesTable)
      .values({
        eventId: event.id,
        orgId: org.id,
        ticketTypeId,
        attendeeName,
        attendeeEmail: attendeeEmail ?? null,
        attendeePhone: attendeePhone ?? null,
        quantity,
        amountPaid: 0,
        paymentMethod: "free",
        paymentStatus: "paid",
      })
      .returning();

    // Fire ticket lifecycle hooks (non-blocking)
    checkAndFirePostPurchaseHooks({
      orgId: org.id,
      eventId: event.id,
      eventName: event.name,
      saleId: sale.id,
      ticketTypeId,
      ticketTypeName: ticketType.name,
      attendeeName,
      attendeeEmail: attendeeEmail ?? null,
      quantity,
      amountPaid: 0,
      previousSold,
    }).catch(() => {});

    res.json({ checkoutUrl: null, saleId: sale.id, free: true });
    return;
  }

  if (!org.stripeConnectAccountId || !org.stripeConnectOnboarded) {
    await db
      .update(ticketTypesTable)
      .set({ sold: sql`${ticketTypesTable.sold} - ${quantity}` })
      .where(eq(ticketTypesTable.id, ticketTypeId));
    res.status(400).json({ error: "This organization has not completed payment setup yet" });
    return;
  }

  const [sale] = await db
    .insert(ticketSalesTable)
    .values({
      eventId: event.id,
      orgId: org.id,
      ticketTypeId,
      attendeeName,
      attendeeEmail: attendeeEmail ?? null,
      attendeePhone: attendeePhone ?? null,
      quantity,
      amountPaid: totalAmountCents / 100,
      paymentMethod: "stripe",
      paymentStatus: "pending",
    })
    .returning();

  const stripe = await getUncachableStripeClient();
  const unitAmountCents = Math.round(ticketType.price * 100);

  const applicationFeeAmount = Math.max(1, Math.round(totalAmountCents * 0.029 + 30));
  if (applicationFeeAmount >= totalAmountCents) {
    await db.delete(ticketSalesTable).where(eq(ticketSalesTable.id, sale.id));
    await db
      .update(ticketTypesTable)
      .set({ sold: sql`${ticketTypesTable.sold} - ${quantity}` })
      .where(eq(ticketTypesTable.id, ticketTypeId));
    res.status(400).json({ error: "Ticket price is too low for paid processing. Consider making this ticket free." });
    return;
  }

  const appUrl = process.env.APP_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"]}`;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${ticketType.name} — ${event.name}`,
              description: ticketType.description ?? `Ticket for ${event.name}`,
            },
            unit_amount: unitAmountCents,
          },
          quantity,
        },
      ],
      mode: "payment",
      customer_email: attendeeEmail || undefined,
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: org.stripeConnectAccountId,
        },
      },
      metadata: {
        saleId: sale.id,
        eventId: event.id,
        orgId: org.id,
        ticketTypeId,
        quantity: String(quantity),
      },
      success_url: `${appUrl}/events/${slug}/tickets/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/events/${slug}/tickets?cancelled=true`,
      expires_after: 1800,
    });

    await db
      .update(ticketSalesTable)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(ticketSalesTable.id, sale.id));

    res.json({ checkoutUrl: session.url, saleId: sale.id });
  } catch (err) {
    await db.delete(ticketSalesTable).where(eq(ticketSalesTable.id, sale.id));
    await db
      .update(ticketTypesTable)
      .set({ sold: sql`${ticketTypesTable.sold} - ${quantity}` })
      .where(eq(ticketTypesTable.id, ticketTypeId));
    throw err;
  }
});

router.get("/public/events/:slug", async (req: Request, res: Response) => {
  const { slug } = req.params;

  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.slug, slug), eq(eventsTable.status, "published"), eq(eventsTable.isActive, true)));

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const ticketTypes = await db
    .select()
    .from(ticketTypesTable)
    .where(and(eq(ticketTypesTable.eventId, event.id), eq(ticketTypesTable.isActive, true)));

  const [org] = await db
    .select({
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      stripeConnectAccountId: organizationsTable.stripeConnectAccountId,
      stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, event.orgId));

  const hasFreeTicketsOnly = ticketTypes.every(tt => tt.price === 0);
  const acceptsPayments = hasFreeTicketsOnly || !!(org?.stripeConnectAccountId && org?.stripeConnectOnboarded);

  // Fetch event sponsors (active, site-visible, confirmed)
  const eventSponsorRows = await db
    .select({
      sponsorId: eventSponsorsTable.sponsorId,
      tier: eventSponsorsTable.tier,
      tierRank: sponsorsTable.tierRank,
      name: sponsorsTable.name,
      logoUrl: sponsorsTable.logoUrl,
      website: sponsorsTable.website,
    })
    .from(eventSponsorsTable)
    .innerJoin(sponsorsTable, eq(eventSponsorsTable.sponsorId, sponsorsTable.id))
    .where(
      and(
        eq(eventSponsorsTable.eventId, event.id),
        eq(sponsorsTable.siteVisible, true),
        eq(sponsorsTable.status, "active"),
      )
    )
    .orderBy(sponsorsTable.tierRank, sponsorsTable.siteDisplayPriority);

  res.json({
    event: {
      id: event.id,
      name: event.name,
      slug: event.slug,
      description: event.description,
      eventType: event.eventType,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      imageUrl: event.imageUrl,
      isTicketed: event.isTicketed,
      hasRegistration: event.hasRegistration,
    },
    ticketTypes: ticketTypes.map(tt => ({
      id: tt.id,
      name: tt.name,
      description: tt.description,
      price: tt.price,
      available: tt.quantity !== null ? Math.max(0, tt.quantity - tt.sold) : null,
    })),
    sponsors: eventSponsorRows.map(s => ({
      id: s.sponsorId,
      name: s.name,
      tier: s.tier ?? "sponsor",
      tierRank: s.tierRank ?? 0,
      logoUrl: s.logoUrl,
      website: s.website,
    })),
    organization: {
      name: org?.name ?? "Unknown",
      slug: org?.slug ?? null,
      acceptsPayments,
    },
  });
});

/**
 * GET /api/public/events/:slug/tickets/verify?session_id=xxx
 *
 * Called by the TicketSuccess page after Stripe redirects back.
 * Looks up the Stripe session, verifies payment status, and returns
 * the confirmation details for display. Marks the sale as paid if
 * the webhook hasn't arrived yet (belt-and-suspenders).
 */
router.get("/public/events/:slug/tickets/verify", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const sessionId = req.query.session_id as string | undefined;

  if (!sessionId) {
    res.status(400).json({ error: "session_id is required" });
    return;
  }

  // Find the sale by Stripe session ID
  const [sale] = await db
    .select()
    .from(ticketSalesTable)
    .where(eq(ticketSalesTable.stripeCheckoutSessionId, sessionId));

  if (!sale) {
    // Session not found — could be a free ticket or a bad session ID
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Optimistic: if already paid (webhook fired first), return immediately
  if (sale.paymentStatus === "paid") {
    const [event] = await db.select({ name: eventsTable.name, startDate: eventsTable.startDate, location: eventsTable.location }).from(eventsTable).where(eq(eventsTable.id, sale.eventId));
    res.json({
      verified: true,
      saleId: sale.id,
      attendeeName: sale.attendeeName,
      attendeeEmail: sale.attendeeEmail,
      quantity: sale.quantity,
      amountPaid: sale.amountPaid,
      eventName: event?.name ?? "Event",
      eventDate: event?.startDate ?? null,
      eventLocation: event?.location ?? null,
      confirmation: (sale.stripeCheckoutSessionId ?? sale.id).slice(-8).toUpperCase(),
    });
    return;
  }

  // Belt-and-suspenders: verify with Stripe directly (webhook may not have arrived yet)
  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      res.json({ verified: false, status: session.payment_status });
      return;
    }

    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as { id?: string })?.id ?? null;

    // Mark as paid (idempotent — webhook may do this again later, that's fine)
    await db
      .update(ticketSalesTable)
      .set({ paymentStatus: "paid", stripePaymentIntentId: paymentIntentId ?? undefined })
      .where(and(eq(ticketSalesTable.id, sale.id), sql`${ticketSalesTable.paymentStatus} != 'paid'`));

    const [event] = await db.select({ name: eventsTable.name, startDate: eventsTable.startDate, location: eventsTable.location }).from(eventsTable).where(eq(eventsTable.id, sale.eventId));
    res.json({
      verified: true,
      saleId: sale.id,
      attendeeName: sale.attendeeName,
      attendeeEmail: sale.attendeeEmail,
      quantity: sale.quantity,
      amountPaid: sale.amountPaid,
      eventName: event?.name ?? "Event",
      eventDate: event?.startDate ?? null,
      eventLocation: event?.location ?? null,
      confirmation: sessionId.slice(-8).toUpperCase(),
    });
  } catch {
    // Stripe unavailable — return what we have with unverified flag
    const [event] = await db.select({ name: eventsTable.name, startDate: eventsTable.startDate, location: eventsTable.location }).from(eventsTable).where(eq(eventsTable.id, sale.eventId));
    res.json({
      verified: false,
      saleId: sale.id,
      attendeeName: sale.attendeeName,
      attendeeEmail: sale.attendeeEmail,
      quantity: sale.quantity,
      amountPaid: sale.amountPaid,
      eventName: event?.name ?? "Event",
      eventDate: event?.startDate ?? null,
      eventLocation: event?.location ?? null,
      confirmation: sessionId.slice(-8).toUpperCase(),
    });
  }
});

router.get("/connect/transactions", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const sales = await db
    .select({
      id: ticketSalesTable.id,
      eventId: ticketSalesTable.eventId,
      attendeeName: ticketSalesTable.attendeeName,
      attendeeEmail: ticketSalesTable.attendeeEmail,
      quantity: ticketSalesTable.quantity,
      amountPaid: ticketSalesTable.amountPaid,
      paymentMethod: ticketSalesTable.paymentMethod,
      paymentStatus: ticketSalesTable.paymentStatus,
      createdAt: ticketSalesTable.createdAt,
      eventName: eventsTable.name,
    })
    .from(ticketSalesTable)
    .leftJoin(eventsTable, eq(ticketSalesTable.eventId, eventsTable.id))
    .where(eq(ticketSalesTable.orgId, org.id))
    .orderBy(ticketSalesTable.createdAt)
    .limit(100);

  res.json({ transactions: sales });
});

export default router;
