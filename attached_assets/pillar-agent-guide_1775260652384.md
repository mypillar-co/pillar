# Pillar AI Agent: Complete Site Building & Management Guide

This document teaches an AI agent how to autonomously build, design, and manage community event websites. It covers the exact questions to ask, how to make design decisions from the answers, and how to manage the site after it's built.

---

## PHASE 0: THE QUESTIONNAIRE

Before building anything, the agent MUST gather this information. Ask these questions in natural conversation, not as a form dump. Group related questions together. Skip questions you can infer from previous answers.

### Block 1: Identity (Ask first, always)

1. "What's the name of your organization?"
   → Determines: site title, nav branding, email sender name, meta tags

2. "Where are you located? (City, State)"
   → Determines: footer content, SEO keywords, map embeds, local flavor of design

3. "In one sentence, what does your organization do?"
   → Determines: homepage tagline, meta description, about page seed content

4. "Do you have an existing website? If so, what's the URL?"
   → If yes: STOP the interview here and run the full crawl pipeline defined in `pillar-site-crawl-spec.md`.
   → The crawl extracts: org name, logo, images, events, programs, contact info, leadership, colors, documents, social links.
   → After the crawl completes, resume the interview but SKIP any questions already answered by crawled data.
   → Present the crawl summary to the user: "I found [X] events, [Y] images, your logo, contact info, and [Z] programs. Does this look right?"
   → NEVER make the user re-type things the crawl already found.

5. "Do you have a logo? Upload it or give me a link."
   → Determines: nav logo, favicon, email header, social sharing image

6. "What are your social media links? (Facebook, Instagram, etc.)"
   → Determines: nav social icons, footer links, social meta tags

### Block 2: Events (Ask second)

7. "List all your events. For each one, give me the name and approximate date."
   → This is the most important content question. Everything else orbits events.

8. "Do any of these events repeat regularly? (monthly, annually, etc.)"
   → Determines: whether to show "recurring" badge, how to handle date display

9. "For each event, does it: (a) sell tickets, (b) accept vendor registrations, (c) have sponsors?"
   → Determines: which feature flags to enable per event

10. "What are your ticket prices? Is there a capacity limit?"
    → Determines: ticketPrice, ticketCapacity per event

11. "What are your vendor registration fees?"
    → Determines: vendor tier pricing

12. "What are your sponsorship levels and prices? (e.g., Gold $400, Silver $200)"
    → Determines: sponsor tier structure and pricing

### Block 3: Features (Ask third, only what's not already answered)

13. "Do you want a business directory? (list of local businesses)"
    → Determines: whether to include businesses table and directory page

14. "Do you want a photo gallery for past events?"
    → Determines: whether to include gallery functionality

15. "Do you want a newsletter signup?"
    → Determines: whether to include newsletter subscriber table and form

16. "Do you want a contact form?"
    → Almost always yes. Include by default.

### Block 4: Payments & Integrations (Ask when relevant)

17. "Do you use Square or Stripe for payments? Or do you need one set up?"
    → Determines: payment provider integration

18. "Do you use SendGrid or another email service?"
    → Determines: transactional email provider

19. "Do you manage events in a spreadsheet or dashboard? If so, how?"
    → Determines: whether to build dashboard sync API

### Block 5: Design Preferences (Ask last, or infer)

20. "Do you have brand colors? If not, what feeling should the site give? (warm/community, professional/corporate, fun/festive)"
    → Determines: color palette. Most users won't have brand colors. Infer from org type.

21. "Can you point me to any websites you like the look of?"
    → If provided: extract color palette, layout patterns, font choices as reference

---

## PHASE 1: DESIGN DECISION ENGINE

These are deterministic rules. Given the questionnaire answers, the agent makes these decisions without asking the user.

### Color Selection Rules

Map organization type to color temperature:

