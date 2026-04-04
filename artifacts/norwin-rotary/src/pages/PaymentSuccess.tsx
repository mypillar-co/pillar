import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function path(p: string) { return `${BASE}${p}`; }

export default function PaymentSuccess() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const eventId = params.get("event_id");
  const [status, setStatus] = useState<"loading" | "paid" | "unpaid" | "error">("loading");

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    api.verifyTicket(sessionId)
      .then(res => setStatus(res.status === "paid" ? "paid" : "unpaid"))
      .catch(() => setStatus("error"));
  }, [sessionId]);

  return (
    <div className="success-page">
      {status === "loading" && (
        <div className="success-card">
          <div className="spinner" style={{ margin: "0 auto 1.5rem" }} />
          <p>Verifying your purchase…</p>
        </div>
      )}

      {status === "paid" && (
        <div className="success-card">
          <div className="success-icon">🎉</div>
          <h1>You're All Set!</h1>
          <p>Your ticket purchase was successful. We'll send confirmation details to your email. We can't wait to see you there!</p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            {eventId && (
              <Link href={path(`/events/${eventId}`)} className="btn btn-outline">← Back to Event</Link>
            )}
            <Link href={path("/events")} className="btn btn-primary">View All Events →</Link>
          </div>
        </div>
      )}

      {(status === "unpaid" || status === "error") && (
        <div className="success-card">
          <div className="success-icon">⚠️</div>
          <h1>Payment Not Confirmed</h1>
          <p>We couldn't confirm your payment. If you believe this is an error, please contact us at info@norwinrotary.org</p>
          <Link href={path("/events")} className="btn btn-outline">← Back to Events</Link>
        </div>
      )}
    </div>
  );
}
