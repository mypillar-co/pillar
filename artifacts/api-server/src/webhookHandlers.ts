import { db, organizationsTable, subscriptionsTable, ticketSalesTable, ticketTypesTable, registrationsTable, eventsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { logger } from "./lib/logger";
import { sendTicketConfirmation } from "./mailer";
import type Stripe from "stripe";

const STRIPE_VERIFY_TIMEOUT_MS = 8_000;

/**
 * Upsert a row in the subscriptions table from a Stripe Subscription object.
 * subscription.metadata must include userId (set via subscription_data.metadata at checkout).
 */
async function upsertSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    logger.warn({ subscriptionId: subscription.id }, "Subscription missing userId metadata — skipping upsert");
    return;
  }

  const tierId = subscription.metadata?.tierId ?? null;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Use item-level billing period (Stripe v20 removed top-level current_period_end)
  const item = subscription.items.data[0];
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : null;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  const cancelledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000)
    : null;

  // Upsert into subscriptions table (conflict on stripeSubscriptionId)
  await db
    .insert(subscriptionsTable)
    .values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      tierId,
      status: subscription.status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelledAt,
    })
    .onConflictDoUpdate({
      target: subscriptionsTable.stripeSubscriptionId,
      set: {
        status: subscription.status,
        tierId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelledAt,
        updatedAt: new Date(),
      },
    });

  // Mirror key billing fields back to the organizations table for quick access
  await db
    .update(organizationsTable)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      tier: tierId,
      subscriptionStatus: subscription.status,
    })
    .where(eq(organizationsTable.userId, userId));
}

async function cancelSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await db
    .update(subscriptionsTable)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.stripeSubscriptionId, subscription.id));

  await db
    .update(organizationsTable)
    .set({
      subscriptionStatus: "cancelled",
      stripeSubscriptionId: null,
      tier: null,
    })
    .where(eq(organizationsTable.userId, userId));

  logger.info({ userId, subscriptionId: subscription.id }, "Subscription cancelled");
}

