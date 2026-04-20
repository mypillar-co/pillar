# Pillar — Your Organization, on Autopilot

## Overview
Pillar is an AI-powered SaaS platform designed to autonomously manage websites, event dashboards, and social media for civic organizations, nonprofits, clubs, and community groups. It provides a "Wix meets Eventbrite" experience, putting organizational management on autopilot. The platform offers tiered subscriptions ranging from basic AI website generation to fully autonomous management across websites, events, and social media.

## User Preferences
I want to prioritize concise and clear communication. For development, I prefer an iterative approach. Before making any significant architectural changes or adding new external dependencies, please ask for my approval. Ensure that all API routes are well-documented and consistent.

## System Architecture

### Monorepo Structure
The project is organized as a monorepo containing several distinct packages:
- `artifacts/steward/`: React + Vite frontend application (Pillar admin dashboard).
- `artifacts/api-server/`: Express API server (port 8080).
- `artifacts/community-platform/`: Multi-tenant community site platform. Serves `*.mypillar.co` subdomains (port 5001). Contains full Express+Vite stack with per-tenant isolation.
- `artifacts/norwin-rotary/`: Universal React+Vite org site template.
- `lib/api-spec/`: OpenAPI specification.
- `lib/db/`: Drizzle ORM schema and PostgreSQL client.
- `lib/site/`: Site Engine package for deterministic site-building.

### Community Platform (`artifacts/community-platform/`)
Multi-tenant Express + React/Vite app that serves as the actual community site engine for `*.mypillar.co` subdomains. Key details:
- **Port**: 5001. Cloudflare wildcard DNS routes `*.mypillar.co` → Replit.
- **Multi-tenancy**: `Host` header (or `x-forwarded-host`) is parsed to extract the subdomain slug as `orgId`. All DB tables are prefixed `cs_*` and scoped by `org_id`.
- **Setup**: `POST /api/pillar/setup` provisions an org. Requires `x-pillar-service-key` header matching `PILLAR_SERVICE_KEY` env var, or falling back to `community_site_key` in the `organizations` table. Accepts `orgId` in body or extracted from host/`x-org-id` header.
- **Admin**: `/admin/login` → `/admin` (email/password auth, bcrypt hashed).
- **DB driver**: `drizzle-orm/neon-serverless` with WebSocket support (`ws` package).
- **Pages**: Home, Events, Event Detail, About, Contact, Gallery, Blog, Admin Login, Admin Dashboard, Payment Success.
- **Admin sections**: Events, Sponsors, Business Directory, Blog/News, Contact Messages, Newsletter Subscribers.

### React Template Architecture (Org Sites)
Organizations with `site_config` are served via a universal React template. This involves API routes for public data, dynamic org slug detection, an `OrgConfigContext` for global configuration, and production serving of static React SPA files.

### Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS 4, Shadcn/ui, TanStack Query, Framer Motion.
- **Backend**: Express, TypeScript, Drizzle ORM, PostgreSQL.
- **Authentication**: Replit Auth (OIDC/PKCE).
- **Payments**: Stripe (via Replit Connectors).
- **Code Generation**: Orval for API client and schema generation.

### UI/UX Decisions
- **Color Scheme**: Dark navy background (`#0a0f1e`) with a gold/amber accent (`hsl(43, 96%, 56%)`).
- **Aesthetic**: Civic organization feel — trustworthy, professional, and modern.
- **Navigation**: Sidebar navigation, collapsible on desktop, overlay on mobile.

