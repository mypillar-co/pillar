/**
 * Server-rendered public event pages for Pillar.
 *
 * buildEventsListingPage  → <orgSlug>.mypillar.co/events
 * buildEventDetailPage    → <orgSlug>.mypillar.co/events/:slug
 *
 * Both pages are fully dynamic (DB-backed on every request) and
 * embed the site's primary/accent colors extracted from generated HTML.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PublicEvent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventType: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  isTicketed: boolean | null;
  ticketPrice: number | null;
  ticketCapacity: number | null;
  hasRegistration: boolean | null;
  hasSponsorSection: boolean | null;
  registrationClosed: boolean | null;
  imageUrl: string | null;
  featured: boolean | null;
};

export type PublicTicketType = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number | null;
  sold: number;
};

export type PublicSponsor = {
  sponsorId: string;
  name: string;
  tier: string | null;
  tierRank: number | null;
  logoUrl: string | null;
  website: string | null;
};

export type OrgInfo = {
  name: string;
  slug: string;
  stripeConnectAccountId: string | null;
  stripeConnectOnboarded: boolean | null;
  contactEmail: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  } catch { return dateStr; }
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch { return dateStr; }
}

function formatTime(t: string | null): string {
  if (!t) return "";
  try {
    const trimmed = t.trim();
    // Already in 12-hour format with AM/PM (e.g., "8:00 AM", "12:30 PM")
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(trimmed)) {
      return trimmed;
    }
    // 24-hour format "HH:MM"
    const [h, m] = trimmed.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return trimmed;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch { return t; }
}

function formatTimeRange(start: string | null, end: string | null): string {
  const s = formatTime(start);
  const e = formatTime(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

function formatPrice(price: number): string {
  if (price === 0) return "Free";
  return `$${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}`;
}

function extractColors(siteHtml: string | null): { primary: string; accent: string } {
  const primary = siteHtml?.match(/--primary:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#1e2d4f";
  const accent = siteHtml?.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#c9a84c";
  return { primary, accent };
}

function extractNavHtml(siteHtml: string | null): string {
  if (!siteHtml) return "";
  const match = siteHtml.match(/<nav[\s\S]*?<\/nav>/i);
  if (!match) return "";
  // Rewrite same-page anchor links to real page URLs so the extracted nav
  // works correctly on /events and /events/{slug} sub-pages.
  return match[0]
    .replace(/href=["']#events["']/gi, 'href="/events"')
    .replace(/href=["']#about["']/gi, 'href="/#about"')
    .replace(/href=["']#programs["']/gi, 'href="/#programs"')
    .replace(/href=["']#contact["']/gi, 'href="/#contact"')
    .replace(/href=["']#members["']/gi, 'href="/#members"')
    .replace(/href=["']#sponsors["']/gi, 'href="/#sponsors"');
}

function extractFooterHtml(siteHtml: string | null): string {
  if (!siteHtml) return "";
  const match = siteHtml.match(/<footer[\s\S]*?<\/footer>/i);
  return match?.[0] ?? "";
}

function categoryColor(eventType: string | null, primary: string): string {
  const t = (eventType ?? "").toLowerCase();
  if (t.includes("fundrais") || t.includes("gala")) return "#7c3aed";
  if (t.includes("social") || t.includes("dinner") || t.includes("meeting")) return "#0369a1";
  if (t.includes("festival") || t.includes("fair") || t.includes("carnival")) return "#b45309";
  if (t.includes("golf") || t.includes("sport") || t.includes("game")) return "#15803d";
  if (t.includes("food") || t.includes("cook") || t.includes("chili")) return "#c2410c";
  if (t.includes("communit") || t.includes("service") || t.includes("volunteer")) return "#0e7490";
  if (t.includes("holiday") || t.includes("light") || t.includes("christmas")) return "#9f1239";
  if (t.includes("scholar") || t.includes("educat")) return "#1d4ed8";
  return primary;
}

const SVG_CALENDAR = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const SVG_CLOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const SVG_MAPPIN = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const SVG_TICKET = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><line x1="9" y1="2" x2="9" y2="22"/></svg>`;

function sharedHead(title: string, primary: string, accent: string): string {
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: ${primary};
      --accent: ${accent};
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #f9fafb;
      --radius: 10px;
    }
    body { font-family: 'DM Sans', system-ui, sans-serif; color: var(--text); background: #fff; min-height: 100vh; display: flex; flex-direction: column; }
    a { color: inherit; text-decoration: none; }
    img { display: block; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
  </style>
</head>`;
}

function fallbackNav(org: OrgInfo, primary: string, accent: string, currentPath: string): string {
  return `<nav style="background:${primary};padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;">
  <a href="/" style="color:#fff;font-weight:700;font-size:16px;font-family:'DM Sans',sans-serif;letter-spacing:.01em;">${esc(org.name)}</a>
  <div style="display:flex;align-items:center;gap:24px;">
    <a href="/" style="color:rgba(255,255,255,.75);font-size:14px;font-family:'DM Sans',sans-serif;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.75)'">Home</a>
    <a href="/events" style="color:${currentPath==='/events'?'#fff':'rgba(255,255,255,.75)'};font-size:14px;font-family:'DM Sans',sans-serif;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,${currentPath==='/events'?'1':'.75'})'">Events</a>
    ${accent ? `<a href="/#contact" style="background:${accent};color:${primary};padding:7px 18px;border-radius:6px;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;">Get Involved</a>` : ""}
  </div>
</nav>`;
}

function fallbackFooter(org: OrgInfo, primary: string): string {
  const year = new Date().getFullYear();
  return `<footer style="background:#060912;color:rgba(255,255,255,.55);padding:40px 24px 24px;margin-top:auto;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="display:flex;flex-wrap:wrap;gap:32px;justify-content:space-between;margin-bottom:32px;">
      <div>
        <div style="color:#fff;font-weight:700;font-size:16px;font-family:'DM Sans',sans-serif;margin-bottom:8px;">${esc(org.name)}</div>
        ${org.contactEmail ? `<div style="font-size:13px;">${esc(org.contactEmail)}</div>` : ""}
      </div>
      <div>
        <div style="color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Quick Links</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a href="/" style="color:rgba(255,255,255,.55);font-size:13px;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.55)'">Home</a>
          <a href="/events" style="color:rgba(255,255,255,.55);font-size:13px;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.55)'">Events</a>
        </div>
      </div>
      <div>
        <div style="color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Platform</div>
        <a href="https://mypillar.co" style="color:rgba(255,255,255,.55);font-size:13px;">Powered by Pillar</a>
      </div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:20px;font-size:12px;">© ${year} ${esc(org.name)}. All rights reserved.</div>
  </div>
</footer>`;
}

// ─── Events Listing Page ──────────────────────────────────────────────────────

export function buildEventsListingPage(opts: {
  events: PublicEvent[];
  org: OrgInfo;
  siteHtml: string | null;
}): string {
  const { events, org, siteHtml } = opts;
  const { primary, accent } = extractColors(siteHtml);
  const navHtml = extractNavHtml(siteHtml) || fallbackNav(org, primary, accent, "/events");
  const footerHtml = extractFooterHtml(siteHtml) || fallbackFooter(org, primary);

  // Sort: soonest first, no-date events go to end
  const today = new Date().toISOString().split("T")[0];
  const sorted = [...events].sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.localeCompare(b.startDate);
  });

  // Collect categories for filter tabs (only if > 5 events)
  const categories = sorted.length > 5
    ? Array.from(new Set(sorted.map(e => e.eventType).filter(Boolean))) as string[]
    : [];

  const cardsHtml = sorted.length === 0
    ? `<div style="text-align:center;padding:80px 24px;color:var(--muted);">
        <div style="font-size:48px;margin-bottom:16px;">📅</div>
        <h3 style="font-size:20px;font-weight:600;color:var(--text);margin-bottom:8px;">No upcoming events</h3>
        <p style="font-size:15px;">Check back soon — we update this page regularly.</p>
       </div>`
    : sorted.map(e => buildEventCard(e, primary, accent, org, today)).join("\n");

  const filterTabsHtml = categories.length > 1 ? `
    <div id="filter-tabs" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:32px;">
      <button class="filter-tab active" data-cat="all" style="padding:7px 18px;border-radius:999px;border:1.5px solid ${primary};background:${primary};color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;">All</button>
      ${categories.map(cat => `<button class="filter-tab" data-cat="${esc(cat)}" style="padding:7px 18px;border-radius:999px;border:1.5px solid var(--border);background:#fff;color:var(--text);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;">${esc(cat)}</button>`).join("\n")}
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
${sharedHead(`Events — ${org.name}`, primary, accent)}
<body>
${navHtml}

<main style="flex:1;">
  <!-- Page header -->
  <div style="background:${primary};padding:48px 24px 40px;">
    <div class="container">
      <p style="color:${accent};font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">Calendar</p>
      <h1 style="font-family:'DM Serif Display',serif;font-size:clamp(2rem,5vw,3rem);color:#fff;font-weight:400;line-height:1.1;">Upcoming Events</h1>
      <p style="color:rgba(255,255,255,.7);font-size:16px;margin-top:12px;">Stay connected with everything happening at ${esc(org.name)}.</p>
    </div>
  </div>

  <div class="container" style="padding-top:48px;padding-bottom:80px;">
    ${filterTabsHtml}
    <div id="events-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;">
      ${cardsHtml}
    </div>
  </div>
</main>

${footerHtml}

<style>
  .event-card {
    border-radius:var(--radius);
    border:1px solid var(--border);
    background:#fff;
    overflow:hidden;
    display:flex;
    flex-direction:column;
    transition:transform .2s,box-shadow .2s;
    cursor:pointer;
  }
  .event-card:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(0,0,0,.12); }
  .event-card__accent { height:4px; width:100%; }
  .event-card__img { width:100%; height:180px; object-fit:cover; display:block; }
  .event-card__body { padding:20px; flex:1; display:flex; flex-direction:column; gap:10px; }
  .event-card__cat { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:3px 10px; border-radius:999px; }
  .event-card__title { font-size:17px; font-weight:700; line-height:1.3; color:var(--text); }
  .event-card__desc { font-size:14px; color:var(--muted); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .event-card__meta { display:flex; flex-direction:column; gap:5px; margin-top:auto; padding-top:10px; border-top:1px solid var(--border); }
  .event-card__meta-row { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--muted); }
  .event-card__meta-row svg { flex-shrink:0; }
  .event-card__footer { padding:14px 20px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
  .btn-primary { background:${primary}; color:#fff; border:none; padding:8px 18px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:opacity .15s; }
  .btn-primary:hover { opacity:.85; }
  .btn-outline { background:#fff; color:${primary}; border:1.5px solid ${primary}; padding:7px 18px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all .15s; }
  .btn-outline:hover { background:${primary}; color:#fff; }
  .badge-sold-out { background:#fee2e2; color:#991b1b; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:3px 10px; border-radius:999px; }
  .badge-ticket { display:inline-flex; align-items:center; gap:4px; background:rgba(0,0,0,.05); color:var(--text); font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; }
  .filter-tab.active { background:${primary} !important; color:#fff !important; border-color:${primary} !important; }
  .filter-tab:hover { border-color:${primary} !important; color:${primary} !important; }
  .filter-tab.active:hover { opacity:.85; color:#fff !important; }
</style>

<script>
(function(){
  const tabs = document.querySelectorAll('.filter-tab');
  const cards = document.querySelectorAll('.event-card[data-cat]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.dataset.cat;
      cards.forEach(card => {
        card.style.display = (cat === 'all' || card.dataset.cat === cat) ? '' : 'none';
      });
    });
  });
})();
</script>
</body>
</html>`;
}

function buildEventCard(e: PublicEvent, primary: string, accent: string, org: OrgInfo, today: string): string {
  const catColor = categoryColor(e.eventType, primary);
  const isPast = !!e.startDate && e.startDate < today;
  const dateStr = formatDateShort(e.startDate);
  const timeStr = formatTimeRange(e.startTime, e.endTime);
  const hasTickets = e.isTicketed && e.ticketPrice !== null;
  const isSoldOut = hasTickets && e.ticketCapacity !== null && (e.ticketCapacity <= 0);

  const imageOrAccent = e.imageUrl
    ? `<img class="event-card__img" src="${esc(e.imageUrl)}" alt="${esc(e.name)}" loading="lazy">`
    : `<div class="event-card__accent" style="background:${catColor};height:5px;"></div>`;

  const categoryBadge = e.eventType
    ? `<span class="event-card__cat" style="background:${catColor}18;color:${catColor};">${esc(e.eventType)}</span>`
    : "";

  const metaRows = [
    dateStr ? `<div class="event-card__meta-row">${SVG_CALENDAR}<span>${esc(dateStr)}${isPast ? " <em>(past)</em>" : ""}</span></div>` : "",
    timeStr ? `<div class="event-card__meta-row">${SVG_CLOCK}<span>${esc(timeStr)}</span></div>` : "",
    e.location ? `<div class="event-card__meta-row">${SVG_MAPPIN}<span>${esc(e.location)}</span></div>` : "",
  ].filter(Boolean).join("\n");

  const ticketBadge = hasTickets
    ? `<span class="badge-ticket">${SVG_TICKET} ${isSoldOut ? "Sold Out" : formatPrice(e.ticketPrice!)}</span>`
    : "";

  const ctaButton = e.slug
    ? hasTickets && !isSoldOut
      ? `<a href="/events/${esc(e.slug)}" class="btn-primary">Buy Tickets</a>`
      : `<a href="/events/${esc(e.slug)}" class="btn-outline">Learn More</a>`
    : "";

  return `<div class="event-card" data-cat="${esc(e.eventType ?? "")}" onclick="location.href='/events/${esc(e.slug)}'">
  ${imageOrAccent}
  <div class="event-card__body">
    ${categoryBadge}
    <div class="event-card__title">${esc(e.name)}</div>
    ${e.description ? `<div class="event-card__desc">${esc(e.description)}</div>` : ""}
    <div class="event-card__meta">${metaRows}</div>
  </div>
  ${(ticketBadge || ctaButton) ? `<div class="event-card__footer">${ticketBadge}${ctaButton}</div>` : ""}
</div>`;
}

// ─── Event Detail Page ────────────────────────────────────────────────────────

export function buildEventDetailPage(opts: {
  event: PublicEvent;
  ticketTypes: PublicTicketType[];
  sponsors: PublicSponsor[];
  org: OrgInfo;
  siteHtml: string | null;
  cancelled?: boolean;
}): string {
  const { event, ticketTypes, sponsors, org, cancelled } = opts;
  const { primary, accent } = extractColors(opts.siteHtml);
  const navHtml = extractNavHtml(opts.siteHtml) || fallbackNav(org, primary, accent, `/events/${event.slug}`);
  const footerHtml = extractFooterHtml(opts.siteHtml) || fallbackFooter(org, primary);

  const catColor = categoryColor(event.eventType, primary);
  const dateStr = formatDate(event.startDate);
  const timeStr = formatTimeRange(event.startTime, event.endTime);

  const hasPaidTickets = ticketTypes.some(tt => tt.price > 0);
  const acceptsPayments = !hasPaidTickets || !!(org.stripeConnectAccountId && org.stripeConnectOnboarded);
  const showTicketSection = !!(event.isTicketed && ticketTypes.length > 0 && acceptsPayments);
  const allSoldOut = ticketTypes.length > 0 && ticketTypes.every(tt => {
    const rem = tt.quantity !== null ? tt.quantity - tt.sold : 1;
    return rem <= 0;
  });

  const visibleSponsors = sponsors.filter(s => s.name);
  const showSponsorSection = !!(event.hasSponsorSection && visibleSponsors.length > 0);
  const showRegistrationSection = !!event.hasRegistration;

  // ── Section 1: Hero ────────────────────────────────────────────────────────
  const heroBackground = event.imageUrl
    ? `background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.65)),url(${esc(event.imageUrl)}) center/cover no-repeat;`
    : `background:${catColor};`;

  const heroSection = `
  <section style="${heroBackground}padding:64px 24px 56px;color:#fff;">
    <div class="container">
      ${event.eventType ? `<span style="display:inline-block;background:rgba(255,255,255,.2);color:#fff;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:4px 14px;border-radius:999px;margin-bottom:16px;">${esc(event.eventType)}</span>` : ""}
      <h1 style="font-family:'DM Serif Display',serif;font-size:clamp(2rem,5vw,3.25rem);font-weight:400;line-height:1.1;margin-bottom:20px;">${esc(event.name)}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:20px;font-size:15px;color:rgba(255,255,255,.9);margin-bottom:${showTicketSection ? "28px" : "0"};">
        ${dateStr ? `<span style="display:flex;align-items:center;gap:8px;">${SVG_CALENDAR} ${esc(dateStr)}</span>` : ""}
        ${timeStr ? `<span style="display:flex;align-items:center;gap:8px;">${SVG_CLOCK} ${esc(timeStr)}</span>` : ""}
        ${event.location ? `<span style="display:flex;align-items:center;gap:8px;">${SVG_MAPPIN} ${esc(event.location)}</span>` : ""}
      </div>
      ${(event.isTicketed && ticketTypes.length > 0) ? `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.2);padding:6px 16px;border-radius:999px;font-size:14px;font-weight:600;">${SVG_TICKET} ${allSoldOut ? "Sold Out" : `From ${formatPrice(Math.min(...ticketTypes.map(t => t.price)))}`}</span>
        ${showTicketSection ? (allSoldOut ? `<span style="background:#fee2e2;color:#991b1b;padding:6px 16px;border-radius:999px;font-size:13px;font-weight:700;">SOLD OUT</span>` : `<a href="#tickets" style="background:${accent};color:${primary};padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Buy Tickets</a>`) : ""}
      </div>` : ""}
    </div>
  </section>`;

  // ── Section 2: About ───────────────────────────────────────────────────────
  const aboutSection = event.description ? `
  <section style="padding:56px 24px;">
    <div class="container" style="max-width:760px;">
      <h2 style="font-family:'DM Serif Display',serif;font-size:1.85rem;font-weight:400;margin-bottom:20px;">About This Event</h2>
      <div style="font-size:16px;line-height:1.8;color:#374151;white-space:pre-wrap;">${esc(event.description)}</div>
    </div>
  </section>` : "";

  // ── Section 3: Ticket Purchase ─────────────────────────────────────────────
  const ticketSection = showTicketSection ? buildTicketPurchaseSection(event, ticketTypes, primary, accent, allSoldOut, cancelled) : "";

  // ── Section 4: Sponsors ────────────────────────────────────────────────────
  const sponsorSection = showSponsorSection ? buildSponsorsSection(visibleSponsors, primary, accent) : "";

  // ── Section 5: Vendor Registration ────────────────────────────────────────
  const registrationSection = showRegistrationSection ? buildRegistrationSection(event, primary, accent) : "";

  // ── Section 6: Contact ─────────────────────────────────────────────────────
  const contactSection = `
  <section style="background:var(--surface);padding:56px 24px;">
    <div class="container" style="max-width:640px;text-align:center;">
      <h2 style="font-family:'DM Serif Display',serif;font-size:1.6rem;font-weight:400;margin-bottom:12px;">Questions about this event?</h2>
      <p style="color:var(--muted);font-size:15px;margin-bottom:24px;">We're happy to help. Reach out to ${esc(org.name)} directly.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        ${org.contactEmail ? `<a href="mailto:${esc(org.contactEmail)}" style="background:${primary};color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Email Us</a>` : ""}
        <a href="/events" style="background:#fff;color:${primary};border:1.5px solid ${primary};padding:9px 24px;border-radius:8px;font-size:14px;font-weight:600;transition:all .15s;" onmouseover="this.style.background='${primary}';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='${primary}'">All Events</a>
      </div>
    </div>
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
${sharedHead(`${event.name} — ${org.name}`, primary, accent)}
<body>
${navHtml}
<main style="flex:1;">
  ${heroSection}
  ${aboutSection}
  ${ticketSection}
  ${sponsorSection}
  ${registrationSection}
  ${contactSection}
</main>
${footerHtml}

<style>
  .ticket-type-card {
    border:2px solid var(--border);
    border-radius:10px;
    padding:18px 20px;
    cursor:pointer;
    transition:border-color .15s,background .15s;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
  }
  .ticket-type-card:has(input:checked) { border-color:${primary}; background:${primary}08; }
  .ticket-type-card--soldout { opacity:.5; cursor:not-allowed; }
  .form-input {
    width:100%;
    padding:10px 14px;
    border:1.5px solid var(--border);
    border-radius:8px;
    font-size:15px;
    font-family:'DM Sans',sans-serif;
    color:var(--text);
    transition:border-color .15s;
    outline:none;
  }
  .form-input:focus { border-color:${primary}; }
  .form-label { font-size:13px; font-weight:600; color:#374151; margin-bottom:6px; display:block; }
  .form-group { display:flex; flex-direction:column; }
  .btn-submit {
    width:100%;
    padding:14px;
    background:${primary};
    color:#fff;
    border:none;
    border-radius:8px;
    font-size:16px;
    font-weight:700;
    font-family:'DM Sans',sans-serif;
    cursor:pointer;
    transition:opacity .15s;
  }
  .btn-submit:hover:not(:disabled) { opacity:.85; }
  .btn-submit:disabled { opacity:.5; cursor:not-allowed; }
  .error-msg { color:#dc2626; font-size:14px; margin-top:8px; display:none; }
  .error-msg.visible { display:block; }
  .total-display { font-size:18px; font-weight:700; color:var(--text); }
</style>

${showTicketSection ? buildTicketScript(event) : ""}
</body>
</html>`;
}

function buildTicketPurchaseSection(
  event: PublicEvent,
  ticketTypes: PublicTicketType[],
  primary: string,
  accent: string,
  allSoldOut: boolean,
  cancelled?: boolean,
): string {
  const ticketCards = ticketTypes.map(tt => {
    const remaining = tt.quantity !== null ? tt.quantity - tt.sold : null;
    const soldOut = remaining !== null && remaining <= 0;
    const availText = soldOut ? "Sold out" : remaining !== null && remaining <= 10 ? `${remaining} left` : "";
    return `
    <label class="ticket-type-card${soldOut ? " ticket-type-card--soldout" : ""}" data-price="${tt.price}">
      <input type="radio" name="ticketTypeId" value="${esc(tt.id)}" ${soldOut ? "disabled" : ""} required style="display:none;">
      <div>
        <div style="font-weight:700;font-size:15px;">${esc(tt.name)}</div>
        ${tt.description ? `<div style="font-size:13px;color:var(--muted);margin-top:2px;">${esc(tt.description)}</div>` : ""}
        ${availText ? `<div style="font-size:12px;color:${soldOut ? "#dc2626" : "#d97706"};font-weight:600;margin-top:4px;">${esc(availText)}</div>` : ""}
      </div>
      <span style="font-size:18px;font-weight:700;color:${primary};white-space:nowrap;">${tt.price === 0 ? "Free" : `$${tt.price % 1 === 0 ? tt.price.toFixed(0) : tt.price.toFixed(2)}`}</span>
    </label>`;
  }).join("\n");

  return `
  <section id="tickets" style="background:var(--surface);padding:56px 24px;">
    <div class="container" style="max-width:580px;">
      <h2 style="font-family:'DM Serif Display',serif;font-size:1.85rem;font-weight:400;margin-bottom:8px;">Get Your Tickets</h2>
      <p style="color:var(--muted);font-size:15px;margin-bottom:32px;">${esc(event.name)}</p>

      ${cancelled ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;color:#991b1b;font-size:14px;margin-bottom:24px;">Your payment was cancelled. You can try again below.</div>` : ""}

      ${allSoldOut
        ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:24px;text-align:center;"><div style="font-size:22px;font-weight:800;color:#dc2626;margin-bottom:8px;">SOLD OUT</div><p style="color:#6b7280;font-size:14px;">All tickets for this event have been sold.</p></div>`
        : `<form id="ticket-form" style="display:flex;flex-direction:column;gap:20px;" novalidate>
          <div>
            <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px;">Select Ticket Type</div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${ticketCards}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="buyerName">Full Name *</label>
            <input class="form-input" id="buyerName" name="buyerName" type="text" placeholder="Your full name" required autocomplete="name">
          </div>
          <div class="form-group">
            <label class="form-label" for="buyerEmail">Email Address *</label>
            <input class="form-input" id="buyerEmail" name="buyerEmail" type="email" placeholder="your@email.com" required autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label" for="quantity">Quantity</label>
            <select class="form-input" id="quantity" name="quantity" style="cursor:pointer;">
              ${Array.from({length: 10}, (_, i) => `<option value="${i+1}">${i+1} ticket${i > 0 ? "s" : ""}</option>`).join("")}
            </select>
          </div>
          <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:14px;color:var(--muted);">Total</span>
            <span class="total-display" id="total-display">—</span>
          </div>
          <div class="error-msg" id="form-error"></div>
          <button class="btn-submit" id="submit-btn" type="submit" disabled>Complete Purchase</button>
          <p style="text-align:center;font-size:12px;color:var(--muted);">You'll be redirected to our secure payment page.</p>
        </form>`
      }
    </div>
  </section>`;
}

function buildSponsorsSection(sponsors: PublicSponsor[], primary: string, accent: string): string {
  const TIER_ORDER = ["presenting", "gold", "silver", "supporting", "bronze", "platinum"];
  const tierLabel = (t: string | null) => t
    ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
    : "Sponsor";

  const byTier = new Map<string, PublicSponsor[]>();
  for (const s of sponsors) {
    const tier = s.tier?.toLowerCase() ?? "supporting";
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(s);
  }

  const tierOrder = [...TIER_ORDER, ...Array.from(byTier.keys()).filter(t => !TIER_ORDER.includes(t))];
  const activeTiers = tierOrder.filter(t => byTier.has(t));

  const logoSize = (tier: string) => {
    if (tier === "presenting" || tier === "platinum") return "h:120px;max-width:220px;";
    if (tier === "gold") return "height:80px;max-width:160px;";
    if (tier === "silver") return "height:60px;max-width:130px;";
    return "height:48px;max-width:110px;";
  };

  const cols = (tier: string) => {
    if (tier === "presenting" || tier === "platinum") return "repeat(auto-fit,minmax(200px,1fr))";
    if (tier === "gold") return "repeat(auto-fit,minmax(150px,1fr))";
    return "repeat(auto-fit,minmax(120px,1fr))";
  };

  const tiersHtml = activeTiers.map(tier => {
    const tierSponsors = byTier.get(tier)!;
    const logosHtml = tierSponsors.map(s => {
      const inner = s.logoUrl
        ? `<img src="${esc(s.logoUrl)}" alt="${esc(s.name)}" style="${logoSize(tier)}object-fit:contain;">`
        : `<span style="font-weight:700;font-size:14px;color:${primary};text-align:center;">${esc(s.name)}</span>`;
      return s.website
        ? `<a href="${esc(s.website)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;padding:16px;border-radius:8px;border:1px solid var(--border);background:#fff;transition:box-shadow .15s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">${inner}</a>`
        : `<div style="display:flex;align-items:center;justify-content:center;padding:16px;border-radius:8px;border:1px solid var(--border);background:#fff;">${inner}</div>`;
    }).join("\n");
    return `
    <div style="margin-bottom:36px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">${tierLabel(tier)} Sponsors</div>
      <div style="display:grid;grid-template-columns:${cols(tier)};gap:16px;align-items:center;">
        ${logosHtml}
      </div>
    </div>`;
  }).join("\n");

  return `
  <section style="padding:56px 24px;background:var(--surface);">
    <div class="container">
      <h2 style="font-family:'DM Serif Display',serif;font-size:1.85rem;font-weight:400;margin-bottom:8px;text-align:center;">Thank You to Our Sponsors</h2>
      <p style="color:var(--muted);text-align:center;font-size:15px;margin-bottom:40px;">This event is made possible by the generous support of our sponsors.</p>
      ${tiersHtml}
    </div>
  </section>`;
}

function buildRegistrationSection(event: PublicEvent, primary: string, accent: string): string {
  const isClosed = !!event.registrationClosed;
  const vendorUrl = `/events/${event.slug}/vendor-apply`;
  const sponsorUrl = `/events/${event.slug}/sponsor-signup`;
  return `
  <section style="padding:56px 24px;background:var(--surface);">
    <div class="container" style="max-width:640px;">
      <h2 style="font-family:'DM Serif Display',serif;font-size:1.85rem;font-weight:400;margin-bottom:12px;">Get Involved</h2>
      ${isClosed
        ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:18px 22px;color:#854d0e;font-size:15px;margin-top:8px;">
            <strong>Registration is currently closed.</strong> Check back closer to the event date for updates.
           </div>`
        : `<p style="color:var(--muted);font-size:15px;margin-bottom:28px;">Want to participate in ${esc(event.name)}? Apply for a vendor booth or sponsorship opportunity.</p>
           <div style="display:flex;gap:14px;flex-wrap:wrap;">
             <a href="${esc(vendorUrl)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Apply as Vendor</a>
             <a href="${esc(sponsorUrl)}" style="display:inline-block;background:#fff;color:${primary};border:2px solid ${primary};padding:10px 28px;border-radius:8px;font-size:15px;font-weight:600;transition:all .15s;" onmouseover="this.style.background='${primary}';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='${primary}'">Become a Sponsor</a>
           </div>`
      }
    </div>
  </section>`;
}

function buildTicketScript(event: PublicEvent): string {
  return `<script>
(function(){
  const form = document.getElementById('ticket-form');
  if (!form) return;
  const submitBtn = document.getElementById('submit-btn');
  const totalDisplay = document.getElementById('total-display');
  const formError = document.getElementById('form-error');
  const qtySelect = document.getElementById('quantity');
  const slug = ${JSON.stringify(event.slug)};

  let selectedPrice = null;
  let selectedId = null;

  function updateTotal() {
    if (selectedPrice === null) {
      totalDisplay.textContent = '—';
      submitBtn.disabled = true;
      return;
    }
    const qty = parseInt(qtySelect.value, 10) || 1;
    const total = selectedPrice * qty;
    totalDisplay.textContent = selectedPrice === 0 ? 'Free' : '$' + (total % 1 === 0 ? total.toFixed(0) : total.toFixed(2));
    submitBtn.disabled = false;
    submitBtn.textContent = selectedPrice === 0 ? 'Register — Free' : 'Complete Purchase';
  }

  document.querySelectorAll('.ticket-type-card input[type=radio]').forEach(radio => {
    radio.closest('.ticket-type-card').addEventListener('click', function() {
      const inp = this.querySelector('input[type=radio]');
      if (inp.disabled) return;
      inp.checked = true;
      selectedPrice = parseFloat(this.dataset.price);
      selectedId = inp.value;
      updateTotal();
    });
  });

  qtySelect.addEventListener('change', updateTotal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.remove('visible');
    const name = form.buyerName.value.trim();
    const email = form.buyerEmail.value.trim();
    const qty = parseInt(qtySelect.value, 10) || 1;
    if (!name) { formError.textContent = 'Please enter your name.'; formError.classList.add('visible'); return; }
    if (!email || !email.includes('@')) { formError.textContent = 'Please enter a valid email address.'; formError.classList.add('visible'); return; }
    if (!selectedId) { formError.textContent = 'Please select a ticket type.'; formError.classList.add('visible'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing…';
    try {
      const res = await fetch('/api/public/events/' + slug + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketTypeId: selectedId, quantity: qty, attendeeName: name, attendeeEmail: email })
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Something went wrong. Please try again.'); return; }
      if (data.free) { window.location.href = '/events/' + slug + '?registered=1'; return; }
      if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      showError('Unexpected response from server. Please try again.');
    } catch { showError('Network error. Please check your connection and try again.'); }
  });

  function showError(msg) {
    formError.textContent = msg;
    formError.classList.add('visible');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Complete Purchase';
  }
})();
</script>`;
}

// ─── 404 Not Found Page ───────────────────────────────────────────────────────

export function buildEventNotFoundPage(org: OrgInfo, siteHtml: string | null): string {
  const { primary, accent } = extractColors(siteHtml);
  const navHtml = extractNavHtml(siteHtml) || fallbackNav(org, primary, accent, "/events");
  const footerHtml = extractFooterHtml(siteHtml) || fallbackFooter(org, primary);
  return `<!DOCTYPE html>
<html lang="en">
${sharedHead(`Event Not Found — ${org.name}`, primary, accent)}
<body>
${navHtml}
<main style="flex:1;display:flex;align-items:center;justify-content:center;padding:80px 24px;">
  <div style="text-align:center;max-width:400px;">
    <div style="font-size:52px;margin-bottom:20px;">🔍</div>
    <h1 style="font-family:'DM Serif Display',serif;font-size:2rem;font-weight:400;margin-bottom:12px;">Event Not Found</h1>
    <p style="color:var(--muted);font-size:16px;margin-bottom:28px;">That event doesn't exist or may have been removed.</p>
    <a href="/events" style="display:inline-block;background:${primary};color:#fff;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">Browse All Events</a>
  </div>
</main>
${footerHtml}
</body>
</html>`;
}

// ─── Homepage: Featured Events Section (Dynamic Injection) ────────────────────

/**
 * Selects up to 3 events to feature on the homepage per spec rules:
 *  1. Manually featured events (featured=true) come first, future dates only
 *  2. Fill remaining slots (up to 3) with the soonest upcoming events
 */
