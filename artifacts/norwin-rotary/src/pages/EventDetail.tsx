import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { api, type NrcEvent } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function path(p: string) { return `${BASE}${p}`; }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<NrcEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.getEvent(id)
      .then(setEvent)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !buyerEmail) return;
    setCheckingOut(true);
    setCheckoutError("");
    try {
      const res = await api.checkout({
        event_id: event.id,
        quantity: qty,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
      });
      if (res.url) window.location.href = res.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-center" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
        <span>Loading event…</span>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="empty-state" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="empty-state-icon">😕</div>
        <h3>Event Not Found</h3>
        <p>This event may have been removed or the link is incorrect.</p>
        <Link href={path("/events")} className="btn btn-outline" style={{ marginTop: "1.5rem" }}>← Back to Events</Link>
      </div>
    );
  }

  const spotsLeft = event.ticket_capacity
    ? event.ticket_capacity - (event.tickets_sold ?? 0)
    : null;

  return (
    <div>
      <div className="page-header">
        <div className="container">
          <div className="page-header-inner">
            <div className="breadcrumb">
              <Link href={path("/")} style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
              <span>›</span>
              <Link href={path("/events")} style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Events</Link>
              <span>›</span>
              <span>{event.title}</span>
            </div>
            <h1>{event.title}</h1>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="event-detail-grid">
            <div>
              {event.image_url && (
                <img src={event.image_url} alt={event.title} className="event-detail-image" />
              )}
              <div className="prose">
                {event.description
                  ? event.description.split("\n").map((p, i) => <p key={i}>{p}</p>)
                  : <p>Join us for this community event. All are welcome!</p>
                }
              </div>
            </div>

            <div>
              <div className="event-sidebar-card">
                {event.is_ticketed && event.ticket_price ? (
                  <>
                    <div className="event-sidebar-price">${Number(event.ticket_price).toFixed(2)}</div>
                    <div className="event-sidebar-label">per ticket</div>
                  </>
                ) : (
                  <>
                    <div className="event-sidebar-price">Free</div>
                    <div className="event-sidebar-label">no cost to attend</div>
                  </>
                )}

                <div>
                  <div className="event-info-row">
                    <span className="event-info-icon">📅</span>
                    <div>
                      <div className="event-info-label">Date</div>
                      <div className="event-info-value">{formatDate(event.event_date)}</div>
                    </div>
                  </div>
                  <div className="event-info-row">
                    <span className="event-info-icon">⏰</span>
                    <div>
                      <div className="event-info-label">Time</div>
                      <div className="event-info-value">
                        {formatTime(event.event_date)}
                        {event.end_date && ` – ${formatTime(event.end_date)}`}
                      </div>
                    </div>
                  </div>
                  {event.location && (
                    <div className="event-info-row">
                      <span className="event-info-icon">📍</span>
                      <div>
                        <div className="event-info-label">Location</div>
                        <div className="event-info-value">{event.location}</div>
                      </div>
                    </div>
                  )}
                  {spotsLeft !== null && (
                    <div className="event-info-row">
                      <span className="event-info-icon">🎟</span>
                      <div>
                        <div className="event-info-label">Availability</div>
                        <div className="event-info-value">
                          {spotsLeft <= 0 ? "Sold out" : `${spotsLeft} spots remaining`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {event.is_ticketed && event.ticket_price && Number(event.ticket_price) > 0 ? (
                  <form onSubmit={handleCheckout} style={{ marginTop: "1.5rem" }}>
                    <div className="form-group">
                      <label className="form-label">Your Name</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Full name"
                        value={buyerName}
                        onChange={e => setBuyerName(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email *</label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="you@example.com"
                        value={buyerEmail}
                        onChange={e => setBuyerEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Quantity</label>
                      <select
                        className="form-select"
                        value={qty}
                        onChange={e => setQty(Number(e.target.value))}
                      >
                        {[1,2,3,4,5,6,7,8].map(n => (
                          <option key={n} value={n}>{n} ticket{n > 1 ? "s" : ""} — ${(Number(event.ticket_price) * n).toFixed(2)}</option>
                        ))}
                      </select>
                    </div>
                    {checkoutError && (
                      <div className="alert alert-error">{checkoutError}</div>
                    )}
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                      disabled={checkingOut || (spotsLeft !== null && spotsLeft <= 0)}
                    >
                      {checkingOut ? "Redirecting…" : spotsLeft !== null && spotsLeft <= 0 ? "Sold Out" : "Purchase Tickets →"}
                    </button>
                  </form>
                ) : (
                  <div style={{ marginTop: "1.5rem" }}>
                    <Link href={path("/contact")} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", display: "flex" }}>
                      RSVP / Get Info →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
