import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api, type NrcEvent } from "@/lib/api";
import { useOrgConfig } from "@/contexts/OrgConfigContext";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export default function Events() {
  const [events, setEvents] = useState<NrcEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { config } = useOrgConfig();
  const { meeting } = config;

  useEffect(() => {
    api.getEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div className="container">
          <div className="page-header-inner">
            <div className="breadcrumb">
              <Link href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
              <span>›</span>
              <span>Events</span>
            </div>
            <h1>Upcoming Events</h1>
            <p>Join us for meetings, fundraisers, and community service activities throughout the year.</p>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          {loading ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Loading events…</span>
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <h3>No upcoming events</h3>
              <p>Check back soon — we're always planning something new for the community!</p>
            </div>
          ) : (
            <div className="cards-grid">
              {events.map(ev => (
                <Link key={ev.id} href={`/events/${ev.slug ?? ev.id}`} style={{ textDecoration: "none" }}>
                  <div className="card">
                    {ev.image_url
                      ? <img src={ev.image_url} alt={ev.title} className="card-image" />
                      : <div className="card-image-placeholder">📅</div>
                    }
                    <div className="card-body">
                      <div className="card-tag">
                        {ev.is_ticketed ? "Ticketed Event" : "Community Event"}
                      </div>
                      <h3>{ev.title}</h3>
                      {ev.description && (
                        <p>{ev.description.slice(0, 140)}{ev.description.length > 140 ? "…" : ""}</p>
                      )}
                      <div className="card-meta">
                        <span className="card-meta-item">📅 {formatDate(ev.event_date)}</span>
                      </div>
                      {ev.location && (
                        <div className="card-meta" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
                          <span className="card-meta-item">📍 {ev.location}</span>
                          {ev.is_ticketed && ev.ticket_price && (
                            <span className="card-meta-item">🎟 ${Number(ev.ticket_price).toFixed(2)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {meeting?.schedule && (
        <section className="section section-alt">
          <div className="container">
            <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
              <span className="section-eyebrow">Regular Meetings</span>
              <h2>{meeting.schedule}</h2>
              {meeting.venue && (
                <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", margin: "0 0 2rem" }}>
                  {meeting.venue}
                  {meeting.address ? `, ${meeting.address}` : ""}
                  {meeting.guestsWelcome ? " — Guests are always welcome!" : ""}
                </p>
              )}
              <Link href="/contact" className="btn btn-primary">RSVP as a Guest →</Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