| Organization Type | Primary Color Range (HSL Hue) | Reasoning |
|---|---|---|
| Community association / civic org | 140-180 (teal/green) or 200-220 (warm blue) | Trustworthy, grounded, local |
| Business association / chamber | 200-230 (navy/deep blue) or 160-180 (deep teal) | Professional but approachable |
| Festival / entertainment org | 20-40 (warm orange/gold) or 260-280 (rich purple) | Energetic, celebratory |
| Arts / cultural org | 330-350 (burgundy) or 170-190 (teal) | Sophisticated, creative |
| Church / religious org | 220-240 (deep blue) or 260-280 (purple) | Reverent, calm |
| Sports / recreation | 140-160 (green) or 200-220 (blue) | Active, fresh |
| Children / family focused | 30-50 (warm yellow/orange) or 280-300 (friendly purple) | Warm, playful |
| Food / restaurant group | 15-35 (warm red-orange) or 40-60 (golden) | Appetizing, inviting |

**Saturation rules:**
- Small town / community: 40-60% saturation (muted, approachable)
- Urban / modern: 60-80% saturation (vibrant, energetic)
- Corporate / professional: 30-50% saturation (subdued, serious)

**Lightness rules:**
- Primary button/accent: 40-50% lightness (visible, not too dark or light)
- Primary foreground (text on primary): always white or near-white for contrast
- Background: 98-100% lightness (nearly white)
- Foreground (body text): 5-15% lightness (nearly black)

**Implementation:**
```css
:root {
  --primary: [hue] [saturation]% [lightness]%;
  --primary-foreground: 0 0% 100%;
  --background: 0 0% 100%;
  --foreground: [hue] 5% 10%;
  --muted: [hue] 10% 96%;
  --muted-foreground: [hue] 5% 45%;
  --card: 0 0% 100%;
  --card-foreground: [hue] 5% 10%;
  --border: [hue] 10% 90%;
  --accent: [hue] 30% 95%;
  --accent-foreground: [hue] 5% 10%;
}
```

Replace every placeholder. Derive every variable from the primary hue. This guarantees visual cohesion.

### Typography Rules

| Organization Vibe | Headline Font | Body Font | Why |
|---|---|---|---|
| Established / traditional / historic | Serif (Georgia, Merriweather) | Sans-serif (system) | Serif says "we've been here, we're trustworthy" |
| Modern / tech / startup | Sans-serif (Inter, system) | Sans-serif (system) | Clean, current |
| Festive / fun / casual | Rounded sans-serif or bold sans | Sans-serif (system) | Approachable, energetic |
| Elegant / arts / upscale | Thin serif or light sans | Sans-serif (system) | Refined without being stuffy |

**Always use system font stack for body text.** Custom web fonts slow page load. The difference is invisible to users.

**Font size hierarchy (never deviate):**
```
h1 (page title):     text-3xl (30px) mobile, text-4xl (36px) desktop
h2 (section header): text-2xl (24px) mobile, text-3xl (30px) desktop
h3 (card title):     text-lg (18px) all screens
Body:                text-base (16px) or text-sm (14px)
Labels/metadata:     text-xs (12px)
Muted/secondary:     same size as context, color text-muted-foreground
```

### Layout Rules

**Page width:** Always `max-w-7xl mx-auto` (1280px max, centered). Content should never stretch full-width on a 4K monitor.

**Spacing rhythm:**
```
Section padding:        py-12 md:py-16 (48px mobile, 64px desktop)
Content padding:        px-4 (16px sides, prevents edge-touching on mobile)
Between cards/items:    gap-4 (16px) or gap-6 (24px)
Inside cards:           p-5 (20px)
Between text elements:  mb-2 (8px) for tight, mb-4 (16px) for normal, mb-8 (32px) for section breaks
```

**Grid columns:**
```
Event cards:     grid-cols-1 md:grid-cols-2 lg:grid-cols-3
Business cards:  grid-cols-1 md:grid-cols-2 lg:grid-cols-3
Sponsor logos:   varies by tier (see sponsor display rules)
Gallery photos:  grid-cols-2 md:grid-cols-3 lg:grid-cols-4
```

Never more than 3 columns for content cards. Never more than 4-6 for logos/photos.

### Hero Section Rules