### Core Features
- **AI Site Builder (v1)**: Chat-based interview using AI to generate and update organizational websites. Includes a setup wizard for style and section selection, and a website import feature to extract content from existing sites.
- **Site Engine (v2)**: A structured, deterministic website operating system with architectural layers for schema, org isolation, deterministic rendering, adapters, job queue, versioning, and import pipeline.
- **Guided Tour**: A 5-step guided tour for first-time dashboard visitors.
- **Event Dashboard**: Management for events, vendors, sponsors, contacts, and payments.
- **Payment Collection (Stripe Connect)**: Organizations connect bank accounts to collect payments, with Pillar taking a transaction fee.
- **Social Media Automation**: Scheduling and publishing posts to social platforms.
- **Custom Domain Management**: Support for domain purchasing, external domains, DNS/SSL checks, and auto-renewal.
- **Dashboard Getting Started Checklist**: Onboarding checklist for new users.
- **Tier Gating**: Features are restricted based on subscription tiers, with prompts for upgrades.
- **Members Portal (v1)**: Each org gets a private, login-gated members area at `/members` (on its `*.mypillar.co` site). When the first member is added, the api-server auto-provisions a starter portal config tailored to the org's vertical (fraternal lodges get notices + dues prominently; PTA/PTOs get committee sign-ups; Rotary/Kiwanis get committees + meeting schedule; etc.). Section types live in a registry (`artifacts/api-server/src/lib/sectionRegistry.ts`) tagged by surface (`public` vs `portal`). Storage: `organizations.site_config.membersPortal` mirrored to `cs_org_configs.features.membersPortal` via the existing pillar-sync PATCH path — no schema migration needed. Admins edit/reorder/AI-suggest sections from the **Members Portal** dashboard tab.
- **Autopilot Chat Agent**: Tool-using AI in `artifacts/api-server/src/routes/management.ts` that operates the dashboard via natural-language commands. System prompt has a leading "HOW TO HANDLE REQUESTS" framing block (synonym matching, disambiguation, honest refusal, destructive-action confirmation, plain-language reports, error transparency) followed by ~110 lines of operational rules. Tool surface (38 tools): events (list/create/update/delete + ticket sales), sponsors (list-pending/decide/add/update/remove), businesses (list/add/update/delete), albums & photos (list/create/update/delete + list_photos/delete_photo), site content (list/set + sections list/toggle), site config (get_site_config/update_site_config/add_site_section — read & write the canonical `organizations.site_config` JSONB: primaryColor, accentColor, tagline, mission, contactEmail, contactPhone, contactAddress, meetingDay, meetingTime, meetingLocation, socialFacebook, socialInstagram, footerText; add_site_section appends to `site_config.sections[]` and is gated by `validateSection(_, "public")` against `lib/sectionRegistry.ts`), newsletter (subscriber count + send), contact messages (list/mark-read), members (list/invite/update/remove + stats), analytics overview, and a self-test. Member invites reuse `sendInviteEmail`/`generateToken`/`inviteUrl` helpers exported from `routes/members.ts` for parity with the dashboard's invite flow. NOT yet implemented (would require new tables / new infra): announcements (no `announcements` table), `schedule_newsletter` (no scheduled-newsletter table), `reply_to_message` (needs outbound email-to-user delivery).

### AI Model Strategy
- **Chat & Spec Extraction**: `gpt-5-mini` for reasoning and structured JSON output.
- **HTML Generation**: `gpt-4o-mini` for direct HTML output, with enhanced prompts for design standards.

### Security & Reliability
- **CORS**: Restricted to specific Replit and Pillar domains.
- **Session Cookies**: `httpOnly`, `secure`, `sameSite: "lax"`.
- **Error Handling**: Express 5 async error handling and global error middleware.
- **Slug Uniqueness**: Database constraint for unique organization slugs.
- **Webhook Safety**: Errors fail closed, idempotent payment processing, atomic inventory reservation.

### React SPA Routing in Replit
Custom middleware in `vite.config.ts` is required for multi-page React SPAs to function correctly within Replit's proxy environment, ensuring proper `index.html` fallback.

### Site Building Standards
- **Content Rules**: Avoid AI filler, show recurring events concisely, no content duplication, remove "scroll to explore" prompts.
- **Design Rules**: Use known brand colors, ensure hero sections are never empty, provide real program descriptions, use `object-cover` for all images, and apply `max-w-2xl` to body text.
- **Event Page Rules**: Specific order for event details, visible ticket CTAs on cards, and prominent ticket purchase forms.
- **"Done" Definition**: All pages load, events are sorted, ticket flow works, no hardcoded placeholders, contact section is clean, mobile menu scrolls, and dominant CTAs are present.

### Masonic Lodge Sites (Grand Lodge of Pennsylvania)
Mandatory specifications for Masonic lodge sites:
- **Color Scheme**: Official PA Grand Lodge colors (`#12233e`, `#5b7db1`, `#f7e8e0`).
- **Typography**: Headings in Lora, body in Montserrat.
- **Page Structure**: Defined public and members-only pages, and an admin panel.
- **Event Registration**: Uses JotForm iframe embeds with time-gated access.
- **Calendar**: Integrates Google Calendar API for public and members-only events.
- **Authentication**: Session-based with email 2FA and whitelist-based registration.
- **Content Philosophy**: Database-driven content for dynamic elements, hardcoded for stable information.
- **Masonic Design Rules**: Specific address and suffix conventions for members, mandatory "Widows & Helpers" and "Becoming a Mason" pages, prominent lodge number display, and hall rental inclusion.

## External Dependencies

- **PostgreSQL**: Primary database.
- **Stripe**: Payment processing and Stripe Connect.
- **Replit Auth**: User authentication.
- **OpenAI**: AI models (`gpt-5-mini`, `gpt-4o-mini`) for site generation and content.
- **Porkbun**: Domain registrar API.
- **Cloudflare**: DNS proxy for `mypillar.co` domains, providing wildcard SSL.
- **Community Framework API (discoverirwin.com)**: Provides design specs, visual rules, validation checklists, and working code files (`/pillar/architecture` and `/pillar/framework`). This API informs `ORG_TYPE_COLOR_PALETTES` and page structure during site generation.