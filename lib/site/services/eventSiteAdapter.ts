import { eq, and, asc, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db";
import { getEventBehavior } from "./eventBehaviorService.js";
import { getEventPublicMetrics } from "./eventMetricsService.js";
import type { SiteEventItem } from "../types/site-bindings.js";
import { getCtaLabel, getCtaUrl } from "../utils/ctaHelpers.js";
import { isPubliclyVisible } from "./eventBehaviorService.js";

interface EventQueryConfig {
  showOnPublicSite?: boolean;
  featuredOnSite?: boolean;
  limit?: number;
  orderBy?: string;
}

export async function getPublicEventCount(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(
      eq(eventsTable.orgId, orgId),
      eq(eventsTable.isActive, true),
      eq(eventsTable.showOnPublicSite, true),
    ));
  return rows.length;
}

/** Count events that have an imageUrl — used for imageRichness signal. */
export async function countEventsWithImages(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(
      eq(eventsTable.orgId, orgId),
      eq(eventsTable.isActive, true),
      isNotNull(eventsTable.imageUrl),
    ));
  return rows.length;
}

export async function getEventSiteData(orgId: string, queryConfig: EventQueryConfig = {}): Promise<SiteEventItem[]> {
  const query = db
    .select()
    .from(eventsTable)
    .where(and(
      eq(eventsTable.orgId, orgId),
      eq(eventsTable.isActive, true),
      eq(eventsTable.showOnPublicSite, true),
    ))
    .orderBy(asc(eventsTable.startDate))
    .limit(queryConfig.limit ?? 20);

  const events = await query;

  const results: SiteEventItem[] = [];

  for (const event of events) {
    if (!isPubliclyVisible({ eventStatus: event.status })) continue;
    if (queryConfig.featuredOnSite && !event.featuredOnSite) continue;

    const behavior = getEventBehavior({
      isTicketed: event.isTicketed,
      hasRegistration: event.hasRegistration,
      eventType: event.eventType,
      name: event.name,
      description: event.description,
      eventStatus: event.status,
    });

    const metrics = behavior.enableTicketSales ? await getEventPublicMetrics(orgId, event.id) : null;

    results.push({
      id: event.id,
      slug: event.slug,
      name: event.name,
      date: event.startDate ?? undefined,
      time: event.startTime ?? undefined,
      location: event.location ?? undefined,
      description: event.description ?? undefined,
      imageUrl: event.imageUrl ?? undefined,
      ctaLabel: getCtaLabel(behavior.publicCtaMode),
      ctaUrl: getCtaUrl(event),
      eventMode: behavior.eventMode,
      showPricing: behavior.showPublicPricing,
      price: event.ticketPrice ?? undefined,
      isSoldOut: behavior.isSoldOut || (metrics?.ticketsRemaining != null && metrics.ticketsRemaining <= 0),
      isRegistrationClosed: behavior.isRegistrationClosed,
      siteDisplayVariant: "list",
      featuredOnSite: event.featuredOnSite ?? false,
    });
  }

  return results.slice(0, queryConfig.limit ?? 10);
}