Every page gets a hero section. Structure:

```
[Background: bg-card with border-b, OR hero image with overlay]
[Container: max-w-7xl mx-auto px-4 py-12 md:py-16]
  [Optional badge: small category/feature indicator]
  [Title: h1, font-bold, font-serif (if using serif headlines)]
  [Subtitle: text-muted-foreground, max-w-2xl (ALWAYS constrain width)]
  [Optional CTA: primary button]
```

`max-w-2xl` on subtitle text is MANDATORY. Lines longer than ~70 characters are hard to read. This constraint ensures readability on all screen sizes.

### Navigation Rules

**Desktop (lg and above):**
- Sticky header: `sticky top-0 z-50`
- Semi-transparent: `bg-background/90 backdrop-blur-md border-b`
- Logo left, nav links center or left-of-center, social icons right
- If more than 6 events, use a dropdown menu grouped by category

**Mobile (below lg):**
- Hamburger icon button on the right
- Slide-out sheet from right side
- Full-height, scrollable (`overflow-y-auto`)
- Same links as desktop, stacked vertically
- Close on navigation (onClick close the sheet)

### Card Design Rules

Every card follows this anatomy:
```
[Optional image: full-width, h-48 (192px), object-cover, rounded-none at top]
[Content area: p-5]
  [Category badge: small, muted variant, mb-3]
  [Title: font-semibold text-lg, mb-2]
  [Description: text-sm text-muted-foreground, line-clamp-2, mb-4]
  [Metadata: flex flex-col gap-2, each with icon + text]
```

CRITICAL rules:
- `object-cover` on ALL images. User-uploaded images will be random sizes. object-cover crops to fill without distortion.
- `line-clamp-2` on descriptions. Prevents one long description from breaking grid alignment.
- Hover effect on clickable cards: subtle shadow increase + slight lift (1-2px translateY)

### Sponsor Display Rules

Group sponsors by tier. Visual size decreases with tier:

```
Presenting:  grid-cols-1 md:grid-cols-2, large logos (h-24 to h-32)
Gold:        grid-cols-2 md:grid-cols-3, medium logos (h-16 to h-20)
Silver:      grid-cols-3 md:grid-cols-4, smaller logos (h-12 to h-16)
Supporting:  grid-cols-4 md:grid-cols-6, small logos (h-8 to h-12)
```

Sponsors pay for visibility. The paying hierarchy MUST be visually obvious. This mirrors physical event banners.

### Button Hierarchy Rules

Only ONE button style should dominate per section:

```
Primary action (Buy Tickets, Register):  Solid primary color background, white text
Secondary action (Add to Calendar):       Outline variant, border only
Tertiary/navigation (Show All Events):    Ghost variant, text-only with hover background
Destructive (Cancel, Delete):             Red/destructive variant, admin only
```

If everything is a big bright button, nothing stands out. The user's eye must be drawn to the ONE thing you want them to do.

---

## PHASE 2: SITE STRUCTURE DECISION ENGINE

Based on the features the user needs, include these pages:

### Always include:
- **Home** (`/`) — hero, featured events, about preview, newsletter signup
- **Events** (`/events`) — filterable grid of all events
- **Contact** (`/contact`) — contact form, organization info
- **About** (`/about`) — organization history, mission, team (if applicable)

### Include if feature is enabled:
- **Event Detail** (`/events/:slug`) — dynamic per-event page with ticket/vendor/sponsor sections
- **Business Directory** (`/businesses`) — if businessDirectory feature enabled
- **Dedicated Event Pages** (`/car-cruise`, `/night-market`) — for major recurring events that need their own branded page
- **Payment Success** (`/payment-success`) — if ticketing is enabled
- **Admin** (`/admin`) — always include, behind auth

### Event Detail Page Section Order

This order follows the user's decision funnel:

```
1. Hero — confirms they're on the right event (title, date, time, location, image)
2. About This Event — description, details
3. Buy Tickets — form (if isTicketed). This is the primary action.
4. Sponsors — logos grouped by tier (if hasSponsorSection)
5. Vendor Registration — signup form (if hasRegistration)
6. Contact/Questions — fallback CTA
```

