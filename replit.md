# Steward — Your Organization, on Autopilot

An AI-powered SaaS platform (Wix meets Eventbrite) that autonomously manages websites, event dashboards, and social media for small businesses, Masonic lodges, and local organizations.

## Architecture

### Monorepo Structure
- `artifacts/steward/` — React + Vite frontend (main app, previewPath: `/`)
- `artifacts/api-server/` — Express API server (previewPath: `/api`)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
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
- `stripe.*` — Synced Stripe data (products, prices, customers, subscriptions, etc.)

### DB Commands
```bash
pnpm --filter @workspace/db run push   # Push schema changes
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
- `GET /api/health` — Health check
- `GET /api/auth/user` — Current user info
- `POST /api/auth/logout` — Sign out
- `GET /api/tiers` — Public list of subscription tiers
- `POST /api/billing/checkout` — Create Stripe Checkout session
- `POST /api/billing/portal` — Create Stripe Customer Portal session
- `GET /api/billing/subscription` — Current user's subscription status
- `GET /api/organizations` — Get current user's organization
- `POST /api/organizations` — Create or update organization
- `POST /api/stripe/webhook` — Stripe webhook endpoint (registered BEFORE express.json())

## Design
- Dark navy background (`#0a0f1e` / `hsl(224, 50%, 6%)`)
- Gold/amber accent color for CTAs and highlights
- Civic organization feel: trustworthy, professional, formal
- Tagline: "Your organization, on autopilot."
- Target audience: Masonic lodges, civic organizations, social clubs, local businesses

## Important Notes

### Stripe
- NEVER cache the Stripe client. Always call `getUncachableStripeClient()`
- Stripe webhook MUST be registered BEFORE `express.json()` in `app.ts`
- `stripe-replit-sync` syncs Stripe events to the `stripe.*` PostgreSQL schema
- The `stripe.*` schema was initialized by running migration SQL files from `stripe-replit-sync`
- In development, `findOrCreateManagedWebhook()` may fail (webhook URL needs production domain)
- Stripe products were seeded via `pnpm --filter @workspace/scripts run seed-products`

### Auth
- Replit Auth uses OIDC/PKCE — do NOT use "Replit" or "Replit Auth" in UI text
- Auth routes: `GET /api/login`, `GET /api/logout`, `GET /api/auth/user`
- Auth middleware attaches `req.user` to all routes
- Use `req.isAuthenticated()` to check auth status in routes

### Frontend
- `@workspace/replit-auth-web` exports: `useAuth`, `AuthUser`, `AuthProvider`, `LoginButton`, `LogoutButton`
- All API calls use `credentials: 'include'`
- Use `/api/` prefix for all API routes (Vite proxies to API server)

## Project Tasks (Remaining)
1. ✅ Task #1 — Platform Foundation (auth, billing, organizations, DB, Stripe, frontend shell)
2. Task #2 — AI Website Builder (AI generates website content via chat)
3. Task #3 — Event Dashboard (create/manage events, ticket sales, approvals)
4. Task #4 — Social Media Automation (Facebook, Instagram, X posting)
5. Task #5 — Custom Domain Purchasing & Hosting (domain registrar integration)
