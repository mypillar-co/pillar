import { pillarRequest } from "./pillarSync.js";

export type SyncableEvent = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  location?: string | null;
  eventType?: string | null;
  imageUrl?: string | null;
  isTicketed?: boolean;
  ticketPrice?: number | null;
  ticketCapacity?: number | null;
  isActive?: boolean;
};

function toCsPayload(event: SyncableEvent, orgSlug: string) {
  return {
    orgId: orgSlug,
    title: event.name,
    slug: event.slug,
    description: event.description ?? "",
    date: event.startDate ?? "",
    time: event.startTime ?? "",
    location: event.location ?? "",
    category: event.eventType ?? "general",
    imageUrl: event.imageUrl ?? null,
    isTicketed: event.isTicketed ?? false,
    ticketPrice: event.ticketPrice != null ? String(event.ticketPrice) : null,
    ticketCapacity: event.ticketCapacity ?? null,
    isActive: event.isActive !== false,
  };
}

export async function syncCreateEventToPillar(event: SyncableEvent, orgSlug: string) {
  console.log(`[pillar-sync] create event org=${orgSlug} slug=${event.slug}`);
  return pillarRequest("/api/internal/events", "POST", toCsPayload(event, orgSlug));
}

export async function syncUpdateEventToPillar(event: SyncableEvent, orgSlug: string) {
  console.log(`[pillar-sync] update event org=${orgSlug} slug=${event.slug}`);
  return pillarRequest(`/api/internal/events/slug/${event.slug}`, "PATCH", {
    orgId: orgSlug,
    ...toCsPayload(event, orgSlug),
  });
}

export async function syncDeleteEventToPillar(eventSlug: string, orgSlug: string) {
  console.log(`[pillar-sync] delete event org=${orgSlug} slug=${eventSlug}`);
  return pillarRequest(`/api/internal/events/slug/${eventSlug}`, "DELETE", { orgId: orgSlug });
}