Users decide top-to-bottom: "Is this the right event?" → "What is it?" → "I want to go" → "Who's sponsoring?" → "I want to be a vendor."

---

## PHASE 3: DATA MODEL

Generate these tables based on enabled features. Always include events and siteContent.

### Always:
```
events — id, title, slug (unique), date (text), time, location, description, category,
         imageUrl, featured (bool), isActive (bool), showInNav (bool), externalLink,
         isTicketed (bool), ticketPrice (text), ticketCapacity (int nullable),
         hasRegistration (bool), registrationClosed (bool), registrationForceOpen (bool),
         hasSponsorSection (bool), sponsorRegistrationClosed (bool)

siteContent — id, key (unique), value
              (stores ALL editable text: taglines, descriptions, social links, etc.)

contactMessages — id, name, email, subject, message, createdAt
```

### If ticketing enabled:
```
ticketPurchases — id, eventId, buyerName, buyerEmail, quantity, totalAmount (INT, CENTS),
                  squareOrderId (text), confirmationNumber (text), status (text: pending/completed),
                  purchasedAt (timestamp)
```

### If sponsors enabled:
```
sponsors — id, name, level (text), logoUrl, websiteUrl, eventType (matches event slug)

sponsorCandidates — id, companyName, tier, contactEmail, logoUrl, websiteUrl,
                    eventType, paymentStatus, approved (text: pending/approved/rejected), createdAt
```

### If vendor registration enabled:
```
vendorRegistrations — id, eventSlug, businessName, contactName, email, phone,
                      boothType, paymentStatus, squareOrderId, createdAt
```

### If newsletter enabled:
```
newsletterSubscribers — id, email (unique), subscribedAt, active (bool)
```

### If business directory enabled:
```
businesses — id, name, description, address, phone, website, category, imageUrl
```

### If photo gallery enabled:
```
galleryPhotos — id, url, caption, eventSlug, sortOrder, createdAt

photoAlbums — id, title, description, coverPhotoUrl, eventSlug, createdAt
```

### CRITICAL DATA MODEL RULES:
1. Money is ALWAYS stored as integer cents. $15.00 = 1500. Never floats.
2. Dates stored as human-readable text ("Saturday, October 18, 2026"). Parse when sorting.
3. Slugs are the universal key linking events to sponsors, vendors, tickets, galleries.
4. Feature flags on the event model control what renders. One component, many configurations.
5. siteContent key-value store for ALL text. Admin changes text without touching code.
6. Status fields use text, not booleans. "pending"/"completed"/"cancelled" is more extensible than true/false.

---

## PHASE 4: PAYMENT FLOW (CRITICAL — DO NOT SIMPLIFY)

This is where most AI-generated sites fail. Follow this EXACTLY.

### Checkout Initiation

```
POST /api/events/:slug/ticket-checkout
Body: { buyerName, buyerEmail, quantity }

Server does:
1. Validate with Zod schema
2. Fetch event by slug — verify isTicketed === true
3. Compute totalAmount = parseInt(ticketPrice) * quantity * 100 (CENTS, SERVER-SIDE)
   NEVER accept a total from the frontend. NEVER.
4. If ticketCapacity set: sold = getTicketsSoldForEvent(eventId)
   If sold + quantity > capacity: return 400 "Sold out"
5. Generate confirmationNumber: PREFIX-XXXXXX (6 random alphanumeric chars)
6. Insert PENDING purchase record (status = "pending")
7. Call payment provider to create checkout link:
   - reference_id = String(purchase.id)  ← THIS IS HOW YOU MATCH IT LATER
   - redirect_url = https://yourdomain.com/payment-success?purchaseId={purchase.id}
8. Save the provider's order ID on the purchase record
9. Return { checkoutUrl }
10. If provider API fails: DELETE the orphaned pending record
```

### Webhook Handler

