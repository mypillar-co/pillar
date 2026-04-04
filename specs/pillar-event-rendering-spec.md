# Pillar: Event Rendering Specification (STRICT)

**This document defines exactly how events created in the dashboard become pages on the site. Every event in the database MUST appear on the site with the correct visual treatment. No event should ever be "created but not showing."**

---

## THE PIPELINE: DASHBOARD OR AUTOPILOT → DATABASE → SITE

Events can be created TWO ways. Both MUST produce the exact same result:

### Path A: User creates event in dashboard
```
1. User fills out event form in dashboard (title, date, time, location, description, ticketed?, price, capacity, featured?)
2. Dashboard stores event in database with all fields + auto-generated slug
3. Site's frontend queries the database via API
4. Frontend renders the event everywhere it belongs (homepage featured, events listing, nav dropdown)
5. Each event with a slug gets its own detail page at /events/{slug}
6. If the event is ticketed, the detail page includes a working purchase form
7. If the event has sponsors, the detail page shows sponsor logos by tier
```

### Path B: Autopilot creates event via AI
```
1. User tells Autopilot (the AI agent) to create an event — e.g., "Add a pancake breakfast fundraiser on April 12"
2. Autopilot extracts event data from the user's message:
   - Title, date, time, location, description
   - Whether it's ticketed (if user mentions tickets, price, or capacity)
   - Ticket price and capacity (if applicable)
   - Category (inferred from context: "fundraiser" → Fundraiser, "cookoff" → Community, etc.)
   - Featured flag (Autopilot SHOULD set featured=true for the next upcoming ticketed event or any event the user emphasizes)
3. Autopilot calls the SAME API endpoint the dashboard uses:
   POST /api/management/events { ... same payload ... }
4. Result is identical to Path A — event appears on the site immediately
```

**Autopilot MUST NOT create events by editing code or templates.** It MUST use the API. This ensures events go through the same pipeline as dashboard-created events and appear on the site immediately without a rebuild.

**Autopilot MUST ask clarifying questions if critical info is missing:**
- Title: REQUIRED (never guess)
- Date: REQUIRED (ask if not mentioned)
- Time: Ask if not mentioned, default to "TBD" if user says "I'll set it later"
- Location: Ask if not mentioned, default to org's primary address
- Ticketed: Default to false unless user mentions tickets, price, or "paid event"
- Price: REQUIRED if ticketed (never guess a price)
- Capacity: Optional, default to null (unlimited)
- Featured: Default to true for the soonest upcoming event, false for others

**If any step in this pipeline breaks, events don't show up. The build engine MUST verify the full pipeline after every event creation, regardless of which path created it.**

---

## SLUG GENERATION (AUTOMATIC)

When an event is created, the system MUST auto-generate a URL slug if one isn't provided.

```
Input: "Annual Chili Cookoff 2026"
Output: "annual-chili-cookoff-2026"

Input: "St. Patrick's Day Fun Fest"
Output: "st-patricks-day-fun-fest"

Input: "34th Annual Car Cruise"
Output: "34th-annual-car-cruise"

Rules:
1. Lowercase everything
2. Replace spaces and special characters with hyphens
3. Remove apostrophes, periods, commas, ampersands
4. Collapse multiple hyphens into one
5. Trim leading/trailing hyphens
6. If slug already exists in database, append -2, -3, etc.
```

The slug is used for:
- The event's URL: `https://{baseUrl}/events/{slug}`
- Linking sponsors to events: `eventType = slug`
- Linking vendor registrations: `eventSlug = slug`
- Dashboard API: `/api/event-tickets.json?event={slug}`

---

## HOMEPAGE FEATURED EVENTS SECTION (MANDATORY)

**The homepage MUST display featured events.** This is how Discover Irwin works and how every Pillar site MUST work. The homepage is the first thing visitors see — if events aren't on it, they might as well not exist.

### How "Featured" Works

Events have a `featured` boolean field (default: false). When `featured = true`, the event appears in the homepage featured events section.

