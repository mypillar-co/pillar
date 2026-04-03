import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { ticketSalesTable, eventsTable } from "@workspace/db";
import { eventPublicMetricsTable } from "@workspace/db";
import { eventRevenueSummaryTable } from "@workspace/db";
import { logInfo, logError } from "./siteLogService.js";
import type { EventPublicMetrics } from "@workspace/db";

const SERVICE = "eventMetricsService";

export async function recomputeEventMetrics(orgId: string, eventId: string): Promise<void> {
  try {
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)))
      .limit(1);

    if (!event) {
      throw new Error(`Event ${eventId} not found for org ${orgId}`);
    }

    const sales = await db
      .select()
      .from(ticketSalesTable)
      .where(and(
        eq(ticketSalesTable.eventId, eventId),
        eq(ticketSalesTable.orgId, orgId),
      ));

    const ticketsSold = sales.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
    const revenueTotal = sales.reduce((sum, s) => sum + (s.amountPaid ?? 0), 0);
    const ticketCapacity = event.ticketCapacity ?? null;
    const ticketsRemaining = ticketCapacity != null ? Math.max(0, ticketCapacity - ticketsSold) : null;

    const now = new Date();

    const existing = await db
      .select()
      .from(eventPublicMetricsTable)
      .where(eq(eventPublicMetricsTable.eventId, eventId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(eventPublicMetricsTable)
        .set({ ticketsSold, ticketsRemaining, revenueTotal, lastCalculatedAt: now })
        .where(eq(eventPublicMetricsTable.eventId, eventId));
    } else {
      await db.insert(eventPublicMetricsTable).values({
        eventId,
        ticketsSold,
        ticketsRemaining,
        revenueTotal,
        lastCalculatedAt: now,
      });
    }

    const vendorRevenue = 0;
    const sponsorRevenue = 0;
    const donationRevenue = 0;

    const existingRevSummary = await db
      .select()
      .from(eventRevenueSummaryTable)
      .where(eq(eventRevenueSummaryTable.eventId, eventId))
      .limit(1);

    if (existingRevSummary.length > 0) {
      await db
        .update(eventRevenueSummaryTable)
        .set({ ticketRevenue: revenueTotal, vendorRevenue, sponsorRevenue, donationRevenue, lastUpdated: now })
        .where(eq(eventRevenueSummaryTable.eventId, eventId));
    } else {
      await db.insert(eventRevenueSummaryTable).values({
        eventId,
        ticketRevenue: revenueTotal,
        vendorRevenue,
        sponsorRevenue,
        donationRevenue,
        lastUpdated: now,
      });
    }

    await logInfo(SERVICE, "recomputeEventMetrics", `Metrics computed for event ${eventId}`, { orgId, eventId, ticketsSold, revenueTotal }, orgId);
  } catch (err) {
    await logError(SERVICE, "recomputeEventMetrics", `Failed to recompute metrics for event ${eventId}`, { orgId, eventId }, err, orgId);
    throw err;
  }
}

export async function getEventPublicMetrics(orgId: string, eventId: string): Promise<EventPublicMetrics | null> {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)))
    .limit(1);

  if (!event) return null;

  const [metrics] = await db
    .select()
    .from(eventPublicMetricsTable)
    .where(eq(eventPublicMetricsTable.eventId, eventId))
    .limit(1);

  return metrics ?? null;
}
