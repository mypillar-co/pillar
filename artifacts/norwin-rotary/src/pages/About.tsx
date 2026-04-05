import { Link } from "wouter";
import { useOrgConfig } from "@/contexts/OrgConfigContext";

export default function About() {
  const { config, loading } = useOrgConfig();
  const { about, stats, programs, meeting, name } = config;

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div className="container">
            <div className="page-header-inner">
              <h1>About</h1>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="container">
          <div className="page-header-inner">
            <div className="breadcrumb">
              <Link href="/" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>Home</Link>
              <span>›</span>
              <span>About</span>
            </div>
            <h1>About {name}</h1>
            <p>{about.description1}</p>
          </div>
        </div>
      </div>

      {/* Mission */}
      <section className="section">
        <div className="container">
          <div className="about-grid">
            <div>
              <span className="section-eyebrow">Our Mission</span>
              <h2 style={{ fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 800, margin: "0.5rem 0 1rem" }}>
                {about.mission}
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", lineHeight: 1.75, marginBottom: "1.25rem" }}>
                {about.description1}
              </p>
              {about.description2 && (
                <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", lineHeight: 1.75, marginBottom: "2rem" }}>
                  {about.description2}
                </p>
              )}
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <Link href="/contact" className="btn btn-primary">Become a Member</Link>
                <Link href="/events" className="btn btn-outline">Attend a Meeting</Link>
              </div>
            </div>
            <div>
              {about.imageUrl ? (
                <img
                  src={about.imageUrl}
                  alt="Community service"
                  className="about-image"
                />
              ) : (
                <div
                  className="about-image"
                  style={{
                    background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "5rem",
                    minHeight: 320,
                    borderRadius: 16,
                  }}
                >
                  🤝
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="stats-strip">
          <div className="container">
            <div className="stats-grid">
              {stats.map((s) => (
                <div key={s.label} className="stat-item">
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Programs */}
      {programs.length > 0 && (
        <section className="section section-alt" id="programs">
          <div className="container">
            <div className="section-header">
              <span className="section-eyebrow">What We Do</span>
              <h2>Our Community Programs</h2>
              <p>Here's how we serve our community every day.</p>
            </div>
            <div className="programs-grid">
              {programs.map(p => (
                <div key={p.title} className="program-card">
                  <div className="program-icon">{p.icon}</div>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Meetings */}
      {meeting && (meeting.schedule || meeting.venue) && (
        <section className="section">
          <div className="container">
            <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
              <span className="section-eyebrow">Join Us</span>
              <h2>Attend a Meeting</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", margin: "0.75rem 0 2rem" }}>
                Our meetings are open to guests. Come see what we're about and how you can make
                a difference in the community.
              </p>
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: "2rem", marginBottom: "2rem", border: "1.5px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", textAlign: "left" }}>
                  {meeting.schedule && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.35rem" }}>When</div>
                      <div style={{ fontWeight: 600 }}>{meeting.schedule}</div>
                      {meeting.duration && <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{meeting.duration}</div>}
                    </div>
                  )}
                  {meeting.venue && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.35rem" }}>Where</div>
                      <div style={{ fontWeight: 600 }}>{meeting.venue}</div>
                      {meeting.address && <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{meeting.address}</div>}
                    </div>
                  )}
                </div>
              </div>
              <Link href="/contact" className="btn btn-primary">RSVP as a Guest →</Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