async function handleTicketPaymentCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Principle: never trust the webhook payload — verify the session state directly with Stripe
  // before committing anything to the database. Use an 8-second timeout so a slow Stripe
  // response can't block the webhook handler indefinitely.
  let verifiedSession: Stripe.Checkout.Session;
  try {
    const stripe = await getUncachableStripeClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STRIPE_VERIFY_TIMEOUT_MS);
    try {
      verifiedSession = await stripe.checkout.sessions.retrieve(
        session.id,
        {},
        { signal: controller.signal as AbortSignal },
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // If verification fails (timeout, network error, etc.) log and bail out —
    // the background reconciler will catch this sale within 30 minutes.
    logger.warn({ sessionId: session.id, err }, "Stripe session verification failed — will retry via reconciler");
    return;
  }

  if (verifiedSession.payment_status !== "paid") {
    logger.info({ sessionId: session.id, paymentStatus: verifiedSession.payment_status }, "Session not yet paid — skipping");
    return;
  }

  const paymentIntentId = typeof verifiedSession.payment_intent === "string"
    ? verifiedSession.payment_intent
    : verifiedSession.payment_intent?.id ?? null;

  const updated = await db
    .update(ticketSalesTable)
    .set({
      paymentStatus: "paid",
      stripePaymentIntentId: paymentIntentId,
    })
    .where(
      and(
        eq(ticketSalesTable.stripeCheckoutSessionId, session.id),
        sql`${ticketSalesTable.paymentStatus} != 'paid'`
      )
    )
    .returning({
      id: ticketSalesTable.id,
      eventId: ticketSalesTable.eventId,
      attendeeName: ticketSalesTable.attendeeName,
      attendeeEmail: ticketSalesTable.attendeeEmail,
      quantity: ticketSalesTable.quantity,
      amountPaid: ticketSalesTable.amountPaid,
    });

  if (updated.length === 0) {
    logger.info({ sessionId: session.id }, "Ticket payment already processed or not found (idempotent skip)");
    return;
  }

  logger.info({ sessionId: session.id, paymentIntentId }, "Ticket payment verified and completed");

  // Send confirmation email if we have an email address
  const sale = updated[0];
  if (sale.attendeeEmail) {
    try {
      const [event] = await db
        .select({
          name: eventsTable.name,
          startDate: eventsTable.startDate,
          startTime: eventsTable.startTime,
          endTime: eventsTable.endTime,
          location: eventsTable.location,
        })
        .from(eventsTable)
        .where(eq(eventsTable.id, sale.eventId));

      if (event) {
        const dateLabel = event.startDate
          ? new Date(event.startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
          : "";
        const timeLabel = event.startTime
          ? `${event.startTime}${event.endTime ? ` – ${event.endTime}` : ""}`
          : "";

        await sendTicketConfirmation({
          to: sale.attendeeEmail,
          attendeeName: sale.attendeeName,
          eventName: event.name,
          eventDate: dateLabel,
          eventTime: timeLabel,
          eventLocation: event.location ?? "",
          quantity: sale.quantity,
          amountPaidCents: Math.round((sale.amountPaid ?? 0) * 100),
          confirmationId: sale.id,
          orgName: "",
        });

        logger.info({ saleId: sale.id, to: sale.attendeeEmail }, "Ticket confirmation email sent");
      }
    } catch (err) {
      // Don't fail the webhook if email fails — sale is already marked paid
      logger.warn({ saleId: sale.id, err }, "Failed to send ticket confirmation email");
    }
  }
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const sale = await db
    .update(ticketSalesTable)
    .set({ paymentStatus: "expired" })
    .where(
      and(
        eq(ticketSalesTable.stripeCheckoutSessionId, session.id),
        sql`${ticketSalesTable.paymentStatus} = 'pending'`
      )
    )
    .returning({ id: ticketSalesTable.id, ticketTypeId: ticketSalesTable.ticketTypeId, quantity: ticketSalesTable.quantity });

  if (sale.length > 0) {
    await db
      .update(ticketTypesTable)
      .set({ sold: sql`${ticketTypesTable.sold} - ${sale[0].quantity}` })
      .where(eq(ticketTypesTable.id, sale[0].ticketTypeId));
    logger.info({ sessionId: session.id, saleId: sale[0].id }, "Checkout expired — inventory released");
  }
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id ?? null;

  if (!paymentIntentId) return;

  const sale = await db
    .update(ticketSalesTable)
    .set({ paymentStatus: charge.amount_refunded >= charge.amount ? "refunded" : "partial_refund" })
    .where(
      and(
        eq(ticketSalesTable.stripePaymentIntentId, paymentIntentId),
        sql`${ticketSalesTable.paymentStatus} = 'paid'`
      )
    )
    .returning({ id: ticketSalesTable.id, ticketTypeId: ticketSalesTable.ticketTypeId, quantity: ticketSalesTable.quantity });

  if (sale.length > 0 && charge.amount_refunded >= charge.amount) {
    await db
      .update(ticketTypesTable)
      .set({ sold: sql`${ticketTypesTable.sold} - ${sale[0].quantity}` })
      .where(eq(ticketTypesTable.id, sale[0].ticketTypeId));
    logger.info({ paymentIntentId, saleId: sale[0].id }, "Full refund — inventory released");
  } else if (sale.length > 0) {
    logger.info({ paymentIntentId, saleId: sale[0].id }, "Partial refund recorded");
  }
}

async function handleConnectAccountUpdated(account: Stripe.Account): Promise<void> {
  if (account.metadata?.orgId) {
    const isOnboarded = (account.charges_enabled && account.payouts_enabled) ?? false;
    await db
      .update(organizationsTable)
      .set({ stripeConnectOnboarded: isOnboarded })
      .where(eq(organizationsTable.id, account.metadata.orgId));
    logger.info({ orgId: account.metadata.orgId, isOnboarded }, "Connect account updated");
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "Webhook payload must be a Buffer. Ensure the webhook route is registered before express.json().",
      );
    }

    const sync = await getStripeSync();
    // stripe-replit-sync handles the raw webhook forwarding to its synced tables
    await sync.processWebhook(payload, signature);

    // Also parse the event to update application-level state
    let event: Stripe.Event;
    try {
      event = JSON.parse(payload.toString()) as Stripe.Event;
    } catch {
      logger.warn("Failed to parse webhook payload for app-level update");
      return;
    }

    await WebhookHandlers.handleEvent(event);
  }

  static async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscription(subscription);
        logger.info(
          { subscriptionId: subscription.id, status: subscription.status },
          "Updated subscription from webhook",
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await cancelSubscription(subscription);
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const tierId = session.metadata?.tierId;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : (session.customer?.id ?? null);

        if (userId && customerId) {
          await db
            .update(organizationsTable)
            .set({
              stripeCustomerId: customerId,
              ...(tierId ? { tier: tierId } : {}),
            })
            .where(eq(organizationsTable.userId, userId));
          logger.info({ userId, tierId }, "Updated org customer from checkout.session.completed");
        }

        if (session.metadata?.saleId || (session.metadata?.eventId && session.metadata?.ticketTypeId)) {
          await handleTicketPaymentCompleted(session);
        }

        // Registration payment completed
        if (session.metadata?.type === "registration" && session.metadata?.registrationId) {
          await db
            .update(registrationsTable)
            .set({
              status: "pending_approval",
              stripePaymentStatus: "paid",
              paidAt: new Date(),
            })
            .where(eq(registrationsTable.id, session.metadata.registrationId));
          logger.info({ registrationId: session.metadata.registrationId }, "Registration payment completed");
        }

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutExpired(session);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge);
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await handleConnectAccountUpdated(account);
        break;
      }

      default:
        break;
    }
  }
}
