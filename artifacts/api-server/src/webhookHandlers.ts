import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripeSync } from "./stripeClient";
import { logger } from "./lib/logger";
import type Stripe from "stripe";

async function updateOrgFromSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const tierId = subscription.metadata?.tierId ?? null;

  await db
    .update(organizationsTable)
    .set({
      tier: tierId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })
    .where(eq(organizationsTable.userId, userId));
}

async function updateOrgFromCustomer(
  customerId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const tierId = subscription.metadata?.tierId ?? null;

  await db
    .update(organizationsTable)
    .set({
      stripeCustomerId: customerId,
      tier: tierId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })
    .where(eq(organizationsTable.userId, userId));
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

    // Additionally, parse the event to update application-level organization state
    // We parse without signature verification here since stripe-replit-sync already verified it
    let event: Stripe.Event;
    try {
      event = JSON.parse(payload.toString()) as Stripe.Event;
    } catch {
      logger.warn("Failed to parse webhook payload for org update");
      return;
    }

    try {
      await WebhookHandlers.handleEvent(event);
    } catch (err) {
      logger.error({ err, eventType: event.type }, "Error handling webhook event for org persistence");
    }
  }

  static async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
        await updateOrgFromCustomer(customerId, subscription);
        logger.info(
          { subscriptionId: subscription.id, status: subscription.status },
          "Updated org subscription from webhook",
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (userId) {
          await db
            .update(organizationsTable)
            .set({
              subscriptionStatus: "cancelled",
              stripeSubscriptionId: null,
              tier: null,
            })
            .where(eq(organizationsTable.userId, userId));
          logger.info({ userId }, "Cleared org subscription on cancellation");
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const tierId = session.metadata?.tierId;
        const customerId = typeof session.customer === "string"
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
          logger.info({ userId, tierId }, "Updated org customer from checkout");
        }
        break;
      }

      default:
        // Unhandled event type — not an error
        break;
    }
  }
}
