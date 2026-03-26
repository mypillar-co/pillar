# Steward — Your Organization, on Autopilot

An AI-powered SaaS platform (Wix meets Eventbrite) that autonomously manages websites, event dashboards, and social media for small businesses, Masonic lodges, and local organizations.

## Architecture

### Monorepo Structure
- `artifacts/steward/` — React + Vite frontend (main app, previewPath: `/`)
- `artifacts/api-server/` — Express API server (previewPath: `/api`)
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
- `public.domains` — Custom domains (Porkbun integration, status, registrarRef)
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

## Project Tasks (Remaining)
1. ✅ Task #1 — Platform Foundation (auth, billing, organizations, DB, Stripe, frontend shell)
2. ✅ Task #2 — AI Site Builder + Event Dashboard (events, vendors, sponsors, contacts, payments, AI chat, sidebar layout)
3. Task #3 — Social Media Automation (Facebook, Instagram, X posting)
4. Task #4 — Custom Domain Purchasing & Hosting (domain registrar integration)
5. Task #5 — Public site renderer (block-based, hero/text/events_list/sponsors_grid/contact_form)
