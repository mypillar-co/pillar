import React from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Ticket, ArrowLeft, Calendar, MapPin, Loader2, AlertCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

type VerifyResult = {
  verified: boolean;
  saleId?: string;
  attendeeName?: string;
  attendeeEmail?: string | null;
  quantity?: number;
  amountPaid?: number;
  eventName?: string;
  eventDate?: string | null;
  eventLocation?: string | null;
  confirmation?: string;
  status?: string;
};

async function verifySession(slug: string, sessionId: string): Promise<VerifyResult> {
  const res = await fetch(`/api/public/events/${slug}/tickets/verify?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Verification failed");
  }
  return res.json();
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function TicketSuccess() {
  const [, params] = useRoute("/events/:slug/tickets/success");
  const slug = params?.slug ?? "";

  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get("session_id");
  const saleId = searchParams.get("saleId");

  const isFree = !sessionId;

  const { data, isLoading, error } = useQuery<VerifyResult>({
    queryKey: ["ticket-verify", sessionId],
    queryFn: () => verifySession(slug, sessionId!),
    enabled: !!sessionId && !!slug,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 8000),
    staleTime: Infinity,
  });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!isFree && isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Confirming your purchase…</p>
        </div>
      </div>
    );
  }

  // ── Verification error ────────────────────────────────────────────────────
  if (!isFree && error) {
    return (
      <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center px-4">
        <Card className="border-red-500/20 bg-red-500/5 max-w-md w-full">
          <CardContent className="py-10 text-center">
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Verification Failed</h2>
            <p className="text-sm text-muted-foreground mb-6">
              We couldn't verify your payment right now. If you were charged, please contact us with your
              confirmation code and we'll sort it out.
            </p>
            <Link href={`/events/${slug}/tickets`}>
              <Button variant="outline" className="border-white/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tickets
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Payment not yet confirmed ─────────────────────────────────────────────
  if (!isFree && data && !data.verified) {
    return (
      <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center px-4">
        <Card className="border-yellow-500/20 bg-yellow-500/5 max-w-md w-full">
          <CardContent className="py-10 text-center">
            <AlertCircle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Payment Pending</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your payment is being processed. You'll receive a confirmation email once it's complete.
            </p>
            <Link href={`/events/${slug}/tickets`}>
              <Button variant="outline" className="border-white/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tickets
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Confirmed state ───────────────────────────────────────────────────────
  const confirmed = isFree ? null : data;
  const confirmation = confirmed?.confirmation ?? (saleId ? saleId.slice(-8).toUpperCase() : null);

  return (
    <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center px-4">
      <Card className="border-white/10 bg-card/60 max-w-md w-full">
        <CardContent className="py-10 text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">
            {isFree ? "Registration Confirmed!" : "Tickets Confirmed!"}
          </h1>

          {confirmed?.attendeeName && (
            <p className="text-muted-foreground text-sm mb-4">
              Thanks, <span className="text-white font-medium">{confirmed.attendeeName}</span>!
            </p>
          )}

          {confirmed && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-5 text-left space-y-2">
              {confirmed.eventName && (
                <div className="flex items-center gap-2 text-sm">
                  <Ticket className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-white font-medium">{confirmed.eventName}</span>
                </div>
              )}
              {confirmed.eventDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>{formatDate(confirmed.eventDate)}</span>
                </div>
              )}
              {confirmed.eventLocation && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>{confirmed.eventLocation}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2 mt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">Qty</span>
                <span className="text-white">{confirmed.quantity ?? 1}</span>
              </div>
              {(confirmed.amountPaid ?? 0) > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="text-white">${(confirmed.amountPaid ?? 0).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {confirmation && (
            <div className="mb-5">
              <p className="text-xs text-muted-foreground mb-1">Confirmation code</p>
              <p className="text-lg font-mono font-bold text-primary tracking-widest">{confirmation}</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground mb-6">
            {confirmed?.attendeeEmail
              ? `A confirmation has been sent to ${confirmed.attendeeEmail}.`
              : "You should receive a confirmation email shortly with your ticket details."}
          </p>

          <Link href={`/events/${slug}/tickets`}>
            <Button variant="outline" className="border-white/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Event
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Powered by Pillar */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 py-3 text-center">
        <a
          href="https://mypillar.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-slate-300 transition-colors"
        >
          Powered by <span className="text-primary font-semibold">Pillar</span> — AI for civic organizations
        </a>
      </div>
    </div>
  );
}
