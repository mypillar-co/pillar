# Pillar — Your Organization, on Autopilot

## Owner Action Items

These are tasks that require manual action by you (not code changes):

- [ ] **Register a DMCA agent with copyright.gov** — Required for DMCA safe harbor protection under 17 U.S.C. § 512. Go to https://www.copyright.gov/dmca-directory/, register "Pillar" as the service provider, and pay the $6/year fee. Once done, update the placeholder in `artifacts/steward/src/pages/Terms.tsx` (search for `[Company Address — register at copyright.gov]`) with your registered agent name and address.

## Overview
Pillar is an AI-powered SaaS platform designed to autonomously manage websites, event dashboards, and social media for civic organizations, nonprofits, clubs, and community groups. It provides a "Wix meets Eventbrite" experience, putting organizational management on autopilot. The platform offers tiered subscriptions ranging from basic AI website generation to fully autonomous management across websites, events, and social media.

## User Preferences
I want to prioritize concise and clear communication. For development, I prefer an iterative approach. Before making any significant architectural changes or adding new external dependencies, please ask for my approval. Ensure that all API routes are well-documented and consistent.

## System Architecture

### Monorepo Structure
The project is organized as a monorepo containing several distinct packages:
- `artifacts/steward/`: React + Vite frontend application.
- `artifacts/api-server/`: Express API server.
- `lib/api-spec/`: OpenAPI specification as the single source of truth for API contracts.
- `lib/api-client-react/`: Generated React hooks for API interaction.
- `lib/api-zod/`: Generated Zod schemas for API validation.
- `lib/db/`: Drizzle ORM schema and PostgreSQL client.
- `lib/site/`: Site Engine package — deterministic site-building pipeline with 8 adapters, block renderer, page planner, site compiler (CSP), import service, auto-update service, version service, job queue, and feature flag system.
- `lib/replit-auth-web/`: Client library for Replit Authentication.
- `scripts/`: One-off utility scripts.

### Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS 4, Shadcn/ui, TanStack Query, Framer Motion, Sonner.
- **Backend**: Express, TypeScript, Drizzle ORM, PostgreSQL.
- **Authentication**: Replit Auth (OIDC/PKCE).
- **Payments**: Stripe (via Replit Connectors, ensuring no manual API keys).
- **Stripe Sync**: `stripe-replit-sync` for PostgreSQL integration of Stripe events.
- **Code Generation**: Orval for API client and schema generation.

### UI/UX Decisions
- **Color Scheme**: Dark navy background (`#0a0f1e`) with a gold/amber accent (`hsl(43, 96%, 56%)`) for CTAs.
- **Aesthetic**: Civic organization feel — trustworthy, professional, and modern.
- **Navigation**: Sidebar navigation, collapsible on desktop, overlay on mobile.
- **Tagline**: "Your organization, on autopilot."
- **Target Audience**: Civic organizations, nonprofits, community clubs, local chapters.

### Subscription Tiers
| Tier ID | Name | Monthly | Annual | Key Features |
|---------|------|---------|--------|-------------|
| tier1 | Starter | $29 | $24/mo | AI website, chat updates, subdomain hosting |
| tier1a | Autopilot | $59 | $49/mo | + autonomous updates, social media, free domain |
| tier2 | Events | $99 | $84/mo | + event management, ticketing, attendee comms |
| tier3 | Total Operations | $149 | $124/mo | + fully autonomous events, AI social content |

### Core Features
- **AI Site Builder (v1)**: Chat-based interview (8 questions) using AI models to generate and update organizational websites. Includes event data injection, logo upload, Google Fonts typography, Unsplash photography, scroll animations, parallax effects, and responsive hamburger navigation. Sites are Squarespace-quality with CSS custom properties architecture.
  - **Setup Wizard** (Wix ADI-style): Before the interview, users choose a style preset (Classic/Modern/Warm/Minimal), a color theme (6 options with color swatches), and which sections to include (10 sections: hero, about, mission, events, leadership, gallery, contact, news, donate, sponsors). Selections are injected as context before the AI interview starts.
  - **Website Import (v1)**: Users can paste an existing website URL; Pillar fetches it server-side, strips HTML, and uses GPT-4o-mini to extract 10 content fields (name, mission, services, location, schedule, events, contact, audience, style, extra). Extracted data is shown in a review card, and on confirmation all fields are injected as synthetic interview Q&A pairs — skipping the interview entirely and enabling immediate site generation.
