import type { PublicCtaMode } from "../types/event-behavior.js";
import type { UpdatePolicy } from "../types/block-types.js";

const CTA_LABELS: Record<PublicCtaMode, string> = {
  learn_more: "Learn More",
  register: "Register Now",
  rsvp: "RSVP",
  buy_tickets: "Buy Tickets",
  apply_vendor: "Apply as Vendor",
  apply_participant: "Apply to Participate",
  sponsor: "Become a Sponsor",
  donate: "Donate",
};

export function getCtaLabel(ctaMode: string): string {
  return CTA_LABELS[ctaMode as PublicCtaMode] ?? "Learn More";
}

export function getCtaUrl(event: { slug: string; id?: string }): string {
  return `/events/${event.slug}`;
}

export function getUpdatePolicyForBlockType(blockType: string): UpdatePolicy {
  const autoApplyTypes = [
    "events_list",
    "featured_event",
    "sponsor_grid",
    "announcements",
    "stats",
  ];

  const lockedTypes = [
    "about",
    "hero",
    "cards",
    "membership",
    "board",
  ];

  if (autoApplyTypes.includes(blockType)) return "auto_apply";
  if (lockedTypes.includes(blockType)) return "locked";
  return "suggest_review";
}
