# Steward — Your Organization, on Autopilot

An AI-powered SaaS platform (Wix meets Eventbrite) that autonomously manages websites, event dashboards, and social media for small businesses, Masonic lodges, and local organizations.

## Architecture

### Monorepo Structure
- `artifacts/steward/` — React + Vite frontend (main app, previewPath: `/`, port: 18402)
  - Registered via `artifacts/steward/.replit-artifact/artifact.toml` with `previewPath = "/"`
  - This is the Replit artifact system — each artifact self-registers; `.replit` must NOT be edited
  - Confirmed live: `curl http://localhost:80/` returns the Steward HTML app
- `artifacts/api-server/` — Express API server (previewPath: `/api`, port: 8080)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for generated hooks)
- `lib/api-client-react/` — Generated React hooks (via Orval from OpenAPI)
- `lib/api-zod/` — Generated Zod schemas (via Orval from OpenAPI)
- `lib/db/` — Drizzle ORM schema + PostgreSQL client
- `lib/replit-auth-web/` — Replit Auth client library (useAuth, AuthProvider, LoginButton, LogoutButton)
- `scripts/` — One-off scripts (seed-products, etc.)

### Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS 4, Shadcn/ui components, TanStack Query, Framer Motion, Sonner (toasts)
- **Backend**: Express, TypeScript, Drizzle ORM, PostgreSQL
- **Auth**: Replit Auth (OIDC/PKCE) via `@replit/passport-replit-auth`
- **Payments**: Stripe via Replit Connectors (NO manual API keys; use `getUncachableStripeClient()`)
- **Stripe Sync**: `stripe-replit-sync` — syncs Stripe webhook events to `stripe.*` PostgreSQL schema
- **Codegen**: Orval (`pnpm --filter @workspace/api-spec run codegen`)

## Database

### Schemas
- `public.users` — Replit Auth user table
- `public.sessions` — Express session storage
- `public.organizations` — User organizations (orgs can have websites, events, social media)
- `public.subscriptions` — Subscription records (Stripe subscription lifecycle)
- `public.events` — Organization events (festivals, meetings, fundraisers, etc.)
- `public.contacts` — Contact database (vendors, sponsors, attendees, members)
- `public.vendors` — Vendors (food, merchandise, entertainment, service)
- `public.sponsors` — Sponsors (with tier, website, logo support)
- `public.event_vendors` — Junction: events ↔ vendors (booth, fee tracking)
- `public.event_sponsors` — Junction: events ↔ sponsors (tier, pledge tracking)
- `public.payments` — Payment records (vendor fees, ticket sales, sponsorships)
- `public.sites` — Organization public websites (generatedHtml, websiteSpec, orgSlug, status)
- `public.site_pages` — Pages within a site (home, about, events, etc.)
- `public.site_blocks` — Content blocks per page (hero, text, events_list, sponsors_grid, contact_form)
- `public.site_nav_items` — Navigation menu for a site
- `public.domains` — Custom domains (Porkbun/external registrar, dnsStatus, sslStatus, isExternal, registrar, stripeSessionId, renewalNotifiedAt, autoRenew boolean)
- `public.social_accounts` — Connected social media accounts (Facebook, Instagram, X) with access tokens
- `public.social_posts` — Social media posts (draft, scheduled, published, failed, cancelled)
- `public.automation_rules` — Recurring social posting rules (frequency, platforms, content type, AI prompt)
- `public.content_strategy` — Tier 3 autonomous content strategy (tone, frequency, topics, platforms)
- `stripe.*` — Synced Stripe data (products, prices, customers, subscriptions, etc.)

### DB Commands
```bash
pnpm --filter @workspace/db run push   # Push schema changes
pnpm --filter @workspace/db exec tsc -p tsconfig.json  # Rebuild DB type declarations
pnpm --filter @workspace/api-spec run codegen  # Regenerate API types/hooks
pnpm --filter @workspace/scripts run seed-products  # Seed Stripe products
```