- **Site Engine (v2)** — `/api/site-engine/`: Structured, deterministic website operating system with 7 architectural layers:
  - Schema layer: `site_pages` + `site_blocks` + `site_themes` + `site_nav_items` + 12 new tables (site_versions, site_modules, site_import_runs, site_import_findings, site_render_cache, site_block_bindings, site_data_sources, job_queue, org_activity_stream, org_plan, org_feature_flags, org_usage_limits)
  - Org isolation: every query carries `WHERE org_id = ?`; soft-delete pattern with `deleted_at IS NULL`
  - Deterministic engine: `eventBehaviorService` → `siteProfileService` → `pagePlanner` (6 strategies) → `blockRenderer` → `siteCompiler` (with CSP headers)
  - 8 adapter services: organization, event, sponsor, vendor, contact, announcement, social, payment
  - Job queue service (`job_queue` table), versioned publish history (`site_versions`), block-level render cache (`site_render_cache`)
  - Import pipeline: `siteImportService` scrapes existing sites → `siteImportFindings` for structured review
  - AI touches only structured `contentJson` payloads; identity blocks locked against AI modification
- **Guided Tour**: First-time dashboard visitors see a 5-step guided tour highlighting key features (Overview, Site Builder, Events, Social, Payments). Uses localStorage to track completion.
- **Event Dashboard**: Management of events, vendors, sponsors, contacts, and payments.
- **Payment Collection (Stripe Connect)**: Organizations connect their bank accounts via Stripe Express to collect ticket sales, vendor fees, and sponsorship payments. Pillar takes 2.9% + $0.30 per transaction. Public ticket purchase pages at `/events/:slug/tickets` with Stripe Checkout. Atomic inventory reservation prevents overselling. Webhook handles `checkout.session.completed`, `checkout.session.expired` (releases inventory), and `charge.refunded` (marks refunds). Tax liability notice and nonprofit support built into Payments page.
- **Social Media Automation**: Scheduling and publishing posts to platforms like Facebook, Instagram, and X.
- **Custom Domain Management**: Support for purchasing domains via Porkbun, external domains, DNS/SSL checks, and auto-renewal.
- **Dashboard Getting Started Checklist**: New user onboarding shows progress through plan selection, website building, event creation, and social media connection.
- **Tier Gating**: Features are gated based on subscription tiers, with frontend prompts for upgrades using plan names (Starter, Autopilot, Events, Total Operations).

### AI Model Strategy
- **Chat & Spec Extraction**: `gpt-5-mini` for reasoning, structured JSON, and short replies.
- **HTML Generation**: `gpt-4o-mini` for direct HTML output due to its efficiency with token usage for large outputs. Enhanced prompt includes detailed design standards (typography hierarchy, whitespace, shadows, gradients, mobile responsiveness).

### Security & Reliability
- **CORS**: Restricted to specific Replit and Pillar domains.
- **Session Cookies**: `httpOnly`, `secure`, `sameSite: "lax"` for CSRF protection.
- **Error Handling**: Express 5 async error handling and global error middleware.
- **Slug Uniqueness**: Database constraint ensures unique organization slugs.
- **Webhook Safety**: Errors fail closed (re-thrown for Stripe retry). Idempotent payment processing. Atomic inventory reservation with rollback on failure.

## Site Building Standards (Lessons from Norwin Rotary Review)

These rules apply to every org site Pillar generates. Violations destroy credibility.

### Content Rules
- **No AI filler text.** If real content isn't available for a section (programs, descriptions), omit the section or show a name/icon only. "Our X program brings community members together for meaningful impact" is worse than nothing.
- **Recurring events show once.** A weekly Tuesday lunch is ONE card ("Tuesdays 12–1pm at X location"), not 52 cards. Only one-time events get individual cards sorted by date.
- **No content duplication.** Address, meeting time, contact info — each appears exactly once on the page.
- **"Scroll to explore" is an anti-pattern.** Remove it. People know how to scroll.

