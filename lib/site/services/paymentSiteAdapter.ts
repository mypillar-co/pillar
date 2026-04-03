import { getEventPublicMetrics } from "./eventMetricsService.js";
import type { EventPublicMetricsSite } from "../types/site-bindings.js";

export async function getEventPaymentSiteData(orgId: string, eventId: string): Promise<EventPublicMetricsSite> {
  const metrics = await getEventPublicMetrics(orgId, eventId);

  if (!metrics) {
    return { ticketsSold: 0, ticketsRemaining: null };
  }

  return {
    ticketsSold: metrics.ticketsSold ?? 0,
    ticketsRemaining: metrics.ticketsRemaining ?? null,
  };
}
