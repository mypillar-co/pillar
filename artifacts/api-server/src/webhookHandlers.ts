import { db, organizationsTable, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripeSync } from "./stripeClient";
import { logger } from "./lib/logger";
import type Stripe from "stripe";

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

    try {
      await WebhookHandlers.handleEvent(event);
    } catch (err) {
      logger.error(
        { err, eventType: event.type },
        "Error handling webhook event for app-level persistence",
      );
    }
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
          // Ensure the org has the customer ID stored
          await db
            .update(organizationsTable)
            .set({
              stripeCustomerId: customerId,
              ...(tierId ? { tier: tierId } : {}),
            })
            .where(eq(organizationsTable.userId, userId));
          logger.info({ userId, tierId }, "Updated org customer from checkout.session.completed");
        }
        break;
      }

      default:
        // Other event types are handled by stripe-replit-sync
        break;
    }
  }
}