**Auto-featuring rules (the system MUST apply these automatically):**
1. If no events are manually marked featured, auto-feature the next 3 upcoming events by date
2. If only 1-2 events are manually marked featured, fill remaining slots (up to 3) with the next soonest events
3. Maximum 3 featured events on the homepage (keeps it clean, not cluttered)
4. Past events (date has passed) MUST be auto-removed from featured — never show an expired event on the homepage
5. Ticketed events with remaining capacity SHOULD be prioritized for featuring (they drive revenue)

### Homepage Featured Events Section Structure (STRICT)

```
┌──────────────────────────────────────────────────────────────────┐
│  SECTION: "Upcoming Events"                                      │
│                                                                  │
│  ┌─ Header Row ───────────────────────────────────────────────┐  │
│  │  "Upcoming Events"  (h2, bold, serif or brand font)       │  │
│  │  "Free community events for everyone"  (subtitle, muted)  │  │
│  │                                      [View All →] button  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ 3-Column Grid (1 col mobile) ────────────────────────────┐  │
│  │  ┌─ Event Card ─┐  ┌─ Event Card ─┐  ┌─ Event Card ─┐   │  │
│  │  │ [Image/Bar]  │  │ [Image/Bar]  │  │ [Image/Bar]  │   │  │
│  │  │ [Badge]      │  │ [Badge]      │  │ [Badge]      │   │  │
│  │  │ Title        │  │ Title        │  │ Title        │   │  │
│  │  │ Description  │  │ Description  │  │ Description  │   │  │
│  │  │ 📅 Date      │  │ 📅 Date      │  │ 📅 Date      │   │  │
│  │  │ 🕐 Time      │  │ 🕐 Time      │  │ 🕐 Time      │   │  │
│  │  │ 📍 Location  │  │ 📍 Location  │  │ 📍 Location  │   │  │
│  │  │ [Tickets $X] │  │ [Learn More] │  │ [Tickets $X] │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [IF no events at all: show friendly empty state with            │
│   calendar icon and "Check back soon for upcoming events!"]      │
└──────────────────────────────────────────────────────────────────┘
```

### MANDATORY Homepage Rules

1. The featured events section MUST be one of the first sections on the homepage (immediately after the hero or after a brief "about" intro)
2. Each featured event card uses the SAME card component as the events listing page — same icons, badges, hover effects, structure
3. The "View All" button links to /events
4. Loading state: show 3 skeleton cards (image placeholder + text lines) while fetching
5. Empty state: show a card with a calendar icon and "Check back soon for upcoming events!" — NOT a blank space
6. Ticketed events in the featured section MUST show the ticket price badge and "Buy Tickets" CTA
7. Non-ticketed events show "Learn More" CTA
8. Each card links to the event's detail page at /events/{slug}

### Homepage Section Order (Recommended)

The homepage SHOULD follow this general section order (adapt per org type):

```
1. Hero (colored/image background, org name, tagline, CTAs)
2. Featured Events (the section defined above — 3 event cards)
3. About / Mission (brief org description)
4. Programs / Services (card grid with icons)
5. Business Directory or Member Spotlight (if applicable)
6. Newsletter Signup (if applicable)
7. Sponsors (if applicable — org-level sponsors, not event-specific)
8. Contact
9. Footer
```

**The featured events section MUST NOT be buried at the bottom.** Events are what drive engagement and visits. They go near the top.

### What Changes When Events Change

When events are created, updated, deleted, or their featured status changes:

| Change | Homepage Effect |
|---|---|
| New event created with featured=true | Immediately appears in featured section |
| New event created, no featured events set | Auto-featured (becomes one of top 3 by date) |
| Event date passes | Auto-removed from featured on next page load |
| Event deleted | Immediately removed from featured section |
| Event unfeatured | Removed from featured; next soonest auto-fills the slot |
| Event becomes sold out | Stays in featured but shows "SOLD OUT" badge |
| Ticketed event gets ticket price changed | Featured card updates to show new price |