```
POST /api/square/webhook (or /api/stripe/webhook)

1. Verify signature (HMAC-SHA256). Reject invalid signatures.
2. ONLY process: payment.completed, payment.updated, order.fulfillment.updated
   IGNORE all other event types.
3. Extract reference_id from payload (check multiple locations — providers are inconsistent)
4. Fallback: match by order ID if no reference_id
5. Find matching purchase in database
6. CALL PROVIDER API to verify order is actually COMPLETED
   Set 8-second timeout. Never trust the webhook payload alone.
7. If verified: update status to "completed"
8. Send confirmation email
9. Sync to dashboard if configured
10. Return 200 OK fast (webhooks time out at 10-30 seconds)
```

### Background Reconciler

```
Every 5 minutes:
1. Find purchases: status=pending AND createdAt > 10 minutes ago AND has order ID
2. For each: call provider API to check order status
3. If COMPLETED: complete the purchase, send email
4. This catches: missed webhooks, server restarts during payment, network issues
```

THREE LAYERS: Webhook → Order lookup fallback → Background reconciler.
This is non-negotiable. Single-layer webhook processing loses 2-5% of sales silently.

### Payment Success Page

```
User lands at /payment-success?purchaseId=123
1. Poll GET /api/ticket-purchases/123/status every 2 seconds
2. Show "Processing your payment..." with spinner
3. When status = "completed": show confirmation number, event details
4. Tell user: "Check your email (including spam/junk folder)"
5. After 60 seconds of polling with no completion: show "Contact us" fallback
```

---

## PHASE 5: BOT PROTECTION (ALWAYS INCLUDE)

Every public form needs both:

### Honeypot
Add a hidden field named something innocent like `website` or `company`:
```html
<input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off" />
```
Server: if `req.body.website` has any value → silently accept but don't process. Return success so bot thinks it worked.

### Timing
Stamp form render time. Server: if submission arrives in under 3 seconds → silently discard.

Don't use CAPTCHAs unless spam becomes a real problem. They hurt real users.

---

## PHASE 6: EMAIL

### Ticket Confirmation Email

```
Subject: Your [Event Name] Tickets - Confirmation #[CONF-NUMBER]

HTML body:
- Organization logo (if available)
- "Ticket Confirmation" header
- Confirmation number (large, prominent, easily findable)
- Event: [name]
- Date: [date]
- Time: [time]
- Location: [location]
- Quantity: [X] tickets
- Total Paid: $[amount formatted from cents]
- "Show this email at check-in"
- Organization contact info in footer
```

Send ONLY after verifying payment with the provider's API. Never on webhook receipt alone.

---

## PHASE 7: ADMIN PANEL

Simple, functional, not fancy. Behind username/password auth with 30-minute session timeout.

### Required admin capabilities:
1. Create/edit events (all fields including feature flags)
2. View ticket purchases per event (table with name, email, quantity, amount, status)
3. Approve/reject sponsor candidates → auto-create sponsor record on approval
4. Edit site content (key-value text editor — list all keys, edit values inline)
5. Upload images (gallery photos, event images, sponsor logos)
6. View contact form submissions
7. Toggle registration open/close per event

---

## PHASE 8: MANAGEMENT API FOR AI AGENT

These endpoints let the AI agent manage the site through natural language commands after it's built.

```
// Event Management
POST   /api/management/events                     → Create event from structured data
PATCH  /api/management/events/:slug               → Update any event fields
DELETE /api/management/events/:slug               → Remove event

// Ticket Management
GET    /api/management/events/:slug/sales          → { sold, capacity, remaining, revenue }
POST   /api/management/events/:slug/refund/:id     → Refund a ticket purchase

// Feature Toggles
PATCH  /api/management/events/:slug/features       → { isTicketed, hasRegistration, hasSponsorSection, ... }

// Sponsor Management
GET    /api/management/sponsors/pending             → List pending sponsor candidates
POST   /api/management/sponsors/:id/decide          → { decision: "approved" | "rejected" }

// Content Management
PUT    /api/management/content/:key                 → Update any site text
GET    /api/management/content                      → Get all site content

// Analytics
GET    /api/management/analytics/overview           → Total events, tickets sold, revenue, subscribers
```

