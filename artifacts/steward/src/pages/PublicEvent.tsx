import React, { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  MapPin,
  Ticket,
  Loader2,
  AlertCircle,
  Minus,
  Plus,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type PublicTicketType = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: number | null;
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
  };
  ticketTypes: PublicTicketType[];
  organization: {
    name: string;
    slug: string | null;
    acceptsPayments: boolean;
  };
};

async function fetchPublicEvent(slug: string): Promise<PublicEventData> {
  const res = await fetch(`/api/public/events/${slug}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Event not found");
  }
  return res.json();
}

async function startCheckout(slug: string, data: {
  ticketTypeId: string;
  quantity: number;
  attendeeName: string;
  attendeeEmail?: string;
  attendeePhone?: string;
}): Promise<{ checkoutUrl: string }> {
  const res = await fetch(`/api/public/events/${slug}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Checkout failed");
  }
  return res.json();
}

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
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

export default function PublicEvent() {
  const [, params] = useRoute("/events/:slug/tickets");
  const slug = params?.slug ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-event", slug],
    queryFn: () => fetchPublicEvent(slug),
    enabled: !!slug,
  });

  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const checkoutMutation = useMutation({
    mutationFn: () => startCheckout(slug, {
      ticketTypeId: selectedTicket!,
      quantity,
      attendeeName: name,
      attendeeEmail: email || undefined,
      attendeePhone: phone || undefined,
    }),
    onSuccess: (result) => {
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        window.location.href = `/events/${slug}/tickets/success`;
      }
    },
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
      <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-1">Event Not Found</h2>
          <p className="text-muted-foreground text-sm">{(error as Error)?.message ?? "This event may have ended or been removed."}</p>
        </div>
      </div>
    );
  }

  const { event, ticketTypes, organization } = data;
  const selectedType = ticketTypes.find(t => t.id === selectedTicket);
  const total = selectedType ? selectedType.price * quantity : 0;

  return (
    <div className="min-h-screen bg-[hsl(224,30%,8%)]">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-2">
          <p className="text-sm text-primary font-medium">{organization.name}</p>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{event.name}</h1>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
          {event.startDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(event.startDate)}</span>
              {event.endDate && event.endDate !== event.startDate && (
                <span> — {formatDate(event.endDate)}</span>
              )}
            </div>
          )}
          {event.startTime && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>{formatTime(event.startTime)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ""}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>{event.location}</span>
            </div>
          )}
        </div>

        {event.description && (
          <p className="text-muted-foreground mb-8 leading-relaxed max-w-2xl">{event.description}</p>
        )}

        {!event.isTicketed || ticketTypes.length === 0 ? (
          <Card className="border-white/10 bg-card/60">
            <CardContent className="py-8 text-center">
              <Ticket className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">Tickets are not currently available for this event.</p>
            </CardContent>
          </Card>
        ) : !organization.acceptsPayments ? (
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardContent className="py-6 text-center">
              <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Online ticket sales are not yet enabled</p>
              <p className="text-sm text-muted-foreground">Please contact {organization.name} directly to purchase tickets.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                Select Tickets
              </h2>
              {ticketTypes.map((tt) => {
                const isSoldOut = tt.available !== null && tt.available <= 0;
                const isSelected = selectedTicket === tt.id;
                return (
                  <Card
                    key={tt.id}
                    className={`border-white/10 cursor-pointer transition-colors ${
                      isSelected ? "border-primary/50 bg-primary/5" : "bg-card/60 hover:bg-card/80"
                    } ${isSoldOut ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() => !isSoldOut && setSelectedTicket(tt.id)}
                  >
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{tt.name}</p>
                        {tt.description && <p className="text-sm text-muted-foreground mt-0.5">{tt.description}</p>}
                        {tt.available !== null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {isSoldOut ? "Sold out" : `${tt.available} remaining`}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">
                          {tt.price === 0 ? "Free" : `$${tt.price.toFixed(2)}`}
                        </p>
                        {isSelected && !isSoldOut && (
                          <Badge className="mt-1 bg-primary/20 text-primary border-primary/30">Selected</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-4">
              <Card className="border-white/10 bg-card/60 sticky top-6">
                <CardContent className="py-5 space-y-4">
                  <h3 className="text-base font-semibold text-white">Order Details</h3>

                  {selectedTicket && selectedType ? (
                    <>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Quantity</p>
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-8 h-8 p-0 border-white/10"
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-white font-medium w-8 text-center">{quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-8 h-8 p-0 border-white/10"
                            onClick={() => {
                              const max = selectedType.available ?? 10;
                              setQuantity(Math.min(max, quantity + 1));
                            }}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <Label className="text-muted-foreground text-xs">Full Name *</Label>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-white/5 border-white/10 text-white mt-1"
                            placeholder="Your full name"
                          />
                        </div>
                        <div>
                          <Label className="text-muted-foreground text-xs">Email</Label>
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-white/5 border-white/10 text-white mt-1"
                            placeholder="your@email.com"
                          />
                        </div>
                        <div>
                          <Label className="text-muted-foreground text-xs">Phone</Label>
                          <Input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="bg-white/5 border-white/10 text-white mt-1"
                            placeholder="(555) 123-4567"
                          />
                        </div>
                      </div>

                      <div className="border-t border-white/10 pt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{selectedType.name} × {quantity}</span>
                          <span className="text-white">${total.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-white">
                          <span>Total</span>
                          <span>${total.toFixed(2)}</span>
                        </div>
                      </div>

                      {checkoutMutation.isError && (
                        <p className="text-red-400 text-xs">{(checkoutMutation.error as Error).message}</p>
                      )}

                      <Button
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                        disabled={!name || checkoutMutation.isPending}
                        onClick={() => checkoutMutation.mutate()}
                      >
                        {checkoutMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Ticket className="w-4 h-4 mr-2" />
                        )}
                        {total === 0 ? "Register (Free)" : `Pay $${total.toFixed(2)}`}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Select a ticket type to continue
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