**All of these MUST happen automatically on the next page load. No rebuild. No deploy. No manual steps.**

---



**This page MUST automatically display every event in the database where `isActive = true`.**

The page queries:
```
GET /api/events → returns all active events
```

### Rendering Rules

**Sort order:** By date, soonest first. Events without dates go to the bottom. This sort MUST happen on every page load — not just once at build time.

**Layout:** Responsive card grid (1 col mobile, 2 col tablet, 3 col desktop).

**Each event card MUST contain:**

```
┌─────────────────────────────────────┐
│ [Event image if exists, h-48,       │
│  object-cover, full width]          │
│ OR                                  │
│ [4px colored accent bar if no image]│
├─────────────────────────────────────┤
│ [Category badge]                    │
│                                     │
│ Event Title                         │
│ Description (2 lines max)           │
│                                     │
│ 📅 Date                             │
│ 🕐 Time                             │
│ 📍 Location                         │
│                                     │
│ [IF ticketed: "Tickets: $XX" badge] │
│ [IF ticketed: "Buy Tickets" button] │
│ [IF has slug: "Learn More" button]  │
└─────────────────────────────────────┘
```

**MANDATORY:** If the event is ticketed, the card MUST show the ticket price and a Buy Tickets button. Do not hide ticket information on the listing page — it's a primary call to action.

**Category filtering:** If there are more than 5 events, show filter tabs at the top by category. Categories come from the event data (Community, Festival, Fundraiser, etc.).

---

## EVENT DETAIL PAGE (/events/{slug})

**Every event with a slug MUST have a detail page.** This is not optional. The detail page is what people land on from shared links, Google, newsletters, and event cards.

The page queries:
```
GET /api/events/slug/{slug} → event data
GET /api/sponsors/event/{slug} → sponsors for this event
GET /api/events/{slug}/ticket-availability → remaining tickets (if ticketed)
```

### Page Structure (STRICT — this order, these sections)

```
SECTION 1: HERO
├── Full-width section with colored background (event's category color or primary color)
├── OR event image as background with dark overlay
├── Event title (h1, text-4xl, bold)
├── Date + Time + Location (with icons, large enough to read)
├── [IF ticketed: Price badge + "Buy Tickets" CTA button]
├── [IF ticketed + capacity: "XX tickets remaining" indicator]

SECTION 2: ABOUT THIS EVENT
├── Full event description
├── [IF event has highlights: icon cards in a grid]
│   └── Each highlight: icon + title + short description
├── [IF event has schedule: timeline/list of scheduled activities]
│   └── Each item: time + activity

SECTION 3: TICKET PURCHASE (ONLY if isTicketed === true)
├── Section heading: "Get Your Tickets"
├── Purchase form:
│   ├── Full Name (required text input)
│   ├── Email (required email input)
│   ├── Quantity (dropdown, 1-10)
│   ├── Price display: "$XX per ticket"
│   ├── Total display: "$XX total" (computed: price × quantity)
│   ├── [IF capacity set: "XX of YY tickets remaining"]
│   ├── [IF sold out: "SOLD OUT" badge, form disabled]
│   └── "Buy Tickets" submit button (primary, large)
├── On submit: POST to /api/events/{slug}/ticket-checkout
├── On success: redirect to payment provider checkout URL
├── On error: show error message (sold out, capacity exceeded, etc.)

SECTION 4: SPONSORS (ONLY if hasSponsorSection === true AND sponsors exist)
├── Section heading: "Our Sponsors" or "Thank You to Our Sponsors"
├── Sponsors grouped by tier, visual size decreasing:
│   ├── Presenting: grid-cols-1 md:grid-cols-2, logos h-24 to h-32
│   ├── Gold: grid-cols-2 md:grid-cols-3, logos h-16 to h-20
│   ├── Silver: grid-cols-3 md:grid-cols-4, logos h-12 to h-16
│   └── Supporting: grid-cols-4 md:grid-cols-6, logos h-8 to h-12
├── Each logo links to sponsor website if provided
├── Tier labels above each group

SECTION 5: VENDOR REGISTRATION (ONLY if hasRegistration === true AND NOT closed)
├── Section heading: "Vendor Registration"
├── Registration form or link to registration
├── [IF registrationClosed: "Registration is closed" message]

SECTION 6: CONTACT
├── "Questions about this event?"
├── Organization contact info
├── Link to contact page
```

