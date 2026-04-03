import type { EventBehavior, EventMode, PublicCtaMode, RevenueClassification } from "../types/event-behavior.js";

interface LegacyEvent {
  isTicketed?: boolean | null;
  hasRegistration?: boolean | null;
  eventType?: string | null;
  name?: string | null;
  description?: string | null;
  eventStatus?: string | null;
  ticketCapacity?: number | null;
  showPublicPricing?: boolean | null;
  showPublicSoldCount?: boolean | null;
  showPublicCapacity?: boolean | null;
  enableTicketSales?: boolean | null;
  enableRegistration?: boolean | null;
  enableVendorApplications?: boolean | null;
  enableParticipantSignup?: boolean | null;
  enableSponsorship?: boolean | null;
  eventMode?: string | null;
  publicCtaMode?: string | null;
  revenueClassification?: string | null;
}

const FUNDRAISER_KEYWORDS = /fundrais|gala|auction|benefit|golf tournament|silent auction/i;
const VENDOR_KEYWORDS = /vendor|market|exhibitor|craft fair|bazaar/i;

export function inferLegacyEventBehavior(event: LegacyEvent): EventBehavior {
  let eventMode: EventMode = "informational";
  let publicCtaMode: PublicCtaMode = "learn_more";
  let revenueClassification: RevenueClassification = "none";

  const combined = `${event.name ?? ""} ${event.description ?? ""} ${event.eventType ?? ""}`.toLowerCase();

  if (event.isTicketed) {
    eventMode = "ticketed";
    publicCtaMode = "buy_tickets";
    revenueClassification = "ticket_revenue";
  } else if (FUNDRAISER_KEYWORDS.test(combined)) {
    eventMode = "fundraiser";
    publicCtaMode = "donate";
    revenueClassification = "donation";
  } else if (VENDOR_KEYWORDS.test(combined)) {
    eventMode = "vendor";
    publicCtaMode = "apply_vendor";
    revenueClassification = "admin_fee";
  } else if (event.hasRegistration) {
    eventMode = "registration";
    publicCtaMode = "register";
    revenueClassification = "none";
  }

  const isSoldOut = event.eventStatus === "sold_out";
  const isRegistrationClosed = event.eventStatus === "registration_closed" || event.eventStatus === "completed" || event.eventStatus === "cancelled";

  return {
    eventMode,
    publicCtaMode,
    revenueClassification,
    showPublicPricing: event.showPublicPricing ?? false,
    showPublicSoldCount: event.showPublicSoldCount ?? false,
    showPublicCapacity: event.showPublicCapacity ?? false,
    enableTicketSales: event.enableTicketSales ?? (event.isTicketed ?? false),
    enableRegistration: event.enableRegistration ?? (event.hasRegistration ?? false),
    enableVendorApplications: event.enableVendorApplications ?? false,
    enableParticipantSignup: event.enableParticipantSignup ?? false,
    enableSponsorship: event.enableSponsorship ?? false,
    isSoldOut,
    isRegistrationClosed,
  };
}

export function getEventBehavior(event: LegacyEvent): EventBehavior {
  const hasNewFields =
    event.eventMode != null &&
    event.eventMode !== "informational" ||
    event.publicCtaMode != null &&
    event.publicCtaMode !== "learn_more";

  if (hasNewFields) {
    const isSoldOut = event.eventStatus === "sold_out";
    const isRegistrationClosed = event.eventStatus === "registration_closed" || event.eventStatus === "completed" || event.eventStatus === "cancelled";

    return {
      eventMode: (event.eventMode ?? "informational") as EventMode,
      publicCtaMode: (event.publicCtaMode ?? "learn_more") as PublicCtaMode,
      revenueClassification: (event.revenueClassification ?? "none") as RevenueClassification,
      showPublicPricing: event.showPublicPricing ?? false,
      showPublicSoldCount: event.showPublicSoldCount ?? false,
      showPublicCapacity: event.showPublicCapacity ?? false,
      enableTicketSales: event.enableTicketSales ?? false,
      enableRegistration: event.enableRegistration ?? false,
      enableVendorApplications: event.enableVendorApplications ?? false,
      enableParticipantSignup: event.enableParticipantSignup ?? false,
      enableSponsorship: event.enableSponsorship ?? false,
      isSoldOut,
      isRegistrationClosed,
    };
  }

  return inferLegacyEventBehavior(event);
}

export function isPubliclyVisible(event: {
  showOnPublicSite?: boolean | null;
  eventStatus?: string | null;
  isActive?: boolean | null;
}): boolean {
  if (event.showOnPublicSite === false) return false;
  if (event.eventStatus === "cancelled") return false;
  if (event.isActive === false) return false;
  return true;
}
