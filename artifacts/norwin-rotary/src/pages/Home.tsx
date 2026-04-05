import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api, type OrgEvent, type BlogPost, type Sponsor } from "@/lib/api";
import { useOrgConfig } from "@/contexts/OrgConfigContext";
import NewsletterSection from "@/components/NewsletterSection";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatShortDate(d: string) {
  const date = new Date(d);
  return { month: date.toLocaleDateString("en-US", { month: "short" }), day: date.getDate() };
}

export default function Home() {
  const { config, loading } = useOrgConfig();
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    api.getEvents().then(e => setEvents(e.slice(0, 3))).catch(() => {});
    api.getBlogPosts().then(p => setPosts(p.slice(0, 3))).catch(() => {});
    api.getSponsors().then(setSponsors).catch(() => {});
  }, []);

  const hero = config.hero;

  return (
    <div>
      {/* Hero */}
      <section className="hero">
        {hero.imageUrl && (
          <div
            className="hero-bg"
            style={{ backgroundImage: `url(${hero.imageUrl})` }}
          />
        )}
        <div className="hero-overlay" />
        <div className="container">
          <div className="hero-content">
            {hero.eyebrow && (
              <div className="hero-eyebrow">
                <span>🌐</span> {hero.eyebrow}
              </div>
            )}
            <h1>{loading ? "…" : hero.headline}</h1>
            <p>{loading ? "" : hero.subtext}</p>
            <div className="hero-actions">
              <Link href="/events" className="btn btn-primary">
                {hero.ctaPrimary ?? "View Upcoming Events"}
              </Link>
              <Link href="/contact" className="btn btn-ghost">
                {hero.ctaSecondary ?? "Get Involved"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      {config.stats.length > 0 && (
        <div className="stats-strip">
          <div className="container">
            <div className="stats-grid">
              {config.stats.map((s) => (
                <div key={s.label} className="stat-item">
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                const dateKey = ev.event_date;
                const { month, day } = formatShortDate(dateKey);
                const href = ev.id ? `/events/${ev.id}` : "/events";
                return (
                  <Link key={ev.id} href={href} style={{ textDecoration: "none" }}>
                    <div className="card">
                      {ev.image_url
                        ? <img src={ev.image_url} alt={ev.title} className="card-image" />
                        : <div className="card-image-placeholder">📅</div>
                      }
                      <div className="card-body">
                        <div className="card-tag">{month} {day}</div>
                        <h3>{ev.title}</h3>
                        {ev.description && (
                          <p>{ev.description.slice(0, 120)}{ev.description.length > 120 ? "…" : ""}</p>
                        )}
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
            <Link href="/events" className="btn btn-outline">View All Events →</Link>
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
                <Link key={post.id} href={`/blog/${post.slug}`} style={{ textDecoration: "none" }}>
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
              <Link href="/blog" className="btn btn-outline">Read More News →</Link>
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