### Design Rules
- **Always check for known brand colors first.** Rotary International = blue #003DA5 + gold #F7A81B. Lions Club = purple + gold. VFW = red/white/blue. Elks = purple/gold. **PA Masonic lodges = Midnight #12233e + Cornflower #5b7db1 + Parchment background #f7e8e0** (from the Grand Lodge of Pennsylvania official style guide — see full spec in the Masonic Lodge Sites section below). If the org is part of a national/international organization, use those colors — they're immediately recognizable to members.
- **Hero must never be empty.** Use a real event photo (dark overlay + white text) or solid brand color as background. Never text on white with no color/image.
- **Programs/features need real descriptions.** Ask for one real sentence about each program. If not provided, show icon + name only.
- **object-cover on all images, always.** User photos are random sizes. Never show distorted images.
- **Max-w-2xl on all body text paragraphs.** Lines longer than ~70 chars are hard to read.

### Event Page Rules (per guide)
- **Event detail section order:** Hero → About → Buy Tickets → Sponsors → Vendor Registration → Contact/Questions
- **Ticket CTA is visible on event cards.** Show price + "Buy Tickets" button on the card itself, not just "Learn More."
- **Ticket purchase form is front and center** on the event detail page — name, email, quantity, buy button — not buried below fold.
- **Event card images:** object-cover, h-48, never distorted.

### What "Done" Means
All pages load without error. Events sorted by date everywhere. Ticket flow works end-to-end. No hardcoded placeholder text. Contact section has no duplicated content. Mobile menu scrolls if event list is long. One dominant CTA per section.

## Masonic Lodge Sites (Grand Lodge of Pennsylvania)

When an organization is a Masonic lodge (any lodge subordinate to the Grand Lodge of Pennsylvania), these specifications are **mandatory** — not suggestions.

### Color Scheme (PA Grand Lodge Official Style Guide)
| Role | Token | Hex |
|------|-------|-----|
| Primary | Midnight | `#12233e` |
| Accent | Cornflower | `#5b7db1` |
| Background | Parchment | `#f7e8e0` |
| Secondary | — | `#ded5cd` |

Never substitute generic navy/gold on Masonic lodge sites. These are the official colors and members recognize them immediately.

### Typography
- **Headings**: Lora (serif) — traditional, lodge-appropriate
- **Body**: Montserrat (sans-serif) — clean readability

### Page Structure
**Public pages** (accessible to anyone):
- Home, About, Officers, Past Masters, Community, Events, Hall Rental, Calendar, Contact, FAQs, Becoming a Mason, Widows & Helpers

**Members-only pages** (behind authentication):
- Dashboard (personalized greeting: "Bro. [Name], PM" if Past Master), Announcements, Events (with JotForm registration links), Members Calendar, Monthly Notices archive, Dues Info, Profile/Account

**Admin panel** (lodge secretary / WM only):
- Manage Users (whitelist, toggle admin), Announcements, Events, Master's Messages, Monthly Notices, Documents, Officers

### Event Registration
- Use **JotForm iframe embeds** for registration forms — not custom-built forms
- Time-gated: before open → countdown; during window → JotForm; after close → closed message
- REGISTRATION_OPEN and REGISTRATION_CLOSE dates on each event

### Calendar
- **Google Calendar API**: two separate calendars — public (community events) + members-only (degree work, practices)
- Events fetched server-side, cached, served to frontend

### Authentication
- Session-based with email 2FA (6-digit code, 10-minute expiry)
- **Whitelist-based registration**: only pre-approved emails can sign up
- Codes stored in `verification_codes` table with auto-cleanup
- Dev-only bypass for test admin account

### Content Philosophy
- Database-driven content: Master's Messages, Announcements, Member events, Monthly notices, Officers, Documents
- Hardcoded content: page layouts, stable event details, FAQs, About/history text
- Admin (secretary or WM) can update the database-driven content without developer help