## Subscription Tiers
| Tier | Price | Description |
|------|-------|-------------|
| Tier 1 | $29/mo | AI website + chat-based updates |
| Tier 1a | $59/mo | Hands-off website + social media automation (Most Popular) |
| Tier 2 | $99/mo | Website + event dashboard (ticket sales, approvals, comms) |
| Tier 3 | $149/mo | Fully autonomous: website + events + social |

## API Routes

### Auth & Billing (existing)
- `GET /api/health` — Health check
- `GET /api/auth/user` — Current user info
- `POST /api/auth/logout` — Sign out
- `GET /api/tiers` — Public list of subscription tiers
- `POST /api/billing/checkout` — Create Stripe Checkout session
- `POST /api/billing/portal` — Create Stripe Customer Portal session
- `GET /api/billing/subscription` — Current user's subscription status

### Organizations
- `GET /api/organizations` — Get current user's organization
- `POST /api/organizations` — Create or update organization
- `PUT /api/organizations` — Update organization name/type

### Dashboard Operations (new)
- `GET /api/stats` — Overview stats (active events, vendors, sponsors, contacts, revenue)
- `GET /api/events` — List events for org
- `GET /api/events/:id` — Get event detail
- `POST /api/events` — Create event
- `PUT /api/events/:id` — Update event
- `DELETE /api/events/:id` — Delete event
- `GET /api/vendors` — List vendors
- `POST /api/vendors` — Add vendor
- `GET /api/sponsors` — List sponsors
- `POST /api/sponsors` — Add sponsor
- `GET /api/contacts` — List contacts
- `POST /api/contacts` — Add contact
- `POST /api/sites/builder` — AI site builder chat (Anthropic claude-3-haiku)

## Frontend Pages (Steward)

### Public / Auth
- `/` — Landing page
- `/onboard` — Onboarding wizard (org name, type, billing)
- `/billing` — Billing management (Stripe portal)

### Dashboard (sidebar layout)
- `/dashboard` — Overview (stats, upcoming events, quick actions)
- `/dashboard/events` — Events list + search + create dialog
- `/dashboard/events/:id` — Event detail with inline editing
- `/dashboard/vendors` — Vendors list + add dialog
- `/dashboard/sponsors` — Sponsors list + add dialog
- `/dashboard/contacts` — Contacts list + add dialog
- `/dashboard/payments` — Payments overview (placeholder + Stripe integration CTA)
- `/dashboard/site` — AI Site Builder (chat interface)
- `/dashboard/domains` — Custom domain management (register via Porkbun, BYOD/external, DNS/SSL status, auto-renew)
- `/dashboard/social` — Social media automation (Facebook, X posting; Instagram gated)
- `/dashboard/settings` — Organization settings

## Design
- Dark navy background (`#0a0f1e` / `hsl(224, 50%, 6%)`)
- Gold/amber accent color (`hsl(43, 96%, 56%)`) for CTAs and highlights
- Civic organization feel: trustworthy, professional, formal
- Sidebar navigation with collapsible behavior on desktop, overlay on mobile
- Tagline: "Your organization, on autopilot."
- Target audience: Masonic lodges, civic organizations, social clubs, local businesses

## Important Notes

### Stripe
- NEVER cache the Stripe client. Always call `getUncachableStripeClient()`
- Stripe webhook MUST be registered BEFORE `express.json()` in `app.ts`
- `stripe-replit-sync` syncs Stripe events to the `stripe.*` PostgreSQL schema
- `findOrCreateManagedWebhook(url)` requires a URL argument; url is constructed from `process.env.REPLIT_DEV_DOMAIN` in `index.ts`
- Stripe products were seeded via `pnpm --filter @workspace/scripts run seed-products`

