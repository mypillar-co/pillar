import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useConfig } from "../config-context";
import { apiFetch } from "../lib/api";

interface VerifyResult {
  verified: boolean;
  saleId?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  quantity?: number;
  amountPaid?: number;
  eventName?: string;
  eventDate?: string | null;
  eventLocation?: string | null;
  confirmation?: string;
  status?: string;
  error?: string;
}

type PageState = "loading" | "verified" | "unverified" | "not_found" | "error";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatCents(dollars: number | undefined): string {
  if (dollars === undefined || dollars === null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
}

export default function TicketSuccessPage() {
  const { slug } = useParams<{ slug: string }>();
  const config = useConfig();
  const [state, setState] = useState<PageState>("loading");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  useEffect(() => {
    if (!sessionId || !slug) {
      setState("error");
      return;
    }

    let cancelled = false;

    async function verify(tries: number) {
      try {
        const res = await apiFetch(
          `/api/events/${encodeURIComponent(slug!)}/tickets/verify?session_id=${encodeURIComponent(sessionId!)}`,
        );

        if (cancelled) return;

        if (res.status === 404) {
          setState("not_found");
          return;
        }

        if (!res.ok) {
          setState("error");
          return;
        }

        const data: VerifyResult = await res.json();
        setResult(data);

        if (data.verified) {
          setState("verified");
        } else if (tries < 2) {
          // Retry once more after 1.5 s — webhook may not have fired yet
          setTimeout(() => {
            if (!cancelled) {
              setAttempt(a => a + 1);
              void verify(tries + 1);
            }
          }, 1500);
        } else {
          setState("unverified");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void verify(0);
    return () => { cancelled = true; };
  }, [slug, sessionId]);

  if (!config) return null;

  const primary = config.primaryColor ?? "#4f46e5";

  if (state === "loading") {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6 animate-pulse">
          <span className="text-3xl">🎟️</span>
        </div>
        <div className="h-6 bg-gray-100 rounded animate-pulse max-w-xs mx-auto mb-3" />
        <div className="h-4 bg-gray-100 rounded animate-pulse max-w-sm mx-auto" />
        <p className="text-sm text-gray-400 mt-6">Confirming your payment&hellip;</p>
      </div>
    );
  }

  if (state === "not_found" || state === "error") {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h1 className="text-2xl font-bold font-serif mb-3">Something Went Wrong</h1>
        <p className="text-gray-500 mb-6">
          We couldn't verify your payment. If you were charged, please contact us and we'll sort it out right away.
        </p>
        <Link href="/events">
          <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: primary }}>
            Back to Events
          </button>
        </Link>
      </div>
    );
  }

  if (state === "unverified") {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">⏳</span>
        </div>
        <h1 className="text-2xl font-bold font-serif mb-3">Payment Pending</h1>
        <p className="text-gray-500 mb-3">
          Your payment hasn't been confirmed yet. This is sometimes delayed by a few minutes.
        </p>
        <p className="text-sm text-gray-400 mb-6">
          If you completed checkout, you'll receive a confirmation email shortly. If you have questions, please contact us.
        </p>
        <Link href="/events">
          <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: primary }}>
            Back to Events
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <span className="text-3xl">🎉</span>
      </div>
      <h1 className="text-3xl font-bold font-serif mb-2">You're In!</h1>
      {result?.attendeeName && (
        <p className="text-gray-500 mb-6">Welcome, <strong>{result.attendeeName}</strong>. Your tickets are confirmed.</p>
      )}

      <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left space-y-3">
        {result?.eventName && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Event</p>
            <p className="font-semibold text-gray-800">{result.eventName}</p>
          </div>
        )}
        {result?.eventDate && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Date</p>
            <p className="text-gray-700">{formatDate(result.eventDate)}</p>
          </div>
        )}
        {result?.eventLocation && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Location</p>
            <p className="text-gray-700">{result.eventLocation}</p>
          </div>
        )}
        {result?.quantity !== undefined && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Tickets</p>
            <p className="text-gray-700">{result.quantity} {result.quantity === 1 ? "ticket" : "tickets"}</p>
          </div>
        )}
        {result?.amountPaid !== undefined && result.amountPaid > 0 && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Amount Paid</p>
            <p className="text-gray-700">{formatCents(result.amountPaid)}</p>
          </div>
        )}
        {result?.confirmation && (
          <div className="border-t border-gray-200 pt-3 mt-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Confirmation</p>
            <p className="font-mono font-bold text-gray-800 text-lg tracking-widest">{result.confirmation}</p>
          </div>
        )}
      </div>

      {result?.attendeeEmail && (
        <p className="text-sm text-gray-400 mb-8">
          A confirmation email has been sent to <strong>{result.attendeeEmail}</strong>.
        </p>
      )}

      <Link href="/events">
        <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: primary }}>
          View More Events
        </button>
      </Link>
    </div>
  );
}
