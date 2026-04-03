/**
 * Standalone server-rendered HTML for public event pages.
 * Served at: <orgSlug>.mypillar.co/events/:eventSlug/tickets
 *
 * Two modes:
 *   - Event has ticket types  → show purchase form
 *   - Event has no tickets    → show event details only
 */

type EventData = {
  name: string;
  slug: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  isTicketed: boolean | null;
  imageUrl: string | null;
};

type TicketTypeData = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number | null;
  sold: number;
};

type OrgData = {
  name: string;
  slug: string;
  stripeConnectAccountId: string | null;
  stripeConnectOnboarded: boolean | null;
};

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
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  try {
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch {
    return timeStr;
  }
}

function extractColors(siteHtml: string | null): { primary: string; accent: string } {
  const primary = siteHtml?.match(/--primary:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#1e2d4f";
  const accent = siteHtml?.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#c9a84c";
  return { primary, accent };
}

function formatPrice(price: number): string {
  if (price === 0) return "Free";
  return `$${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}`;
}

function buildTicketCards(ticketTypes: TicketTypeData[]): string {
  return ticketTypes.map((tt) => {
    const remaining = tt.quantity !== null ? tt.quantity - tt.sold : null;
    const soldOut = remaining !== null && remaining <= 0;
    const availText = soldOut
      ? "Sold out"
      : remaining !== null && remaining <= 10
        ? `${remaining} left`
        : "";

    return `
    <label class="ticket-card${soldOut ? " ticket-card--soldout" : ""}" data-ticket-id="${esc(tt.id)}" data-price="${tt.price}">
      <input type="radio" name="ticketTypeId" value="${esc(tt.id)}" ${soldOut ? "disabled" : ""} required>
      <div class="ticket-card__body">
        <span class="ticket-card__name">${esc(tt.name)}</span>
        ${tt.description ? `<span class="ticket-card__desc">${esc(tt.description)}</span>` : ""}
        ${availText ? `<span class="ticket-card__avail">${esc(availText)}</span>` : ""}
      </div>
      <span class="ticket-card__price">${formatPrice(tt.price)}</span>
    </label>`;
  }).join("\n");
}

export function buildEventPage(opts: {
  event: EventData;
  ticketTypes: TicketTypeData[];
  org: OrgData;
  siteHtml: string | null;
  cancelled?: boolean;
}): string {
  const { event, ticketTypes, org, cancelled } = opts;
  const { primary, accent } = extractColors(opts.siteHtml);

  const dateStr = formatDate(event.startDate);
  const startTime = formatTime(event.startTime);
  const endTime = formatTime(event.endTime);
  const timeStr = startTime && endTime
    ? `${startTime} – ${endTime}`
    : startTime || endTime || "";

  const hasPaidTickets = ticketTypes.some((tt) => tt.price > 0);
  const acceptsPayments =
    !hasPaidTickets ||
    !!(org.stripeConnectAccountId && org.stripeConnectOnboarded);

  const showTicketForm = ticketTypes.length > 0 && acceptsPayments;
  const hasAnyQuantity = ticketTypes.some((tt) => {
    const rem = tt.quantity !== null ? tt.quantity - tt.sold : 1;
    return rem > 0;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(event.name)} — ${esc(org.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: ${primary};
      --accent: ${accent};
      --text: #1a1a2e;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #f9fafb;
      --radius: 10px;
    }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      color: var(--text);
      background: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ── Nav ── */
    .site-nav {
      background: var(--primary);
      padding: 0 24px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .site-nav__brand {
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      letter-spacing: 0.01em;
    }
    .site-nav__back {
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .site-nav__back:hover { color: #fff; }

    /* ── Hero ── */
    .event-hero {
      background: var(--primary);
      color: #fff;
      padding: 48px 24px 40px;
      text-align: center;
    }
    .event-hero__date {
      display: inline-block;
      background: var(--accent);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 4px 14px;
      border-radius: 20px;
      margin-bottom: 16px;
    }
    .event-hero__title {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(28px, 5vw, 44px);
      line-height: 1.2;
      margin-bottom: 16px;
    }
    .event-hero__meta {
      color: rgba(255,255,255,0.8);
      font-size: 15px;
      line-height: 1.6;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
    }
    .event-hero__meta span { display: flex; align-items: center; gap: 6px; }

    /* ── Body ── */
    .event-body {
      flex: 1;
      max-width: 680px;
      width: 100%;
      margin: 0 auto;
      padding: 40px 24px;
    }

    /* ── Alert ── */
    .alert {
      padding: 14px 18px;
      border-radius: var(--radius);
      font-size: 14px;
      margin-bottom: 28px;
    }
    .alert--warning { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; }
    .alert--success { background: #d1fae5; border: 1px solid #10b981; color: #065f46; }

    /* ── Description ── */
    .event-description {
      font-size: 16px;
      line-height: 1.7;
      color: #374151;
      margin-bottom: 36px;
    }

    /* ── Section headings ── */
    .section-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 14px;
    }

    /* ── Ticket cards ── */
    .ticket-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
    .ticket-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 18px;
      border: 2px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .ticket-card:hover { border-color: var(--primary); }
    .ticket-card input[type="radio"] { accent-color: var(--primary); width: 18px; height: 18px; flex-shrink: 0; }
    .ticket-card--soldout { opacity: 0.5; cursor: not-allowed; }
    .ticket-card.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, white); }
    .ticket-card__body { flex: 1; }
    .ticket-card__name { font-weight: 600; font-size: 15px; display: block; }
    .ticket-card__desc { font-size: 13px; color: var(--muted); display: block; margin-top: 2px; }
    .ticket-card__avail { font-size: 12px; color: #ef4444; display: block; margin-top: 2px; }
    .ticket-card__price { font-weight: 700; font-size: 18px; color: var(--primary); flex-shrink: 0; }

    /* ── Quantity ── */
    .qty-row {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 28px;
    }
    .qty-label { font-size: 14px; font-weight: 500; margin-right: 16px; }
    .qty-btn {
      width: 36px; height: 36px;
      border: 1px solid var(--border);
      background: #fff;
      font-size: 18px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      line-height: 1;
    }
    .qty-btn:first-of-type { border-radius: 8px 0 0 8px; }
    .qty-btn:last-of-type { border-radius: 0 8px 8px 0; }
    .qty-btn:hover { background: var(--surface); }
    .qty-display {
      width: 48px; height: 36px;
      border: 1px solid var(--border);
      border-left: none; border-right: none;
      text-align: center;
      font-size: 15px;
      font-weight: 600;
      line-height: 36px;
      user-select: none;
    }

    /* ── Form ── */
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
    @media (max-width: 500px) { .form-grid { grid-template-columns: 1fr; } }
    .form-field { display: flex; flex-direction: column; gap: 6px; }
    .form-field label { font-size: 13px; font-weight: 500; color: #374151; }
    .form-field input {
      height: 42px;
      padding: 0 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 15px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    .form-field input:focus { border-color: var(--primary); }

    /* ── Submit btn ── */
    .btn-checkout {
      width: 100%;
      height: 52px;
      background: var(--accent);
      color: var(--primary);
      border: none;
      border-radius: var(--radius);
      font-family: inherit;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
      letter-spacing: 0.01em;
    }
    .btn-checkout:hover { opacity: 0.92; transform: translateY(-1px); }
    .btn-checkout:active { transform: none; }
    .btn-checkout:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    /* ── Total display ── */
    .order-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-top: 1px solid var(--border);
      margin-bottom: 20px;
      font-size: 15px;
    }
    .order-total__label { color: var(--muted); }
    .order-total__amount { font-weight: 700; font-size: 20px; color: var(--primary); }

    /* ── No-tickets info box ── */
    .info-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--accent);
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-bottom: 24px;
    }
    .info-box__title { font-weight: 600; margin-bottom: 4px; }
    .info-box__text { font-size: 14px; color: var(--muted); }

    /* ── Error ── */
    .form-error {
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #b91c1c;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 14px;
      margin-bottom: 16px;
      display: none;
    }
    .form-error.visible { display: block; }

    /* ── Footer ── */
    footer {
      border-top: 1px solid var(--border);
      padding: 20px 24px;
      text-align: center;
    }
    .pillar-badge {
      font-size: 12px;
      color: var(--muted);
      text-decoration: none;
    }
    .pillar-badge:hover { color: var(--primary); }
  </style>
</head>
<body>

<nav class="site-nav">
  <a href="/" class="site-nav__brand">${esc(org.name)}</a>
  <a href="/#events" class="site-nav__back">← All events</a>
</nav>

<section class="event-hero">
  ${dateStr ? `<div class="event-hero__date">${esc(dateStr)}</div>` : ""}
  <h1 class="event-hero__title">${esc(event.name)}</h1>
  <div class="event-hero__meta">
    ${timeStr ? `<span>${esc(timeStr)}</span>` : ""}
    ${event.location ? `<span>${esc(event.location)}</span>` : ""}
  </div>
</section>

<main class="event-body">

  ${cancelled ? `<div class="alert alert--warning">Your checkout was cancelled — no charge was made. You can try again below.</div>` : ""}

  ${event.description ? `<p class="event-description">${esc(event.description)}</p>` : ""}

  ${showTicketForm && hasAnyQuantity ? `
  <form id="ticketForm" novalidate>
    <p class="section-label">Select tickets</p>
    <div class="ticket-cards" id="ticketCards">
      ${buildTicketCards(ticketTypes)}
    </div>

    <div class="qty-row">
      <span class="qty-label">Quantity</span>
      <button type="button" class="qty-btn" id="qtyDown">−</button>
      <div class="qty-display" id="qtyDisplay">1</div>
      <button type="button" class="qty-btn" id="qtyUp">+</button>
    </div>

    <p class="section-label">Your details</p>
    <div class="form-grid">
      <div class="form-field">
        <label for="attendeeName">Name <span style="color:#ef4444">*</span></label>
        <input type="text" id="attendeeName" name="attendeeName" placeholder="Your full name" required autocomplete="name">
      </div>
      <div class="form-field">
        <label for="attendeeEmail">Email (optional)</label>
        <input type="email" id="attendeeEmail" name="attendeeEmail" placeholder="For confirmation" autocomplete="email">
      </div>
    </div>

    <div class="order-total">
      <span class="order-total__label">Order total</span>
      <span class="order-total__amount" id="orderTotal">—</span>
    </div>

    <div class="form-error" id="formError"></div>
    <button type="submit" class="btn-checkout" id="checkoutBtn">Get Tickets</button>
  </form>
  ` : ""}

  ${showTicketForm && !hasAnyQuantity ? `
  <div class="alert alert--warning">This event is sold out. Check back later or contact the organizer.</div>
  ` : ""}

  ${!showTicketForm && ticketTypes.length > 0 && !acceptsPayments ? `
  <div class="info-box">
    <p class="info-box__title">Tickets available soon</p>
    <p class="info-box__text">Online ticket sales are not yet set up for this event. Contact the organizer for details.</p>
  </div>
  ` : ""}

  ${ticketTypes.length === 0 ? `
  <div class="info-box">
    <p class="info-box__title">Free event — no registration required</p>
    <p class="info-box__text">Just show up. Questions? Reach out to ${esc(org.name)} directly.</p>
  </div>
  ` : ""}

</main>

<footer>
  <a href="https://mypillar.co" class="pillar-badge" target="_blank" rel="noopener">Powered by Pillar</a>
</footer>

${showTicketForm && hasAnyQuantity ? `
<script>
(function() {
  const eventSlug = ${JSON.stringify(event.slug)};
  let qty = 1;
  let selectedPrice = null;
  let selectedId = null;

  const cards = document.querySelectorAll('.ticket-card');
  const qtyDisplay = document.getElementById('qtyDisplay');
  const qtyDown = document.getElementById('qtyDown');
  const qtyUp = document.getElementById('qtyUp');
  const totalEl = document.getElementById('orderTotal');
  const btn = document.getElementById('checkoutBtn');
  const formError = document.getElementById('formError');

  function updateTotal() {
    if (selectedPrice === null) { totalEl.textContent = '—'; return; }
    const total = selectedPrice * qty;
    totalEl.textContent = total === 0 ? 'Free' : '$' + (total % 1 === 0 ? total.toFixed(0) : total.toFixed(2));
  }

  function updateBtn() {
    if (!selectedId) { btn.textContent = 'Select a ticket type'; return; }
    if (selectedPrice === 0) { btn.textContent = 'Register (Free)'; }
    else {
      const total = selectedPrice * qty;
      btn.textContent = 'Buy Tickets — $' + (total % 1 === 0 ? total.toFixed(0) : total.toFixed(2));
    }
  }

  cards.forEach(function(card) {
    card.addEventListener('click', function() {
      if (card.classList.contains('ticket-card--soldout')) return;
      cards.forEach(function(c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      card.querySelector('input[type=radio]').checked = true;
      selectedId = card.dataset.ticketId;
      selectedPrice = parseFloat(card.dataset.price);
      updateTotal();
      updateBtn();
    });
  });

  qtyDown.addEventListener('click', function() {
    if (qty > 1) { qty--; qtyDisplay.textContent = qty; updateTotal(); updateBtn(); }
  });
  qtyUp.addEventListener('click', function() {
    if (qty < 20) { qty++; qtyDisplay.textContent = qty; updateTotal(); updateBtn(); }
  });

  document.getElementById('ticketForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    formError.classList.remove('visible');

    const name = document.getElementById('attendeeName').value.trim();
    const email = document.getElementById('attendeeEmail').value.trim();

    if (!selectedId) { showError('Please select a ticket type.'); return; }
    if (!name) { showError('Please enter your name.'); return; }

    btn.disabled = true;
    btn.textContent = 'Processing…';

    try {
      const res = await fetch('/api/public/events/' + eventSlug + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketTypeId: selectedId, quantity: qty, attendeeName: name, attendeeEmail: email || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Something went wrong. Please try again.'); return; }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.free) {
        window.location.href = '/events/' + eventSlug + '/tickets/success';
      }
    } catch (err) {
      showError('Network error. Please check your connection and try again.');
    } finally {
      btn.disabled = false;
      updateBtn();
    }
  });

  function showError(msg) {
    formError.textContent = msg;
    formError.classList.add('visible');
    btn.disabled = false;
    updateBtn();
  }
})();
</script>
` : ""}

</body>
</html>`;
}

export function buildEventSuccessPage(opts: {
  event: EventData;
  org: OrgData;
  siteHtml: string | null;
}): string {
  const { event, org } = opts;
  const { primary, accent } = extractColors(opts.siteHtml);
  const dateStr = formatDateShort(event.startDate);
  const startTime = formatTime(event.startTime);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're registered — ${esc(event.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --primary: ${primary}; --accent: ${accent}; }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: var(--primary);
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .check {
      width: 72px; height: 72px;
      background: var(--accent);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 28px;
      font-size: 32px;
    }
    h1 {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: clamp(28px, 5vw, 40px);
      margin-bottom: 16px;
    }
    .sub { color: rgba(255,255,255,0.75); font-size: 16px; line-height: 1.6; margin-bottom: 36px; }
    .event-summary {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      padding: 20px 28px;
      margin-bottom: 36px;
      max-width: 360px;
    }
    .event-summary__name { font-weight: 700; font-size: 18px; margin-bottom: 6px; }
    .event-summary__meta { color: rgba(255,255,255,0.7); font-size: 14px; }
    .btn {
      display: inline-block;
      background: var(--accent);
      color: var(--primary);
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 15px;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    footer { margin-top: 48px; }
    .pillar-badge { font-size: 12px; color: rgba(255,255,255,0.4); text-decoration: none; }
    .pillar-badge:hover { color: rgba(255,255,255,0.7); }
  </style>
</head>
<body>
  <div class="check">✓</div>
  <h1>You're registered!</h1>
  <p class="sub">We'll see you there. Check your email for a confirmation if you provided one.</p>
  <div class="event-summary">
    <p class="event-summary__name">${esc(event.name)}</p>
    ${dateStr || startTime ? `<p class="event-summary__meta">${[dateStr, startTime].filter(Boolean).join(" · ")}</p>` : ""}
    ${event.location ? `<p class="event-summary__meta">${esc(event.location)}</p>` : ""}
  </div>
  <a href="/" class="btn">Back to ${esc(org.name)}</a>
  <footer>
    <a href="https://mypillar.co" class="pillar-badge" target="_blank" rel="noopener">Powered by Pillar</a>
  </footer>
</body>
</html>`;
}

export function buildEventNotFoundPage(orgName: string, siteHtml: string | null): string {
  const { primary, accent } = extractColors(siteHtml);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event not found — ${esc(orgName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: ${primary};
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }
    h1 { font-size: 32px; margin-bottom: 12px; }
    p { color: rgba(255,255,255,0.7); margin-bottom: 32px; }
    a {
      background: ${accent};
      color: ${primary};
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <h1>Event not found</h1>
  <p>This event may have ended or the link may be incorrect.</p>
  <a href="/">Back to ${esc(orgName)}</a>
</body>
</html>`;
}
