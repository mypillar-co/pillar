import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api, type NrcEvent, type BlogPost, type Sponsor } from "@/lib/api";
import NewsletterSection from "@/components/NewsletterSection";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function path(p: string) { return `${BASE}${p}`; }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatShortDate(d: string) {
  const date = new Date(d);
  return { month: date.toLocaleDateString("en-US", { month: "short" }), day: date.getDate() };
}

export default function Home() {
  const [events, setEvents] = useState<NrcEvent[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    api.getEvents().then(e => setEvents(e.slice(0, 3))).catch(() => {});
    api.getBlogPosts().then(p => setPosts(p.slice(0, 3))).catch(() => {});
    api.getSponsors().then(setSponsors).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="hero">
        <div
          className="hero-bg"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1529156069898-aa78f52d3b87?auto=format&fit=crop&w=1920&q=80)" }}
        />
        <div className="hero-overlay" />
        <div className="container">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span>🌐</span> Rotary International — District 7300
            </div>
            <h1>Service Above Self</h1>
            <p>
              Serving the Norwin community through local projects, scholarships, and fellowship
              since 1972. Join us every Tuesday at noon.
            </p>
            <div className="hero-actions">
              <Link href={path("/events")} className="btn btn-primary">View Upcoming Events</Link>
              <Link href={path("/contact")} className="btn btn-ghost">Get Involved</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="stats-strip">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">1972</div>
              <div className="stat-label">Year Founded</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">100+</div>
              <div className="stat-label">Active Members</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">50+</div>
              <div className="stat-label">Years of Service</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">$50K+</div>
              <div className="stat-label">Annual Community Impact</div>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="section-eyebrow">Calendar</span>
            <h2>Upcoming Events</h2>
            <p>Join us for our upcoming meetings, fundraisers, and community service events.</p>
          </div>
          {events.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <h3>No upcoming events</h3>
              <p>Check back soon — we're always planning something new!</p>
            </div>
          ) : (
            <div className="cards-grid">
              {events.map(ev => {
                const { month, day } = formatShortDate(ev.event_date);
                return (
                  <Link key={ev.id} href={path(`/events/${ev.id}`)} style={{ textDecoration: "none" }}>
                    <div className="card">
                      {ev.image_url
                        ? <img src={ev.image_url} alt={ev.title} className="card-image" />
                        : <div className="card-image-placeholder">📅</div>
                      }
                      <div className="card-body">
                        <div className="card-tag">
                          {month} {day}
                        </div>
                        <h3>{ev.title}</h3>
                        {ev.description && <p>{ev.description.slice(0, 120)}{ev.description.length > 120 ? "…" : ""}</p>}
                        <div className="card-meta">
                          {ev.location && <span className="card-meta-item">📍 {ev.location}</span>}
                          {ev.is_ticketed && ev.ticket_price && (
                            <span className="card-meta-item">🎟 ${ev.ticket_price}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
            <Link href={path("/events")} className="btn btn-outline">View All Events →</Link>
          </div>
        </div>
      </section>

      {/* Recent News */}
      {posts.length > 0 && (
        <section className="section section-alt">
          <div className="container">
            <div className="section-header">
              <span className="section-eyebrow">Community News</span>
              <h2>Latest from the Club</h2>
            </div>
            <div className="cards-grid">
              {posts.map(post => (
                <Link key={post.id} href={path(`/blog/${post.slug}`)} style={{ textDecoration: "none" }}>
                  <div className="card">
                    {post.cover_image_url
                      ? <img src={post.cover_image_url} alt={post.title} className="card-image" />
                      : <div className="card-image-placeholder">📰</div>
                    }
                    <div className="card-body">
                      <div className="card-tag">News</div>
                      <h3>{post.title}</h3>
                      {post.excerpt && <p>{post.excerpt}</p>}
                      <div className="card-meta">
                        <span className="card-meta-item">✍️ {post.author}</span>
                        {post.published_at && (
                          <span className="card-meta-item">{formatDate(post.published_at)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
              <Link href={path("/blog")} className="btn btn-outline">Read More News →</Link>
            </div>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <NewsletterSection />

      {/* Sponsors */}
      {sponsors.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <span className="section-eyebrow">Community Partners</span>
              <h2>Our Sponsors</h2>
              <p>Thank you to our generous community partners who make our work possible.</p>
            </div>
            <div className="sponsors-grid">
              {sponsors.map(s => (
                s.website_url
                  ? <a key={s.id} href={s.website_url} target="_blank" rel="noopener noreferrer" className="sponsor-logo">
                      {s.logo_url ? <img src={s.logo_url} alt={s.name} /> : s.name}
                    </a>
                  : <div key={s.id} className="sponsor-logo">
                      {s.logo_url ? <img src={s.logo_url} alt={s.name} /> : s.name}
                    </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