### Auth
- Replit Auth uses OIDC/PKCE — do NOT use "Replit" or "Replit Auth" in UI text
- Auth routes: `GET /api/login`, `GET /api/logout`, `GET /api/auth/user`
- Auth middleware attaches `req.user` to all routes
- Use `req.isAuthenticated()` to check auth status in routes
- `AuthUser` type has: `id`, `email`, `firstName`, `lastName`, `profileImageUrl`

### Frontend
- `@workspace/replit-auth-web` exports: `useAuth`, `AuthUser`, `AuthProvider`, `LoginButton`, `LogoutButton`
- `useGetOrganization()` returns `{ data: OrganizationResponse }` where `OrganizationResponse = { organization: Organization | null }`
- Access org as: `const { data: orgData } = useGetOrganization(); const org = orgData?.organization;`
- `Organization` has `type` (NOT `orgType`) and `category` fields
- New dashboard API calls use `src/lib/api.ts` (typed fetch wrapper) — NOT the generated hooks
- All API calls use `credentials: 'include'` and paths starting with `/api/` (no BASE_URL prefix)

### DB Schema Notes
- New tables (events, vendors, sponsors, contacts, etc.) use `varchar("id").primaryKey().default(sql\`gen_random_uuid()\`)`
- Date-only fields (startDate, endDate) stored as `varchar` for compatibility with CivicOps patterns
- Boolean fields use native PostgreSQL `boolean` type

## Security & Reliability Notes
- **CORS**: Restricted to Replit dev domains (`*.replit.dev`, `*.replit.app`) and `*.steward.app` via regex allowlist
- **Session cookies**: `httpOnly: true`, `secure: true`, `sameSite: "lax"` — prevents CSRF for mutating requests
- **Error handling**: Express 5 built-in async error handling + global 4-arg error middleware in `app.ts`
- **Slug uniqueness**: `organizations.slug` has `.unique()` DB constraint

## Auth Loading Race Conditions Fixed
- **Onboard.tsx**: Must check `authLoading` before redirecting (`!authLoading && !isAuthenticated`) — otherwise redirect fires before auth state resolves from the server
- **DashboardLayout.tsx**: Already checks `if (authLoading || orgLoading) return;` before any redirect

## Tier Gating
- Events: `tier2` or `tier3` required (403 otherwise). Frontend shows upgrade prompt for non-tier users
- Recurring events: `tier3` only
- AI site builder: `tier1+` (all tiers)
- Custom domain (free): `tier1a+`; `tier1` = $24/yr add-on via Stripe checkout

## AI Model Strategy
- **Chat & spec extraction** (`/api/sites/builder`, spec JSON): `gpt-5-mini` (reasoning model, great for structured JSON/short replies)
- **HTML generation** (site gen, change requests, scheduled updates): `gpt-4o-mini` (standard completion model, no reasoning overhead)
- **Why**: `gpt-5-mini` is a reasoning model that uses `max_completion_tokens` for internal thinking. With token budgets under ~16K it leaves 0 tokens for HTML output. `gpt-4o-mini` produces HTML directly with 0 reasoning overhead.
- `callOpenAI(messages, maxTokens, model)` — 3rd arg: `"gpt-5-mini"` (default, for short text) or `"gpt-4o-mini"` (for large HTML output)
- All HTML generation calls in `sites.ts` and `scheduler.ts` use `"gpt-4o-mini"`
- Site builder chat uses `max_completion_tokens` (reasoning model param); HTML gen uses `max_tokens` (standard model param)

## Site Builder — Key Behaviors & API

### Site Generation (`POST /api/sites/generate`)
- **Usage enforced**: calls `checkAndResetUsage` and increments `aiMessagesUsed` on success (like all other AI endpoints)
- **Events from DB**: fetches org's upcoming events (by `startDate >= today`) and injects them into the generation prompt — site always reflects real DB events
- **Logo upload**: client converts image to base64 with FileReader; sent as `logoDataUrl` in JSON body
- **Logo server validation** (`validateLogoDataUrl`): allowlist MIME (`image/png|jpeg|webp|gif`), rejects SVG, max 500KB, base64-only character check
- **Logo in HTML**: AI embeds it as `<img src="data:image/...">` in the nav bar and footer — zero external storage needed
- Response includes: `{ site, orgSlug, spec, used, limit, remaining }`

