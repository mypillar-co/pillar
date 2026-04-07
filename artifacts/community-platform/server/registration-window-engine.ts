export interface RegistrationWindowStatus {
  vendorOpen: boolean;
  sponsorOpen: boolean;
  ticketSalesOpen: boolean;
  eventDate: string | null;
  opensAt?: string;
  closesAt?: string;
  reason: "open" | "force-open" | "too-early" | "auto-closed" | "manually-closed" | "no-date-set";
}

interface Settings {
  eventDate?: string | null;
  vendorRegistrationClosed?: boolean | null;
  sponsorRegistrationClosed?: boolean | null;
  vendorRegistrationForceOpen?: boolean | null;
  sponsorRegistrationForceOpen?: boolean | null;
  ticketSalesClosed?: boolean | null;
  ticketSalesForceOpen?: boolean | null;
}

function parseEventDate(dateStr: string): Date | null {
  const cleaned = dateStr.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*/i, "");
  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function computeRegistrationWindow(
  settings: Settings | null,
  isTicketed: boolean
): RegistrationWindowStatus {
  const eventDate = settings?.eventDate ? parseEventDate(settings.eventDate) : null;
  const now = new Date();

  const OPEN_DAYS_BEFORE = 90;
  const CLOSE_DAYS_BEFORE = 7;

  let opensAt: Date | undefined;
  let closesAt: Date | undefined;

  if (eventDate) {
    opensAt = new Date(eventDate);
    opensAt.setDate(opensAt.getDate() - OPEN_DAYS_BEFORE);
    closesAt = new Date(eventDate);
    closesAt.setDate(closesAt.getDate() - CLOSE_DAYS_BEFORE);
  }

  function getStatus(forceOpen: boolean | null | undefined, manualClosed: boolean | null | undefined) {
    if (forceOpen) return { open: true, reason: "force-open" as const };
    if (manualClosed) return { open: false, reason: "manually-closed" as const };
    if (!eventDate) return { open: false, reason: "no-date-set" as const };
    if (now < opensAt!) return { open: false, reason: "too-early" as const };
    if (now > closesAt!) return { open: false, reason: "auto-closed" as const };
    return { open: true, reason: "open" as const };
  }

  const vendor = getStatus(settings?.vendorRegistrationForceOpen, settings?.vendorRegistrationClosed);
  const sponsor = getStatus(settings?.sponsorRegistrationForceOpen, settings?.sponsorRegistrationClosed);

  let ticketSalesOpen = false;
  let ticketReason: RegistrationWindowStatus["reason"] = "no-date-set";
  if (isTicketed) {
    if (settings?.ticketSalesForceOpen) { ticketSalesOpen = true; ticketReason = "force-open"; }
    else if (settings?.ticketSalesClosed) { ticketSalesOpen = false; ticketReason = "manually-closed"; }
    else { ticketSalesOpen = true; ticketReason = "open"; }
  }

  return {
    vendorOpen: vendor.open,
    sponsorOpen: sponsor.open,
    ticketSalesOpen,
    eventDate: settings?.eventDate || null,
    opensAt: opensAt?.toISOString(),
    closesAt: closesAt?.toISOString(),
    reason: vendor.reason,
  };
}