### Masonic Design Rules
- Address members as "Bro. [Name]" — not "Mr." or first name only
- Past Masters get "PM" suffix in greetings and officer lists
- Widows & Helpers section is always on public pages — this is a core Masonic obligation
- "Becoming a Mason" page is mandatory for any lodge site (it's a primary public-facing purpose)
- Hall rental is almost always a lodge revenue stream — include if lodge owns their building
- The lodge number is part of the identity (e.g., "Lodge #601") — display it prominently

## Community Framework API

Pillar uses a two-endpoint system from `discoverirwin.com` for site building. Both endpoints require the same auth header:
```
X-Pillar-Key: pillar_ro_a3a97fea1c8f5f3750e7f650df3de1b0cc6177ffb471398a
```

| Endpoint | Purpose |
|----------|---------|
| `GET https://discoverirwin.com/api/pillar/architecture` | Design specs, visual rules, validation checklists. Long-lived reference. |
| `GET https://discoverirwin.com/api/pillar/framework` | 9 working code files (~96KB). Fetched at generation time, cached 1h. |

### Framework File Reading Order
1. `BUILDER-INSTRUCTIONS.md` — Master playbook. Explains the entire system.
2. `INTAKE-QUESTIONS.ts` — 23 intake questions + org-type color palettes (`ORG_TYPE_COLOR_PALETTES`)
3. `org-config.ts` — `OrgConfig` interface + filled Irwin example (use as template)
4. `schema.ts` — Drizzle ORM schema. Payment-provider agnostic (`paymentOrderId`).
5. `storage-interface.ts` — Every CRUD method.
6. `api-routes-pattern.ts` — All Express routes (public + auth + admin).
7. `registration-window-engine.ts` — 90-day open / 7-day close window logic. Copy as-is.
8. `frontend-patterns.tsx` — Every UI component (Hero, EventCard, TicketPurchase, Nav, Footer…)
9. `theme-variables.css` — CSS color system with org-type palettes. Replace primary/accent.

### How Site Generation Uses the Framework
- **On every `/generate` call**: `fetchFramework()` is called (1h in-memory cache). If successful:
  - `ORG_TYPE_COLOR_PALETTES` from `INTAKE-QUESTIONS.ts` are parsed and injected into the AI color selection prompt as a fallback palette lookup when no exact brand match exists.
  - Page structure summary from `BUILDER-INSTRUCTIONS.md` is injected into the system prompt.
- **Color overrides** (deterministic, post-AI): `getOrgTypeColors()` in `routes/sites.ts` hard-overrides AI color choices for known org types. This always wins.
- **Framework fetch failure is non-blocking**: If the endpoint is down, generation continues with built-in rules.

### Critical Rule
**The AI fills in CONFIG VARIABLES ONLY. It does NOT redesign pages or invent layouts.** Every page structure, component, and route pattern is already defined in `frontend-patterns.tsx`. Pillar's job is to fill in the blanks from the interview answers.

### Intake Questions (23 total — used in chat interview)
Key fields mapped to `OrgConfig`:
- `name`, `shortName`, `tagline`, `address`, `mailingAddress`, `phone`, `email`, `eventsEmail`
- `social.facebook`, `social.instagram`
- `branding.logoInitials` (2-3 letter badge)
- `org_type` → determines `ORG_TYPE_COLOR_PALETTES` lookup
- `stats.annualEvents`, `stats.annualAttendees`, `stats.localBusinesses`
- `has_sponsors`, `has_vendors`, `has_ticketed_events`
- `paymentProvider` (Square or Stripe)
- `has_newsletter`
- `partners[]` (name + description)
- `eventCategories[]`

## External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Stripe**: Payment processing for subscriptions, Stripe Connect for org payments. Integrated via Replit Connectors for secure API key management.
- **Replit Auth**: Authentication service for user login and management.
- **OpenAI**: AI models (`gpt-5-mini`, `gpt-4o-mini`) used for site generation, interviews, event descriptions, and content strategy.
- **Porkbun**: Domain registrar API for domain availability checks, registration, and management.
- **Cloudflare**: DNS proxy for `mypillar.co`. Provides wildcard SSL (`*.mypillar.co`) on the free plan. DNS records: `A @ → 34.111.179.208` (Replit deployment IP, proxied), `CNAME www → mypillar.co` (proxied), `CNAME * → mypillar.co` (proxied — enables all org subdomains). Nameservers must be changed from Porkbun's defaults to Cloudflare's assigned nameservers. `PILLAR_PROXY_IP=34.111.179.208` is the Replit deployment IP used for customer domain verification.
