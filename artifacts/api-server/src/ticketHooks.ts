/**
 * Ticket lifecycle hooks — internal event bus for ticket purchases.
 *
 * Fires structured events on every purchase so downstream code (notifications,
 * webhooks, analytics, sold-out flags) can react without coupling to the
 * checkout handler directly.
 *
 * All hooks are fire-and-forget; a failure here NEVER blocks the purchase flow.
 */

import { db, ticketTypesTable, ticketSalesTable } from "@workspace/db";
import { eq, and, sum, sql } from "drizzle-orm";
import { logger } from "./lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketHookType =
  | "ticket.purchased"
  | "ticket.free_registered"
  | "ticket.sold_out"
  | "ticket.milestone";

export interface TicketHookPayload {
  hookType: TicketHookType;
  orgId: string;
  eventId: string;
  eventName: string;
  ticketTypeId?: string;
  ticketTypeName?: string;
  saleId?: string;
  attendeeName?: string;
  attendeeEmail?: string | null;
  quantity?: number;
  amountPaid?: number;
  milestonePercent?: number;
  totalSold?: number;
  capacity?: number;
}

// ─── Core hook dispatcher ─────────────────────────────────────────────────────

/**
 * Fire a ticket lifecycle hook.
 * Currently: structured log + extensible to webhooks / push notifications.
 */
export async function fireTicketHook(payload: TicketHookPayload): Promise<void> {
  try {
    logger.info(
      {
        hook: payload.hookType,
        orgId: payload.orgId,
        eventId: payload.eventId,
        saleId: payload.saleId,
        milestonePercent: payload.milestonePercent,
        totalSold: payload.totalSold,
        capacity: payload.capacity,
      },
      `[ticket-hook] ${payload.hookType}`
    );
    // TODO: insert into hook_event_log, send webhooks, push notifications
  } catch (err) {
    // Hooks must never fail the purchase flow
    logger.warn({ err, hook: payload.hookType }, "[ticket-hook] Handler error — skipped (non-fatal)");
  }
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Total tickets sold for an event across all ticket types with "paid" status.
 */
export async function getTotalTicketsSold(eventId: string): Promise<number> {
  const [result] = await db
    .select({ total: sum(ticketSalesTable.quantity) })
    .from(ticketSalesTable)
    .where(
      and(
        eq(ticketSalesTable.eventId, eventId),
        eq(ticketSalesTable.paymentStatus, "paid")
      )
    );
  return Number(result?.total ?? 0);
}

/**
 * Total ticket capacity for an event across all active ticket types.
 * Returns null if any ticket type is unlimited (quantity = null).
 */
export async function getTotalEventCapacity(eventId: string): Promise<number | null> {
  const types = await db
    .select({ quantity: ticketTypesTable.quantity })
    .from(ticketTypesTable)
    .where(
      and(
        eq(ticketTypesTable.eventId, eventId),
        eq(ticketTypesTable.isActive, true)
      )
    );
  if (types.length === 0) return null;
  if (types.some((t) => t.quantity === null)) return null;
  return types.reduce((sum, t) => sum + (t.quantity ?? 0), 0);
}

/**
 * Returns the ticket sales for an event (admin view).
 */
export async function getTicketSalesByEvent(eventId: string) {
  return db
    .select()
    .from(ticketSalesTable)
    .where(eq(ticketSalesTable.eventId, eventId));
}

/**
 * Returns a single ticket sale by ID and orgId (scoped for security).
 */
export async function getTicketSaleById(saleId: string, orgId: string) {
  const [sale] = await db
    .select()
    .from(ticketSalesTable)
    .where(
      and(
        eq(ticketSalesTable.id, saleId),
        eq(ticketSalesTable.orgId, orgId)
      )
    );
  return sale ?? null;
}

/**
 * Mark a pending ticket sale as paid and record the payment intent ID.
 * Idempotent — safe to call multiple times.
 */
export async function markTicketSalePaid(
  saleId: string,
  stripePaymentIntentId: string | null
): Promise<boolean> {
  const updated = await db
    .update(ticketSalesTable)
    .set({ paymentStatus: "paid", stripePaymentIntentId: stripePaymentIntentId ?? undefined })
    .where(
      and(
        eq(ticketSalesTable.id, saleId),
        eq(ticketSalesTable.paymentStatus, "pending")
      )
    )
    .returning({ id: ticketSalesTable.id });
  return updated.length > 0;
}

/**
 * Release a reserved ticket slot (undo the `sold` increment) and delete the sale record.
 * Used when a Stripe session is cancelled or a free registration is rolled back.
 */
export async function releaseTicketReservation(
  saleId: string,
  ticketTypeId: string,
  quantity: number
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(ticketTypesTable)
      .set({
        sold: sql`GREATEST(0, ${ticketTypesTable.sold} - ${quantity})`,
      })
      .where(eq(ticketTypesTable.id, ticketTypeId));
    await tx.delete(ticketSalesTable).where(eq(ticketSalesTable.id, saleId));
  });
}

// ─── Post-purchase milestone / sold-out detection ─────────────────────────────

const MILESTONES = [25, 50, 75, 100];

/**
 * After a confirmed purchase, detect and fire:
 *  - ticket.purchased (or ticket.free_registered for $0)
 *  - ticket.sold_out  if this ticket type is now fully sold
 *  - ticket.milestone if total event sales crossed a 25/50/75/100% threshold
 *
 * @param previousSold — total tickets sold for the event BEFORE this purchase
 */
export async function checkAndFirePostPurchaseHooks(opts: {
  orgId: string;
  eventId: string;
  eventName: string;
  saleId: string;
  ticketTypeId: string;
  ticketTypeName: string;
  attendeeName: string;
  attendeeEmail?: string | null;
  quantity: number;
  amountPaid: number;
  previousSold: number;
}): Promise<void> {
  const {
    orgId, eventId, eventName,
    saleId, ticketTypeId, ticketTypeName,
    attendeeName, attendeeEmail,
    quantity, amountPaid,
    previousSold,
  } = opts;

  // 1. Purchase hook
  await fireTicketHook({
    hookType: amountPaid === 0 ? "ticket.free_registered" : "ticket.purchased",
    orgId, eventId, eventName,
    ticketTypeId, ticketTypeName,
    saleId, attendeeName, attendeeEmail,
    quantity, amountPaid,
  });

  // 2. Sold-out check for this ticket type
  const [tt] = await db
    .select({ quantity: ticketTypesTable.quantity, sold: ticketTypesTable.sold })
    .from(ticketTypesTable)
    .where(eq(ticketTypesTable.id, ticketTypeId));

  if (tt?.quantity !== null && tt !== undefined && tt.sold >= (tt.quantity ?? Infinity)) {
    await fireTicketHook({
      hookType: "ticket.sold_out",
      orgId, eventId, eventName,
      ticketTypeId, ticketTypeName,
      totalSold: tt.sold,
      capacity: tt.quantity ?? undefined,
    });
  }

  // 3. Event-level milestone checks
  const totalCapacity = await getTotalEventCapacity(eventId);
  if (!totalCapacity) return;

  const nowSold = await getTotalTicketsSold(eventId);

  for (const pct of MILESTONES) {
    const threshold = Math.ceil(totalCapacity * pct / 100);
    if (previousSold < threshold && nowSold >= threshold) {
      await fireTicketHook({
        hookType: "ticket.milestone",
        orgId, eventId, eventName,
        milestonePercent: pct,
        totalSold: nowSold,
        capacity: totalCapacity,
      });
    }
  }
}