### Section Visibility Rules

**These rules are absolute. The build engine MUST follow them:**

| Condition | Section 3 (Tickets) | Section 4 (Sponsors) | Section 5 (Vendors) |
|---|---|---|---|
| isTicketed = false | HIDDEN | — | — |
| isTicketed = true | VISIBLE with full purchase form | — | — |
| hasSponsorSection = false | — | HIDDEN | — |
| hasSponsorSection = true, no sponsors in DB | — | HIDDEN (don't show empty section) | — |
| hasSponsorSection = true, sponsors exist | — | VISIBLE with logos | — |
| hasRegistration = false | — | — | HIDDEN |
| hasRegistration = true, registrationClosed = true | — | — | VISIBLE but shows "closed" message |
| hasRegistration = true, registrationClosed = false | — | — | VISIBLE with form |

**NEVER show an empty section.** If there are no sponsors, hide the entire sponsors section — don't show a heading with nothing under it.

---

## TICKET PURCHASE FLOW (WHEN isTicketed = true)

This is the most critical feature. A broken ticket flow means lost revenue. Follow this EXACTLY.

### Step 1: Display

On the event detail page, the ticket section MUST show:
- Price per ticket (from `event.ticketPrice`)
- Buyer name input (required)
- Buyer email input (required)
- Quantity selector (1-10 dropdown)
- Computed total (price × quantity, displayed in real time as quantity changes)
- Remaining tickets (if capacity is set): fetch from `/api/events/{slug}/ticket-availability`
- Sold Out state: if remaining = 0, show "SOLD OUT" badge, disable form

### Step 2: Submit

```
POST /api/events/{slug}/ticket-checkout
{
  "buyerName": "John Doe",
  "buyerEmail": "john@example.com",
  "quantity": 2
}
```

The backend:
1. Validates input
2. Computes total server-side (NEVER trust frontend total)
3. Checks capacity
4. Creates PENDING purchase record
5. Creates payment link with payment provider
6. Returns `{ checkoutUrl: "https://..." }`

The frontend redirects to `checkoutUrl`.

### Step 3: Payment

User pays on the payment provider's hosted checkout. Provider redirects back to:
```
https://{baseUrl}/payment-success?purchaseId={id}
```

### Step 4: Confirmation

The payment success page:
1. Polls `/api/ticket-purchases/{id}/status` every 2 seconds
2. Shows "Processing your payment..." with spinner while status = pending
3. When status = completed: shows confirmation number, event details, "check your email"
4. Webhook + background reconciler handle the status update (see agent guide for details)

### Step 5: Email

System sends confirmation email with:
- Confirmation number
- Event name, date, time, location
- Quantity and total paid
- "Show this email at check-in"

---

## NON-TICKETED EVENTS

If `isTicketed = false`:
- No ticket section on the detail page
- No price display on the event card
- No "Buy Tickets" button
- The event still gets a full detail page with hero, description, sponsors, etc.
- The event card on the listing page shows "Learn More" instead of "Buy Tickets"

---

## RECURRING EVENTS

**Detection:** If two or more events in the database have the same title (case-insensitive, ignoring trailing whitespace), they are recurring.

**Display rules:**

On the LISTING PAGE:
- Show ONE card for the recurring event
- Date line shows the schedule pattern: "Every Tuesday, 12:00-1:00 PM"
- OR shows the next upcoming occurrence date
- Do NOT show separate cards for every occurrence

On the NAV DROPDOWN:
- Show ONE entry for the recurring event
- Label: "[Event Name] — [Schedule]"

**Exception:** If the recurring events have DIFFERENT locations, descriptions, or prices, they may be intentionally separate and should display individually. Only collapse identical recurring events.

---

## EVENT DATA FRESHNESS

The site MUST display current data, not stale build-time data.

**Rules:**
- Event listing page fetches from API on every page load (not cached at build time)
- Ticket availability fetches fresh on every detail page load
- Sponsor list fetches fresh on every detail page load
- If an event is created in the dashboard, it MUST appear on the site within seconds (next page load), NOT after a rebuild or deploy

**This means the site MUST be a live application querying an API, not a static site generated at build time.** Static generation will always have stale data. Events must appear immediately after creation.

---

## SITE VERIFICATION (AFTER ANY EVENT CREATION — DASHBOARD OR AUTOPILOT)

After creating an event — whether the user did it in the dashboard or Autopilot did it via API — the system MUST verify ALL of the following:

```
HOMEPAGE CHECKS:
1.  [ ] IF featured=true OR auto-featured: event card appears in homepage featured section
2.  [ ] Homepage featured section shows max 3 events, sorted by date
3.  [ ] Featured event cards have correct images/accent bars, badges, icons, hover effects
4.  [ ] Featured ticketed events show price badge and "Buy Tickets" CTA
5.  [ ] "View All" button links to /events page

EVENTS LISTING CHECKS:
6.  [ ] Event appears on /events listing page
7.  [ ] Event card shows date, time, location with correct icons
8.  [ ] Events are sorted by date (soonest first, dateless at end)

DETAIL PAGE CHECKS:
9.  [ ] Event exists in database with all fields populated
10. [ ] Event has a valid slug
11. [ ] Event detail page loads at /events/{slug}
12. [ ] IF ticketed: detail page shows purchase form with correct price
13. [ ] IF ticketed: purchase form submits successfully to checkout endpoint
14. [ ] IF ticketed: payment redirect URL uses correct baseUrl
15. [ ] IF ticketed + capacity: remaining count displays correctly
16. [ ] IF sponsors exist for this event: sponsor section shows logos

NAVIGATION CHECKS:
17. [ ] Event appears in nav dropdown (if showInNav = true)
18. [ ] Nav dropdown events are sorted by date
```

**If any check fails, the pipeline is broken and MUST be fixed.**

**This verification runs identically for dashboard-created and Autopilot-created events. There is no difference in expected behavior.**

---

## ERROR STATES THE SITE MUST HANDLE

### Event Not Found
If someone visits `/events/nonexistent-slug`:
- Show a 404 page with "Event not found"
- Link back to /events listing
- Do NOT show a blank white page or a crash

### Sold Out
If a ticketed event reaches capacity:
- Event card shows "SOLD OUT" badge (red)
- Detail page shows "SOLD OUT" in ticket section
- Purchase form is disabled (grayed out, submit button disabled)
- Price and capacity info still visible

### Registration Closed
If vendor/sponsor registration is closed:
- Show "Registration is closed" message in that section
- Do NOT hide the section entirely (people need to know it exists but is closed)
- Do NOT show the registration form

### No Events
If there are no active events in the database:
- Events page shows a friendly empty state
- "No upcoming events. Check back soon!"
- Do NOT show a blank page or error

---

## EXAMPLE A: USER CREATES AN EVENT IN THE DASHBOARD

Exact sequence the system follows:

```
1. User fills out event form in dashboard:
   - Title: "Spring Gala"
   - Date: "Saturday, May 10, 2026"
   - Time: "6:00 - 10:00 PM"
   - Location: "Community Center"
   - Description: "Annual fundraising gala with dinner and auction"
   - Category: "Fundraiser"
   - Ticketed: Yes
   - Price: $50
   - Capacity: 150
   - Featured: Yes

2. Dashboard sends to API:
   POST /api/management/events {
     title: "Spring Gala",
     slug: "spring-gala",
     date: "Saturday, May 10, 2026",
     time: "6:00 - 10:00 PM",
     location: "Community Center",
     description: "Annual fundraising gala with dinner and auction",
     category: "Fundraiser",
     isTicketed: true,
     ticketPrice: "50",
     ticketCapacity: 150,
     featured: true,
     isActive: true,
     showInNav: true,
     hasRegistration: false,
     hasSponsorSection: false
   }

3. API creates event record in database with id and slug

4. Site immediately reflects the new event:
   - HOMEPAGE: Spring Gala card appears in featured events section (with $50 price badge + "Buy Tickets")
   - /events page: new card appears, sorted by date into correct position
   - /events/spring-gala: detail page is accessible with full content
   - Nav dropdown: "Spring Gala" appears in the event list
   - Ticket form on detail page shows $50/ticket, 150 capacity, 0 sold

5. User shares https://{baseUrl}/events/spring-gala
   - Anyone clicking this link sees the event detail page
   - They can buy tickets immediately

6. No rebuild. No deploy. No manual steps. It just works.
```

---

## EXAMPLE B: AUTOPILOT CREATES AN EVENT VIA CONVERSATION

```
1. User says to Autopilot: "Add a pancake breakfast fundraiser on April 12 at the fire hall. 
   $15 per person, 80 spots max."

2. Autopilot parses this and constructs the event:
   - Title: "Pancake Breakfast Fundraiser"
   - Date: "Saturday, April 12, 2026"     ← resolves day of week
   - Time: "TBD"                            ← not mentioned, so Autopilot asks:
     "What time does the pancake breakfast start and end?"
     User: "8am to noon"
   - Time: "8:00 AM - 12:00 PM"
   - Location: "Fire Hall"                  ← from user message
   - Description: Autopilot generates a SHORT, factual description from the user's words:
     "Pancake breakfast fundraiser at the Fire Hall. $15 per person."
     (NO AI filler like "Join us for a morning of community togetherness and delicious food!")
   - Category: "Fundraiser"                 ← inferred from "fundraiser"
   - Ticketed: true                          ← inferred from "$15 per person"
   - Price: "15"                             ← from "$15"
   - Capacity: 80                            ← from "80 spots max"
   - Featured: true                          ← it's the next upcoming ticketed event

3. Autopilot confirms with user before creating:
   "I'll add a Pancake Breakfast Fundraiser:
   - April 12, 8:00 AM - 12:00 PM at the Fire Hall
   - $15/ticket, 80 spots
   Sound right?"
   
   User: "yes"

4. Autopilot calls the API:
   POST /api/management/events {
     title: "Pancake Breakfast Fundraiser",
     slug: "pancake-breakfast-fundraiser",
     date: "Saturday, April 12, 2026",
     time: "8:00 AM - 12:00 PM",
     location: "Fire Hall",
     description: "Pancake breakfast fundraiser at the Fire Hall. $15 per person.",
     category: "Fundraiser",
     isTicketed: true,
     ticketPrice: "15",
     ticketCapacity: 80,
     featured: true,
     isActive: true,
     showInNav: true,
     hasRegistration: false,
     hasSponsorSection: false
   }

5. Result is IDENTICAL to Example A:
   - HOMEPAGE: Pancake Breakfast card appears in featured section
   - /events: card appears sorted by date
   - /events/pancake-breakfast-fundraiser: detail page with ticket form
   - Nav dropdown: "Pancake Breakfast Fundraiser" appears
   - Tickets purchasable immediately

6. Autopilot confirms: "Done! Your Pancake Breakfast Fundraiser is live at 
   [url]/events/pancake-breakfast-fundraiser. It's featured on the homepage 
   and tickets are ready to sell."
```

**CRITICAL: Autopilot-created events MUST look and function identically to dashboard-created events. Same cards, same detail pages, same ticket flow, same featured treatment. There is ONE pipeline, TWO entry points.**

**If this sequence doesn't work end-to-end, the site architecture is wrong.**