### Natural Language → API Mapping Examples:

```
"Add a fall festival on October 18th with $25 tickets and 150 capacity"
→ POST /api/management/events {
    title: "Fall Festival",
    slug: "fall-festival",
    date: "Saturday, October 18, 2026",
    isTicketed: true,
    ticketPrice: "25",
    ticketCapacity: 150,
    category: "Festival"
  }

"Turn off vendor registration for the car cruise"
→ PATCH /api/management/events/car-cruise/features { registrationClosed: true }

"How many tickets have we sold for the dinner?"
→ GET /api/management/events/meet-your-neighbor-dinner/sales
→ Response: "42 of 100 sold. 58 remaining. $630 revenue."

"Approve S&T Bank as a gold sponsor"
→ POST /api/management/sponsors/15/decide { decision: "approved" }

"Change the homepage tagline to Welcome to Downtown Irwin"
→ PUT /api/management/content/home_tagline { value: "Welcome to Downtown Irwin" }
```

---

## PHASE 9: SITE CONTENT SEEDING

When first building the site, seed the siteContent table with these keys (adjust values based on questionnaire answers):

```
home_tagline          → "Discover Downtown [City], [State]"
home_subtitle         → "[Org name] presents community events year-round"
about_description     → [from questionnaire answer #3, expanded]
about_mission         → [infer from org type]
social_facebook       → [from questionnaire]
social_instagram      → [from questionnaire]
contact_email         → [from questionnaire]
contact_phone         → [from questionnaire]
contact_address       → [from questionnaire]
footer_copyright      → "© 2026 [Org Name]. All rights reserved."
newsletter_cta        → "Stay updated on upcoming events"
```

Every piece of text on the site reads from this store. Admin changes text through the panel. Agent changes text through the management API. Nobody touches code to update copy.

---

## PHASE 10: WHAT "DONE" LOOKS LIKE

A completed site must have ALL of the following before presenting to the user:

1. All pages load without errors on mobile and desktop
2. Navigation works — every link goes to the right place
3. Events display in date order (soonest first, dateless at end)
4. If ticketing enabled: full purchase flow works end-to-end (form → payment → confirmation email)
5. If sponsors enabled: logos display grouped by tier with correct size hierarchy
6. Contact form submits and stores messages
7. Newsletter signup works
8. Bot protection active on all public forms
9. Admin panel accessible and functional
10. All text comes from siteContent store, not hardcoded
11. Meta tags set (title, description, Open Graph)
12. Mobile menu scrolls when event list is long
13. Images constrained with object-cover (no stretching/distortion)
14. Loading skeletons show while data fetches
15. 404 page exists for bad URLs

---

## COMMON MISTAKES — DO NOT MAKE THESE

1. Generating separate HTML files per event. It's a SPA. One component, data from API.
2. Storing prices as strings or floats. Integer cents only.
3. Trusting webhook payloads without verifying with the payment provider API.
4. Creating purchase records after payment instead of before (pending → completed).
5. Hardcoding event-specific logic instead of using feature flags.
6. Collecting card numbers instead of redirecting to provider's hosted checkout.
7. Putting business logic in API routes instead of storage/helper layer.
8. Not building a background reconciler for missed webhooks.
9. Hardcoding site text instead of using key-value content store.
10. Using external upload URLs (JotForm, etc.) as permanent image hosting. They expire.
11. Making text paragraphs full-width. Always constrain to max-w-2xl.
12. Not adding object-cover to user-uploaded images. They WILL be wrong sizes.
13. Not adding overflow-y-auto to mobile menus. Long event lists WILL get cut off.
14. Using more than 3 grid columns for content cards.
15. Making all buttons the same visual weight. Hierarchy is mandatory.
16. Using low-contrast text (gray on light gray). Audience includes older people on phones in sunlight.
17. Not sorting events by date everywhere they appear (listings, nav dropdowns, homepage).
18. Asking users design questions they can't answer. Infer from org type. Ask for corrections, not decisions.
