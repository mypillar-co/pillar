import { Router, type Request, type Response } from "express";
import { db, organizationsTable, eventsTable, ticketTypesTable, ticketSalesTable } from "@workspace/db";
import { eq, and, sum, sql } from "drizzle-orm";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";

const router = Router();

async function resolveOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  return org;
}

router.get("/connect/status", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
  if (!org) return;

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
});

router.post("/connect/dashboard", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
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
  const { ticketTypeId, quantity, attendeeName, attendeeEmail, attendeePhone } = req.body as {
    ticketTypeId: string;
    quantity: number;
    attendeeName: string;
    attendeeEmail?: string;
    attendeePhone?: string;
  };

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
    },
    ticketTypes: ticketTypes.map(tt => ({
      id: tt.id,
      name: tt.name,
      description: tt.description,
      price: tt.price,
      available: tt.quantity !== null ? Math.max(0, tt.quantity - tt.sold) : null,
    })),
    organization: {
      name: org?.name ?? "Unknown",
      slug: org?.slug ?? null,
      acceptsPayments,
    },
  });
});

router.get("/connect/transactions", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