### Sync Events (`POST /api/sites/sync-events`)
- Requires Tier 1+ (`TIERS_ALLOWING_CHANGES`) and an existing generated site
- Fetches all org events (prefers future events, falls back to all), formats them with date/time/location
- Also fetches `websiteSpecsTable` for better context (org name, colors, mission)
- Sends **full site HTML** (no truncation) to AI — model context window handles it (128K tokens)
- AI returns complete updated HTML with events section updated/added
- Stored as `proposedHtml` — user reviews in preview and clicks "Apply Change" to publish
- Success response: `{ proposalReady: true, eventCount: N, used, limit, remaining }`

### Proposal Flow
1. Sync events (or change request) → writes `proposedHtml` to DB
2. Frontend fetches `/api/sites/my/proposal-preview` → gets `{ proposedHtml }`
3. Loads into iframe, shows amber "Previewing proposed change" bar
4. User clicks "Apply Change" → `POST /api/sites/change-request/apply` → `proposedHtml` copied to `generatedHtml`, cleared

### Logo Upload UX (SiteBuilder.tsx)
- ImagePlus button appears in chat input once interview starts (not before)
- File picker accepts `image/*`, max 2MB client-side check
- Logo preview strip shows thumbnail above chat input with × to remove
- `logoDataUrl` passed to `/generate`; cleared after generation

## Project Tasks (Completed)
1. ✅ Task #1 — Platform Foundation (auth, billing, organizations, DB, Stripe, frontend shell)
2. ✅ Task #2 — AI Site Builder + Event Dashboard (events, vendors, sponsors, contacts, payments, AI chat, sidebar layout)
3. ✅ Task #3 — Event Dashboard (recurring templates, approval queue, comms)
4. ✅ Task #4 — Social Media Automation (Facebook, X; Instagram gated by design)
5. ✅ Task #5 — Custom Domain Purchasing & Hosting (Porkbun registration, BYOD/external, DNS/SSL checks, auto-renewal)
6. ✅ Platform Audit — Security hardening, auth loading race condition fix, tier gate UX improvement
7. ✅ AI Fix — Site builder HTML generation switched from gpt-5-mini to gpt-4o-mini (reasoning model was consuming all tokens internally)
8. ✅ Site Builder v2 — Events from DB in generation, Sync Events button, logo upload; security hardening + usage enforcement

## Domain System (Task #5)
- `GET /api/domains` — list org's domains + subdomain + cnameTarget
- `POST /api/domains/check` — availability check via Porkbun API
- `POST /api/domains/checkout` — Stripe checkout for Tier 1 add-on ($24/yr)
- `POST /api/domains/confirm` — confirm Stripe payment + trigger Porkbun registration
- `POST /api/domains/claim` — free claim for Tier 1a+ users
- `POST /api/domains/external` — add externally-registered (BYOD) domain
- `POST /api/domains/:id/verify` — check DNS propagation (CNAME lookup)
- `PUT /api/domains/:id` — toggle auto-renew
- `DELETE /api/domains/:id` — remove non-active domain
- `GET /api/domains/registrar-status` — Porkbun connectivity check
- Scheduler: `checkAndRenewDomains()` runs every 6 hours — charges via Stripe Invoice for auto-renew, logs warning for non-auto-renew expiring domains
- Domain tiers: Tier 1 = $24/yr add-on, Tier 1a/2/3 = free included domain
- CNAME target: `proxy.steward.app`
- Porkbun secrets: `PORKBUN_API_KEY` + `PORKBUN_SECRET_KEY`
