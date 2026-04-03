export type EventMode =
  | "informational"
  | "registration"
  | "ticketed"
  | "fundraiser"
  | "vendor"
  | "participant"
  | "sponsor"
  | "hybrid";

export type PublicCtaMode =
  | "learn_more"
  | "register"
  | "rsvp"
  | "buy_tickets"
  | "apply_vendor"
  | "apply_participant"
  | "sponsor"
  | "donate";

export type RevenueClassification =
  | "none"
  | "admin_fee"
  | "ticket_revenue"
  | "sponsor_revenue"
  | "donation"
  | "mixed";

export type EventStatus =
  | "draft"
  | "published"
  | "registration_open"
  | "registration_closed"
  | "sold_out"
  | "completed"
  | "cancelled";

export interface EventBehavior {
  eventMode: EventMode;
  publicCtaMode: PublicCtaMode;
  revenueClassification: RevenueClassification;
  showPublicPricing: boolean;
  showPublicSoldCount: boolean;
  showPublicCapacity: boolean;
  enableTicketSales: boolean;
  enableRegistration: boolean;
  enableVendorApplications: boolean;
  enableParticipantSignup: boolean;
  enableSponsorship: boolean;
  isSoldOut: boolean;
  isRegistrationClosed: boolean;
}
