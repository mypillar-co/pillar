/**
 * One-shot script: build and publish the Norwin Rotary test site directly to the DB.
 * Run: node artifacts/api-server/scripts/publish-norwin-test.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// pg is in lib/db's node_modules
const pg = require("/home/runner/workspace/lib/db/node_modules/pg");
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// ── Look up org ──────────────────────────────────────────────────────────────
const orgRes = await client.query(
  `SELECT id, name, slug FROM organizations WHERE slug = $1 LIMIT 1`,
  ["norwin-rotary-club"]
);
if (!orgRes.rows.length) {
  console.error("Org norwin-rotary-club not found");
  process.exit(1);
}
const org = orgRes.rows[0];
console.log(`Building site for: ${org.name} (${org.slug})`);

const slug = org.slug;

// ── Seed test events ─────────────────────────────────────────────────────────
const SELFTEST_PREFIX = "selftest-";

const demoEvents = [
  {
    name: "Annual Golf Outing",
    baseSlug: "selftest-annual-golf-outing",
    description: "18-hole scramble format with lunch, prizes, and silent auction. Register as a foursome or individually.",
    startDate: "2026-06-14", startTime: "8:00 AM", endTime: null,
    location: "Youghiogheny Country Club", eventType: "Fundraiser",
    featured: true, isTicketed: true, ticketPrice: 125, ticketCapacity: 144,
    hasRegistration: true, hasSponsorSection: true,
    day: "14", month: "JUN",
  },
  {
    name: "Backpack Program Packing Night",
    baseSlug: "selftest-backpack-program-packing-night",
    description: "Volunteers pack weekend meal bags for food-insecure students at Norwin schools. No experience needed.",
    startDate: "2026-08-20", startTime: "6:00 PM", endTime: "8:00 PM",
    location: "Norwin School District Warehouse", eventType: "Community Service",
    featured: true, isTicketed: false, ticketPrice: null, ticketCapacity: null,
    hasRegistration: false, hasSponsorSection: false,
    day: "20", month: "AUG",
  },
  {
    name: "Annual Chili Cookoff",
    baseSlug: "selftest-annual-chili-cookoff",
    description: "Teams compete for the best chili in Irwin. Public tasting tickets available — come hungry.",
    startDate: "2026-10-10", startTime: "11:00 AM", endTime: "3:00 PM",
    location: "Main Street, Irwin", eventType: "Community",
    featured: true, isTicketed: true, ticketPrice: 10, ticketCapacity: 300,
    hasRegistration: true, hasSponsorSection: false,
    day: "10", month: "OCT",
  },
  {
    name: "Weekly Meetings",
    baseSlug: "selftest-weekly-meetings",
    description: "Regular weekly meeting of the Norwin Rotary Club. Every Tuesday at noon. Guests welcome.",
    startDate: "2026-04-07", startTime: "12:00 PM", endTime: "1:00 PM",
    location: "Irwin Fire Hall, 221 Main St, Irwin, PA 15642", eventType: "Meeting",
    featured: false, isTicketed: false, ticketPrice: null, ticketCapacity: null,
    hasRegistration: false, hasSponsorSection: false,
    day: "07", month: "APR",
  },
];

const seededSlugs = {};
for (const ev of demoEvents) {
  const existing = await client.query(
    `SELECT id, slug FROM events WHERE org_id = $1 AND slug LIKE $2 LIMIT 1`,
    [org.id, ev.baseSlug + "%"]
  );
  if (existing.rows.length) {
    seededSlugs[ev.name] = existing.rows[0].slug;
    console.log(`  Reusing event: ${ev.name} (${existing.rows[0].slug})`);
    continue;
  }
  const uniqueSlug = `${ev.baseSlug}-${Date.now().toString(36)}`;
  const ins = await client.query(
    `INSERT INTO events (org_id, name, slug, description, start_date, start_time, end_time, location,
      event_type, featured, featured_on_site, is_ticketed, ticket_price, ticket_capacity,
      has_registration, has_sponsor_section, status, is_active, show_on_public_site)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'published',true,true)
     RETURNING id, slug`,
    [org.id, ev.name, uniqueSlug, ev.description, ev.startDate, ev.startTime, ev.endTime,
     ev.location, ev.eventType, ev.featured, ev.featured, ev.isTicketed, ev.ticketPrice,
     ev.ticketCapacity, ev.hasRegistration, ev.hasSponsorSection]
  );
  const created = ins.rows[0];
  seededSlugs[ev.name] = uniqueSlug;
  console.log(`  Created event: ${ev.name} (${uniqueSlug})`);

  if (ev.isTicketed && ev.ticketPrice != null) {
    await client.query(
      `INSERT INTO ticket_types (event_id, org_id, name, price, quantity, is_active)
       VALUES ($1,$2,'General Admission',$3,$4,true)`,
      [created.id, org.id, ev.ticketPrice, ev.ticketCapacity]
    );
    console.log(`    → Added ticket type: $${ev.ticketPrice}, qty ${ev.ticketCapacity}`);
  }
}

// ── Build HTML ────────────────────────────────────────────────────────────────
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const eventRowsData = [
  { name: "Annual Golf Outing", slug: seededSlugs["Annual Golf Outing"], day: "14", month: "JUN", time: "8:00 AM", location: "Youghiogheny Country Club", desc: "18-hole scramble with lunch, prizes, and silent auction.", price: 125, hasReg: true },
  { name: "Backpack Program Packing Night", slug: seededSlugs["Backpack Program Packing Night"], day: "20", month: "AUG", time: "6:00 PM – 8:00 PM", location: "Norwin School District Warehouse", desc: "Volunteers pack weekend meal bags for food-insecure students at Norwin schools.", price: null, hasReg: false },
  { name: "Annual Chili Cookoff", slug: seededSlugs["Annual Chili Cookoff"], day: "10", month: "OCT", time: "11:00 AM – 3:00 PM", location: "Main Street, Irwin", desc: "Teams compete for the best chili in Irwin. Public tasting tickets available.", price: 10, hasReg: true },
  { name: "Weekly Meetings", slug: seededSlugs["Weekly Meetings"], day: "TUE", month: "WKL", time: "12:00 – 1:00 PM", location: "Irwin Fire Hall, 221 Main St", desc: "Regular weekly meeting. Every Tuesday at noon. Guests welcome.", price: null, hasReg: false },
];

const buildEventRow = (e) => {
  const eventUrl = `https://${slug}.mypillar.co/events/${e.slug}`;
  const priceStr = e.price ? `<span style="font-weight:700;color:#f7a81b"> — $${e.price}</span>` : "";
  const btn = e.hasReg
    ? `<a href="${eventUrl}" class="btn-primary" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem">Get Tickets →</a>`
    : `<a href="${eventUrl}" class="btn-ghost" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem">View Details →</a>`;
  return `<div class="event-row reveal">
    <div class="event-date-block"><span class="event-day">${esc(e.day)}</span><span class="event-month">${esc(e.month)}</span></div>
    <div class="event-info">
      <h4>${esc(e.name)}${priceStr}</h4>
      <p>${esc(e.desc)}</p>
      <div class="event-meta"><span class="event-meta-item">⏰ ${esc(e.time)}</span><span class="event-meta-item">📍 ${esc(e.location)}</span></div>
      ${btn}
    </div>
  </div>`;
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Norwin Rotary Club — Service Above Self</title>
  <meta name="description" content="A Rotary International service club serving the Norwin community through local projects, scholarships, and fellowship.">
  <link rel="canonical" href="https://${slug}.mypillar.co">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0c4da2;
      --primary-rgb: 12,77,162;
      --accent: #f7a81b;
      --bg: #ffffff;
      --bg-alt: #f8fafc;
      --text: #0f172a;
      --text-light: #475569;
      --border: #e2e8f0;
      --radius: 12px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; }

    /* Nav */
    nav { background: var(--primary); padding: 0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
    .nav-logo { color: #fff; font-weight: 800; font-size: 1.1rem; letter-spacing: -0.02em; }
    .nav-links { display: flex; gap: 1.5rem; }
    .nav-links a { color: rgba(255,255,255,0.85); font-size: 0.9rem; font-weight: 500; transition: color 0.2s; }
    .nav-links a:hover { color: var(--accent); }
    .btn-primary { background: var(--accent); color: #0f172a; padding: 0.6rem 1.4rem; border-radius: 8px; font-weight: 700; font-size: 0.9rem; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: filter 0.2s, transform 0.15s; }
    .btn-primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
    .btn-ghost { background: transparent; color: var(--text); padding: 0.6rem 1.4rem; border-radius: 8px; font-weight: 600; font-size: 0.9rem; border: 2px solid var(--border); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: border-color 0.2s, color 0.2s; }
    .btn-ghost:hover { border-color: var(--primary); color: var(--primary); }

    /* Hero */
    .hero { position: relative; min-height: 600px; display: flex; align-items: center; overflow: hidden; background: var(--primary); }
    .hero.hero--photo .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.35; }
    .hero-body { position: relative; z-index: 2; max-width: 700px; padding: 6rem 0; }
    .hero-eyebrow { display: inline-block; background: var(--accent); color: #0f172a; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.25rem 0.75rem; border-radius: 4px; margin-bottom: 1.25rem; }
    .hero-title { font-size: clamp(2.2rem, 5vw, 3.6rem); font-weight: 800; color: #fff; line-height: 1.1; margin-bottom: 1.25rem; letter-spacing: -0.03em; }
    .hero-sub { font-size: 1.15rem; color: rgba(255,255,255,0.85); max-width: 520px; margin-bottom: 2rem; line-height: 1.65; }
    .hero-ctas { display: flex; gap: 1rem; flex-wrap: wrap; }

    /* Sections */
    section { padding: 5rem 0; }
    .section-header { text-align: center; margin-bottom: 3rem; }
    .eyebrow { display: inline-block; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin-bottom: 0.75rem; }
    h2 { font-size: clamp(1.8rem, 3.5vw, 2.5rem); font-weight: 800; color: var(--text); letter-spacing: -0.03em; line-height: 1.2; }
    h3 { font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 0.5rem; }

    /* About */
    .about { background: var(--bg-alt); }
    .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5rem; align-items: center; }
    .about-img-wrap img { border-radius: var(--radius); width: 100%; aspect-ratio: 4/3; object-fit: cover; }
    .about-content p { color: var(--text-light); font-size: 1.05rem; line-height: 1.75; }
    @media (max-width: 768px) { .about-grid { grid-template-columns: 1fr; } .nav-links { display: none; } }

    /* Stats */
    .stats-strip { background: var(--primary); padding: 3rem 0; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; text-align: center; }
    .stat-value { font-size: 2.2rem; font-weight: 800; color: var(--accent); line-height: 1; margin-bottom: 0.35rem; }
    .stat-label { font-size: 0.85rem; font-weight: 500; color: rgba(255,255,255,0.75); text-transform: uppercase; letter-spacing: 0.06em; }
    @media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }

    /* Programs */
    .programs { background: var(--bg); }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; }
    .card { background: #fff; border: 1px solid var(--border); border-top: 4px solid var(--primary); border-radius: var(--radius); padding: 1.75rem; transition: box-shadow 0.2s, transform 0.2s; }
    .card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.1); transform: translateY(-3px); }
    .card-category { font-size: 1.75rem; display: block; margin-bottom: 0.75rem; }
    .card p { color: var(--text-light); font-size: 0.9rem; line-height: 1.6; }

    /* Events */
    .events { background: var(--bg-alt); }
    .events-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .event-row { display: grid; grid-template-columns: 80px 1fr; gap: 20px; align-items: center; padding: 20px; background: #fff; border-radius: var(--radius); box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid var(--border); border-left: 4px solid var(--primary); }
    .event-date-block { text-align: center; }
    .event-day { display: block; font-size: 1.8rem; font-weight: 800; color: var(--primary); line-height: 1; }
    .event-month { display: block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; color: var(--text-light); text-transform: uppercase; margin-top: 2px; }
    .event-info h4 { font-size: 1.05rem; font-weight: 700; color: var(--text); margin-bottom: 0.4rem; }
    .event-info p { font-size: 0.875rem; color: var(--text-light); margin-bottom: 0.4rem; }
    .event-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
    .event-meta-item { font-size: 0.82rem; color: var(--text-light); }

    /* Featured event */
    .featured-event { background: var(--primary); text-align: center; }
    .featured-event h2, .featured-event .eyebrow { color: #fff; }
    .featured-event .eyebrow { color: var(--accent); }
    .featured-event p { color: rgba(255,255,255,0.85); max-width: 600px; margin: 0 auto 2rem; font-size: 1.05rem; }
    .featured-ctas { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

    /* Contact */
    .contact { background: var(--bg); }
    .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; }
    .contact-info h2 { margin-bottom: 1rem; }
    .contact-info p { color: var(--text-light); margin-bottom: 1.5rem; }
    address { font-style: normal; line-height: 2.2; color: var(--text-light); font-size: 0.95rem; }
    .contact-card { background: var(--primary); color: #fff; border-radius: var(--radius); padding: 2rem; }
    .contact-card h4 { font-size: 1.2rem; margin-bottom: 0.75rem; }
    .contact-card p { color: rgba(255,255,255,0.8); margin-bottom: 1.5rem; }
    @media (max-width: 768px) { .contact-grid { grid-template-columns: 1fr; } }

    /* Footer */
    footer { background: #0a0f1a; color: rgba(255,255,255,0.7); padding: 4rem 0 2rem; }
    .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 2rem; margin-bottom: 3rem; }
    .footer-brand-name { font-size: 1.1rem; font-weight: 800; color: #fff; margin-bottom: 0.75rem; }
    .footer-col h4 { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 1rem; }
    .footer-col p, .footer-col li { font-size: 0.875rem; line-height: 2; }
    .footer-col ul { list-style: none; }
    .footer-col a { color: rgba(255,255,255,0.65); transition: color 0.2s; }
    .footer-col a:hover { color: var(--accent); }
    .footer-bottom { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: gap; gap: 1rem; font-size: 0.8rem; }
    .powered-by { color: rgba(255,255,255,0.4); }
    .powered-by a { color: var(--accent); font-weight: 600; }
    @media (max-width: 768px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>

<nav>
  <div class="container nav-inner">
    <div class="nav-logo">Norwin Rotary Club</div>
    <div class="nav-links">
      <a href="#about">About</a>
      <a href="#programs">Programs</a>
      <a href="#events">Events</a>
      <a href="#contact">Contact</a>
    </div>
    <a href="#contact" class="btn-primary" style="font-size:0.85rem;padding:0.5rem 1.1rem">Get Involved</a>
  </div>
</nav>

<section class="hero hero--photo">
  <img class="hero-img" src="https://images.unsplash.com/photo-1529156069898-aa78f52d3b87?auto=format&fit=crop&w=1920&q=80" alt="Norwin Rotary Club">
  <div class="container">
    <div class="hero-body">
      <div class="hero-eyebrow">Rotary International — District 7305</div>
      <h1 class="hero-title">Service Above Self</h1>
      <p class="hero-sub">A Rotary International service club serving the Norwin community through local projects, scholarships, and fellowship since 1972.</p>
      <div class="hero-ctas">
        <a href="#events" class="btn-primary">View Upcoming Events</a>
        <a href="#contact" class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.4)">Get Involved</a>
      </div>
    </div>
  </div>
</section>

<section class="stats-strip">
  <div class="container">
    <div class="stats-grid">
      <div class="stat-item"><div class="stat-value">1972</div><div class="stat-label">Year Founded</div></div>
      <div class="stat-item"><div class="stat-value">100+</div><div class="stat-label">Active Members</div></div>
      <div class="stat-item"><div class="stat-value">50+</div><div class="stat-label">Years of Service</div></div>
      <div class="stat-item"><div class="stat-value">$50K+</div><div class="stat-label">Annual Impact</div></div>
    </div>
  </div>
</section>

<section class="about" id="about">
  <div class="container">
    <div class="about-grid">
      <div class="about-img-wrap">
        <img src="https://images.unsplash.com/photo-1573497491765-57b4f23b3624?auto=format&fit=crop&w=900&q=80" alt="Norwin Rotary Club members">
      </div>
      <div class="about-content">
        <span class="eyebrow">Who We Are</span>
        <h2 style="margin-bottom:1rem">Serving Our Community Since 1972</h2>
        <p>The Norwin Rotary Club is a member of Rotary International, the world&#8217;s oldest and largest service organization. We bring together business and professional leaders committed to providing humanitarian service, encouraging high ethical standards, and advancing goodwill and peace.</p>
        <p style="margin-top:1rem">We meet every Tuesday at 12:00 PM at the Irwin Fire Hall, 221 Main St, Irwin, PA 15642. New members are always welcome!</p>
        <a href="#contact" class="btn-primary" style="margin-top:1.5rem">Learn About Membership</a>
      </div>
    </div>
  </div>
</section>

<section class="featured-event">
  <div class="container">
    <div class="section-header">
      <span class="eyebrow">Featured Fundraiser</span>
      <h2 style="color:#fff">Annual Golf Outing</h2>
    </div>
    <p>18-hole scramble format at Youghiogheny Country Club — Saturday, June 14, 2026 at 8:00 AM shotgun start. Includes lunch, prizes, and silent auction. Proceeds benefit local scholarships and community programs.</p>
    <div class="featured-ctas">
      <a href="https://${slug}.mypillar.co/events/${seededSlugs["Annual Golf Outing"] ?? "selftest-annual-golf-outing"}" class="btn-primary">Get Tickets — $125</a>
      <a href="https://${slug}.mypillar.co/events/${seededSlugs["Annual Golf Outing"] ?? "selftest-annual-golf-outing"}" class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.4)">Become a Sponsor</a>
    </div>
  </div>
</section>

<section class="programs" id="programs">
  <div class="container">
    <div class="section-header">
      <span class="eyebrow">What We Do</span>
      <h2>Community Programs</h2>
    </div>
    <div class="cards-grid">
      <div class="card">
        <span class="card-category">🎒</span>
        <h3>Backpack Program</h3>
        <p>Provides weekend meals to food-insecure students at Norwin schools, ensuring no child goes hungry over the weekend.</p>
      </div>
      <div class="card">
        <span class="card-category">🎓</span>
        <h3>Scholarship Fund</h3>
        <p>Awards college scholarships to Norwin High School seniors who demonstrate academic achievement and community involvement.</p>
      </div>
      <div class="card">
        <span class="card-category">📖</span>
        <h3>Dictionary Project</h3>
        <p>Distributes dictionaries to every third-grader in the Norwin School District, building lifelong literacy habits.</p>
      </div>
      <div class="card">
        <span class="card-category">🌱</span>
        <h3>Community Garden</h3>
        <p>Maintains a thriving community garden at Irwin Park, providing fresh produce and green space for residents.</p>
      </div>
    </div>
  </div>
</section>

<section class="events" id="events">
  <div class="container">
    <div class="section-header">
      <span class="eyebrow">Upcoming Events</span>
      <h2>What&#8217;s Happening</h2>
    </div>
    <div class="events-list">
      ${eventRowsData.map(buildEventRow).join("\n")}
    </div>
  </div>
</section>

<section class="contact" id="contact">
  <div class="container">
    <div class="contact-grid">
      <div class="contact-info">
        <span class="eyebrow">Get In Touch</span>
        <h2>Come Join Our Community</h2>
        <p>Whether you&#8217;re curious about membership or want to partner with us, we&#8217;d love to connect. Our doors are open to all who share our values.</p>
        <address>
          <div>📍 Irwin, PA 15642</div>
          <div>📞 (724) 555-0142</div>
          <div>✉️ info@norwinrotary.org</div>
          <div>📅 Every Tuesday, 12:00 PM — Irwin Fire Hall, 221 Main St, Irwin, PA 15642</div>
        </address>
      </div>
      <div>
        <div class="contact-card">
          <h4>Ready to get involved?</h4>
          <p>Getting started is easy. Reach out and we&#8217;ll personally connect you with the right program or membership pathway.</p>
          <a href="mailto:info@norwinrotary.org" class="btn-primary">Send Us a Message</a>
        </div>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col">
        <div class="footer-brand-name">Norwin Rotary Club</div>
        <p>A Rotary International service club dedicated to community service, fellowship, and making a difference in the Norwin area since 1972.</p>
      </div>
      <div class="footer-col">
        <h4>Quick Links</h4>
        <ul>
          <li><a href="#about">About</a></li>
          <li><a href="#programs">Programs</a></li>
          <li><a href="#events">Events</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Events</h4>
        <ul>
          <li><a href="https://${slug}.mypillar.co/events">All Events</a></li>
          <li><a href="https://${slug}.mypillar.co/events/${seededSlugs["Annual Golf Outing"] ?? ""}">Golf Outing</a></li>
          <li><a href="https://${slug}.mypillar.co/events/${seededSlugs["Annual Chili Cookoff"] ?? ""}">Chili Cookoff</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Contact</h4>
        <p>Irwin, PA 15642</p>
        <p>(724) 555-0142</p>
        <p>info@norwinrotary.org</p>
      </div>
    </div>
    <div class="footer-bottom">
      <div>
        &copy; ${new Date().getFullYear()} Norwin Rotary Club &mdash; Member of Rotary International<br>
        <small style="color:rgba(255,255,255,0.3)">Meets every Tuesday at 12:00 PM, Irwin Fire Hall, Irwin PA 15642</small>
      </div>
      <div class="powered-by"><a href="https://mypillar.co">Powered by Pillar</a></div>
    </div>
  </div>
</footer>

</body>
</html>`;

// ── Upsert site as published ──────────────────────────────────────────────────
const existing = await client.query(
  `SELECT id FROM sites WHERE org_id = $1 LIMIT 1`,
  [org.id]
);

if (existing.rows.length) {
  await client.query(
    `UPDATE sites SET generated_html = $1, proposed_html = NULL, org_slug = $2,
      status = 'published', meta_title = 'Norwin Rotary Club',
      meta_description = 'A Rotary International service club serving the Norwin community.',
      updated_at = NOW()
     WHERE org_id = $3`,
    [html, slug, org.id]
  );
  console.log(`Updated existing site record → status=published`);
} else {
  await client.query(
    `INSERT INTO sites (org_id, org_slug, generated_html, status, meta_title, meta_description)
     VALUES ($1, $2, $3, 'published', 'Norwin Rotary Club', 'A Rotary International service club serving the Norwin community.')`,
    [org.id, slug, html]
  );
  console.log(`Inserted new site record → status=published`);
}

console.log(`\nSite published!`);
console.log(`  Homepage: https://${slug}.mypillar.co`);
console.log(`  Events:   https://${slug}.mypillar.co/events`);
console.log(`  HTML size: ${html.length.toLocaleString()} bytes`);

await client.end();