export function selectFeaturedEvents(events: PublicEvent[]): PublicEvent[] {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = events.filter(e => !e.startDate || e.startDate >= today);
  const manual = upcoming.filter(e => e.featured).slice(0, 3);
  if (manual.length >= 3) return manual.slice(0, 3);
  const manualIds = new Set(manual.map(e => e.id));
  const auto = upcoming
    .filter(e => !manualIds.has(e.id))
    .sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.localeCompare(b.startDate);
    })
    .slice(0, 3 - manual.length);
  return [...manual, ...auto];
}

function buildFeaturedEventCard(e: PublicEvent, primary: string, accent: string): string {
  const catColor = categoryColor(e.eventType, primary);
  const dateStr = formatDateShort(e.startDate);
  const timeStr = formatTimeRange(e.startTime, e.endTime);
  const hasTickets = e.isTicketed && e.ticketPrice !== null;

  const imageOrAccent = e.imageUrl
    ? `<img src="${esc(e.imageUrl)}" alt="${esc(e.name)}" style="width:100%;height:180px;object-fit:cover;display:block;">`
    : `<div style="height:5px;background:${catColor};"></div>`;

  const metaRows = [
    dateStr ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--feat-muted,#6b7280);">${SVG_CALENDAR} ${esc(dateStr)}</div>` : "",
    timeStr ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--feat-muted,#6b7280);">${SVG_CLOCK} ${esc(timeStr)}</div>` : "",
    e.location ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--feat-muted,#6b7280);">${SVG_MAPPIN} ${esc(e.location)}</div>` : "",
  ].filter(Boolean).join("\n");

  const cta = e.slug
    ? hasTickets
      ? `<a href="/events/${esc(e.slug)}" style="display:inline-block;background:${primary};color:#fff;padding:9px 22px;border-radius:7px;font-size:13px;font-weight:700;text-decoration:none;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${SVG_TICKET_INLINE} Buy Tickets${e.ticketPrice ? ` — $${e.ticketPrice % 1 === 0 ? e.ticketPrice.toFixed(0) : e.ticketPrice.toFixed(2)}` : ""}</a>`
      : `<a href="/events/${esc(e.slug)}" style="display:inline-block;background:#fff;color:${primary};border:1.5px solid ${primary};padding:8px 22px;border-radius:7px;font-size:13px;font-weight:700;text-decoration:none;transition:all .15s;" onmouseover="this.style.background='${primary}';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='${primary}'">Learn More →</a>`
    : "";

  return `<a href="${e.slug ? `/events/${esc(e.slug)}` : "#"}" style="display:block;border-radius:12px;overflow:hidden;background:#fff;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,.06);transition:box-shadow .2s,transform .2s;text-decoration:none;color:inherit;" onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,.12)';this.style.transform='translateY(-3px)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,.06)';this.style.transform='translateY(0)'">
  ${imageOrAccent}
  <div style="padding:20px;">
    ${e.eventType ? `<span style="display:inline-block;background:${catColor}18;color:${catColor};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-bottom:10px;">${esc(e.eventType)}</span>` : ""}
    <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.2rem;font-weight:400;line-height:1.3;margin-bottom:8px;color:#111827;">${esc(e.name)}</div>
    ${e.description ? `<div style="font-size:13px;color:#6b7280;line-height:1.6;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(e.description)}</div>` : ""}
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">${metaRows}</div>
    ${cta}
  </div>
</a>`;
}

const SVG_TICKET_INLINE = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px;"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><line x1="9" y1="2" x2="9" y2="22"/></svg>`;

/**
 * Builds the server-rendered "Upcoming Events" section for the homepage.
 * Shows up to 3 featured/upcoming events as cards with links to /events/{slug}.
 */
function buildFeaturedEventsSection(events: PublicEvent[], primary: string, accent: string): string {
  const cards = events.length === 0
    ? `<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:#6b7280;">
        <div style="font-size:42px;margin-bottom:12px;">📅</div>
        <p style="font-size:16px;font-weight:500;color:#374151;margin-bottom:6px;">No upcoming events</p>
        <p style="font-size:14px;">Check back soon — we update this regularly.</p>
       </div>`
    : events.map(e => buildFeaturedEventCard(e, primary, accent)).join("\n");

  return `
<!-- pillar:featured-events -->
<section id="events" style="background:#f9fafb;padding:72px 24px;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:40px;">
      <div>
        <p style="color:${accent !== "#c9a84c" ? accent : primary};font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Upcoming Events</p>
        <h2 style="font-family:'DM Serif Display',Georgia,serif;font-size:clamp(1.6rem,4vw,2.25rem);font-weight:400;line-height:1.15;color:#111827;margin:0;">What's Happening</h2>
      </div>
      <a href="/events" style="display:inline-flex;align-items:center;gap:6px;background:#fff;color:${primary};border:1.5px solid ${primary};padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;transition:all .15s;" onmouseover="this.style.background='${primary}';this.style.color='#fff'" onmouseout="this.style.background='#fff';this.style.color='${primary}'">View All Events →</a>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;">
      ${cards}
    </div>
  </div>
</section>
<!-- /pillar:featured-events -->`;
}

/**
 * Patches the stored site HTML to:
 *  1. Replace all `href="#events"` anchors with `href="/events"` (nav, hero CTAs, etc.)
 *  2. Replace the static `<section ... id="events">` with a dynamic featured events section
 *
 * This is called at serve time so the homepage always shows fresh events from the DB.
 */
export function buildDynamicHomepage(
  storedHtml: string,
  featuredEvents: PublicEvent[],
  primary: string,
  accent: string,
): string {
  let html = storedHtml;

  // Step 1: Fix all href="#events" → href="/events"
  html = html.replace(/href=["']#events["']/gi, 'href="/events"');

  // Step 2: Replace static events section with dynamic one
  const dynamicSection = buildFeaturedEventsSection(featuredEvents, primary, accent);

  // Try to replace existing <!-- pillar:featured-events --> block (idempotent re-renders)
  if (html.includes("<!-- pillar:featured-events -->")) {
    html = html.replace(
      /<!-- pillar:featured-events -->[\s\S]*?<!-- \/pillar:featured-events -->/,
      dynamicSection,
    );
    return html;
  }

  // Replace the static <section ... id="events"...>...</section>
  const sectionRegex = /<section[^>]*\bid=["']events["'][^>]*>[\s\S]*?<\/section>/i;
  if (sectionRegex.test(html)) {
    html = html.replace(sectionRegex, dynamicSection);
    return html;
  }

  // No events section found — inject before </main> or </body>
  if (html.includes("</main>")) {
    html = html.replace("</main>", `${dynamicSection}\n</main>`);
  } else {
    html = html.replace("</body>", `${dynamicSection}\n</body>`);
  }
  return html;
}
