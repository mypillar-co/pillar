import React from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  MapPin,
  Ticket,
  Loader2,
  AlertCircle,
  ArrowRight,
  Store,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketType = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: number | null;
};

type EventSponsor = {
  id: string;
  name: string;
  tier: string;
  tierRank: number;
  logoUrl: string | null;
  website: string | null;
};

type PublicEventData = {
  event: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    eventType: string | null;
    startDate: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    imageUrl: string | null;
    isTicketed: boolean;
    hasRegistration: boolean;
  };
  ticketTypes: TicketType[];
  sponsors: EventSponsor[];
  organization: {
    name: string;
    slug: string | null;
    acceptsPayments: boolean;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timeStr: string | null) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function formatPrice(price: number) {
  return price === 0 ? "Free" : `$${price.toFixed(2)}`;
}

async function fetchPublicEvent(slug: string): Promise<PublicEventData> {
  const res = await fetch(`/api/public/events/${slug}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Event not found");
  }
  return res.json();
}

// ─── Sponsor grid — visual tier hierarchy per guide ───────────────────────────

const TIER_LABELS: Record<string, string> = {
  presenting: "Presenting Sponsor",
  gold: "Gold Sponsors",
  silver: "Silver Sponsors",
  bronze: "Bronze Sponsors",
  sponsor: "Sponsors",
};

const TIER_LOGO_CLASS: Record<string, string> = {
  presenting: "h-20 md:h-28",
  gold: "h-14 md:h-20",
  silver: "h-10 md:h-14",
  bronze: "h-8 md:h-10",
  sponsor: "h-10 md:h-14",
};

const TIER_GRID_CLASS: Record<string, string> = {
  presenting: "grid-cols-1 md:grid-cols-2",
  gold: "grid-cols-2 md:grid-cols-3",
  silver: "grid-cols-3 md:grid-cols-4",
  bronze: "grid-cols-4 md:grid-cols-6",
  sponsor: "grid-cols-2 md:grid-cols-3",
};

function SponsorsSection({ sponsors }: { sponsors: EventSponsor[] }) {
  if (sponsors.length === 0) return null;

  // Group by tier, preserving tier rank order
  const tierOrder = ["presenting", "gold", "silver", "bronze", "sponsor"];
  const groups = new Map<string, EventSponsor[]>();
  for (const s of sponsors) {
    const key = s.tier.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const sortedTiers = [...groups.keys()].sort(
    (a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b)
  );

  return (
    <section className="py-12 border-t border-white/8">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-xl font-bold text-white mb-8">Event Sponsors</h2>
        <div className="space-y-10">
          {sortedTiers.map((tier) => {
            const group = groups.get(tier)!;
            const label = TIER_LABELS[tier] ?? "Sponsors";
            const logoClass = TIER_LOGO_CLASS[tier] ?? "h-10 md:h-14";
            const gridClass = TIER_GRID_CLASS[tier] ?? "grid-cols-2 md:grid-cols-3";
            return (
              <div key={tier}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">{label}</p>
                <div className={`grid ${gridClass} gap-6 items-center`}>
                  {group.map((s) => (
                    <div key={s.id} className="flex items-center justify-center">
                      {s.logoUrl ? (
                        s.website ? (
                          <a href={s.website} target="_blank" rel="noopener noreferrer"
                            className="opacity-80 hover:opacity-100 transition-opacity">
                            <img
                              src={s.logoUrl}
                              alt={s.name}
                              className={`${logoClass} w-auto object-contain`}
                            />
                          </a>
                        ) : (
                          <img
                            src={s.logoUrl}
                            alt={s.name}
                            className={`${logoClass} w-auto object-contain opacity-80`}
                          />
                        )
                      ) : (
                        <div className="flex items-center justify-center bg-white/5 rounded-lg px-4 py-3 min-w-[100px]">
                          <span className="text-sm font-medium text-slate-300 text-center">{s.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PublicEventLanding() {
  const [, params] = useRoute("/events/:slug");
  const slug = params?.slug ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-event", slug],
    queryFn: () => fetchPublicEvent(slug),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-1">Event Not Found</h2>
          <p className="text-slate-400 text-sm">
            {(error as Error)?.message ?? "This event may have ended or been removed."}
          </p>
        </div>
      </div>
    );
  }

  const { event, ticketTypes, sponsors, organization } = data;

  const lowestPrice = ticketTypes.length > 0
    ? Math.min(...ticketTypes.map(t => t.price))
    : null;

  const hasTickets = event.isTicketed && ticketTypes.length > 0;
  const canBuyTickets = hasTickets && organization.acceptsPayments;

  // ── 1. Hero ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[hsl(224,30%,8%)]">

      {/* Hero — image with overlay or solid brand-color bg */}
      <div className="relative">
        {event.imageUrl ? (
          <>
            <div className="absolute inset-0">
              <img
                src={event.imageUrl}
                alt={event.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-[hsl(224,30%,8%)]/80" />
            </div>
            <div className="relative">
              <HeroContent event={event} organization={organization} lowestPrice={lowestPrice} canBuyTickets={canBuyTickets} slug={slug} />
            </div>
          </>
        ) : (
          <HeroContent event={event} organization={organization} lowestPrice={lowestPrice} canBuyTickets={canBuyTickets} slug={slug} />
        )}
      </div>

      {/* ── 2. About This Event ─────────────────────────────────────────────── */}
      {event.description && (
        <section className="py-12 border-t border-white/8">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-xl font-bold text-white mb-4">About This Event</h2>
            <p className="text-slate-300 leading-relaxed max-w-2xl whitespace-pre-line">
              {event.description}
            </p>
          </div>
        </section>
      )}

      {/* ── 3. Buy Tickets ──────────────────────────────────────────────────── */}
      {hasTickets && (
        <section className="py-12 border-t border-white/8" id="tickets">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" />
              Tickets
            </h2>

            {!canBuyTickets ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                <p className="text-white font-medium mb-1">Online ticket sales are not yet enabled</p>
                <p className="text-sm text-slate-400">
                  Please contact {organization.name} directly to purchase tickets.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {ticketTypes.map((tt) => {
                  const soldOut = tt.available !== null && tt.available <= 0;
                  return (
                    <div
                      key={tt.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-5 py-4"
                    >
                      <div>
                        <p className="font-semibold text-white">{tt.name}</p>
                        {tt.description && (
                          <p className="text-sm text-slate-400 mt-0.5">{tt.description}</p>
                        )}
                        {tt.available !== null && (
                          <p className="text-xs text-slate-500 mt-1">
                            {soldOut ? "Sold out" : `${tt.available} remaining`}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-xl font-bold text-white">{formatPrice(tt.price)}</p>
                        {soldOut && (
                          <Badge variant="outline" className="mt-1 border-red-500/30 text-red-400 text-xs">
                            Sold out
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4">
                  <Link href={`/events/${slug}/tickets`}>
                    <Button
                      size="lg"
                      className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base h-12 px-8"
                    >
                      <Ticket className="w-4 h-4 mr-2" />
                      Get Tickets
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 4. Sponsors ─────────────────────────────────────────────────────── */}
      <SponsorsSection sponsors={sponsors} />

      {/* ── 5. Vendor Registration ──────────────────────────────────────────── */}
      {event.hasRegistration && organization.slug && (
        <section className="py-12 border-t border-white/8">
          <div className="max-w-4xl mx-auto px-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Store className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-white">Vendor Registration</p>
                </div>
                <p className="text-sm text-slate-400">
                  Interested in having a booth at {event.name}? Apply to be a vendor.
                </p>
              </div>
              <Link href={`/apply/${organization.slug}`}>
                <Button variant="outline" className="border-white/15 text-white hover:bg-white/10 flex-shrink-0">
                  Apply Now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── 6. Contact / Footer ─────────────────────────────────────────────── */}
      <div className="border-t border-white/5 py-4 text-center">
        <a
          href="https://mypillar.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          Powered by <span className="text-primary font-semibold">Pillar</span>
        </a>
      </div>
    </div>
  );
}

// ─── Hero content (shared between image and no-image variants) ────────────────

function HeroContent({
  event,
  organization,
  lowestPrice,
  canBuyTickets,
  slug,
}: {
  event: PublicEventData["event"];
  organization: PublicEventData["organization"];
  lowestPrice: number | null;
  canBuyTickets: boolean;
  slug: string;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-14 md:py-20">
      <p className="text-sm font-medium text-primary mb-3">{organization.name}</p>

      {event.eventType && (
        <Badge variant="outline" className="border-white/20 text-slate-400 text-xs mb-4">
          {event.eventType}
        </Badge>
      )}

      <h1 className="text-3xl md:text-5xl font-bold text-white mb-5 leading-tight">
        {event.name}
      </h1>

      {/* Date / Time / Location */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300 mb-8">
        {event.startDate && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
            <span>
              {formatDate(event.startDate)}
              {event.endDate && event.endDate !== event.startDate && (
                <> &ndash; {formatDate(event.endDate)}</>
              )}
            </span>
          </div>
        )}
        {event.startTime && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary flex-shrink-0" />
            <span>
              {formatTime(event.startTime)}
              {event.endTime ? ` – ${formatTime(event.endTime)}` : ""}
            </span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap gap-3">
        {canBuyTickets && (
          <Link href={`/events/${slug}/tickets`}>
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-12 px-7">
              <Ticket className="w-4 h-4 mr-2" />
              {lowestPrice === 0 ? "Register Free" : lowestPrice != null ? `Get Tickets · from ${formatPrice(lowestPrice)}` : "Get Tickets"}
            </Button>
          </Link>
        )}
        {event.isTicketed && !canBuyTickets && (
          <a href="#tickets">
            <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 h-12 px-7">
              <Ticket className="w-4 h-4 mr-2" />
              Ticket Info
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
