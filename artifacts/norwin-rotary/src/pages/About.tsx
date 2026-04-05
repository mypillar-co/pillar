import { Link } from "wouter";

const PROGRAMS = [
  { icon: "🎒", title: "Backpack Program", description: "Provides weekend meals to food-insecure students at Norwin schools each school week." },
  { icon: "🎓", title: "Scholarship Fund", description: "Awards college scholarships to deserving Norwin High School seniors pursuing higher education." },
  { icon: "📖", title: "Dictionary Project", description: "Distributes dictionaries to every third-grader in the Norwin School District to build literacy." },
  { icon: "🌱", title: "Community Garden", description: "Maintains a community garden at Irwin Park, providing fresh produce to local residents in need." },
  { icon: "🩺", title: "Health Screenings", description: "Organizes free health fairs and screenings for the community in partnership with local providers." },
  { icon: "🌍", title: "Polio Plus", description: "Supports Rotary International's global initiative to eradicate polio worldwide." },
];

export default function About() {
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
            <h1>About Norwin Rotary Club</h1>
            <p>Serving the Norwin community through fellowship, service, and professional development since 1972.</p>
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
                Service Above Self
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", lineHeight: 1.75, marginBottom: "1.25rem" }}>
                The Norwin Rotary Club is a chapter of Rotary International, the world's premier
                service organization. Founded in 1972, we bring together business and community
                leaders to create positive change in Irwin, PA and around the world.
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", lineHeight: 1.75, marginBottom: "2rem" }}>
                With over 100 active members, we meet every Tuesday at noon for fellowship,
                professional development, and to plan and execute projects that lift up our
                community. Every dollar raised stays local — supporting students, families, and
                neighbors throughout the Norwin School District area.
              </p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <Link href="/contact" className="btn btn-primary">Become a Member</Link>
                <Link href="/events" className="btn btn-outline">Attend a Meeting</Link>
              </div>
            </div>
            <div>
              <img
                src="https://images.unsplash.com/photo-1573497491765-57b4f23b3624?auto=format&fit=crop&w=900&q=80"
                alt="Community service"
                className="about-image"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="stats-strip">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item"><div className="stat-value">1972</div><div className="stat-label">Year Founded</div></div>
            <div className="stat-item"><div className="stat-value">100+</div><div className="stat-label">Active Members</div></div>
            <div className="stat-item"><div className="stat-value">$50K+</div><div className="stat-label">Annual Community Impact</div></div>
            <div className="stat-item"><div className="stat-value">6+</div><div className="stat-label">Active Programs</div></div>
          </div>
        </div>
      </div>

      {/* Programs */}
      <section className="section section-alt" id="programs">
        <div className="container">
          <div className="section-header">
            <span className="section-eyebrow">What We Do</span>
            <h2>Our Community Programs</h2>
            <p>From feeding hungry students to sending kids to college, here's how we serve Norwin.</p>
          </div>
          <div className="programs-grid">
            {PROGRAMS.map(p => (
              <div key={p.title} className="program-card">
                <div className="program-icon">{p.icon}</div>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Meetings */}
      <section className="section">
        <div className="container">
          <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
            <span className="section-eyebrow">Join Us</span>
            <h2>Attend a Meeting</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", margin: "0.75rem 0 2rem" }}>
              Our weekly luncheon meetings are open to guests. Come see what Rotary is about and
              how you can make a difference in the Norwin community.
            </p>
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: "2rem", marginBottom: "2rem", border: "1.5px solid var(--border)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", textAlign: "left" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.35rem" }}>When</div>
                  <div style={{ fontWeight: 600 }}>Every Tuesday</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>12:00 PM – 1:30 PM</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.35rem" }}>Where</div>
                  <div style={{ fontWeight: 600 }}>Irwin Fire Hall</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>221 Main St, Irwin PA 15642</div>
                </div>
              </div>
            </div>
            <Link href="/contact" className="btn btn-primary">RSVP as a Guest →</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
