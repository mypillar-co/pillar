# Pillar Platform — Complete Source Overview
**Generated:** April 7, 2026  
**State:** Production (all 11 sync phases implemented and verified)

---

## What Is Pillar?

Pillar is an AI-powered SaaS platform that helps civic organizations (PTAs, neighborhood associations, volunteer groups, etc.) get a professional community website live in minutes. A chat-style AI interview gathers all the information, then Pillar provisions a fully branded multi-tenant site at `{org-slug}.mypillar.co`.

After launch, changes made in the Pillar dashboard (events, branding, meeting info) sync live to the public site in real time.

---

## Repository Structure

```
/
├── artifacts/
│   ├── api-server/          # Node/Express API (Pillar dashboard backend)
│   │   └── src/
│   │       ├── routes/      # All HTTP route handlers
│   │       ├── lib/         # Shared helpers incl. sync pipeline
│   │       └── *.ts         # app.ts, index.ts, scheduler, mailer, etc.
│   ├── community-platform/  # Multi-tenant public community sites (port 5001)
│   │   ├── server/          # Express server + storage layer
│   │   └── client/          # React/Vite tenant-aware front-end
│   ├── steward/             # Admin/management UI (React/Vite)
│   └── mockup-sandbox/      # Design component preview server
├── lib/
│   ├── db/src/schema/       # Shared Drizzle ORM schema (Pillar/API-server DB)
│   ├── api-spec/            # OpenAPI spec (orval-generated)
│   ├── api-client-react/    # Auto-generated React query hooks
│   ├── api-zod/             # Zod validation types
│   └── site/                # Shared site utilities
└── pnpm-workspace.yaml
```

---

## Services

| Service | Port | Stack | Purpose |
|---------|------|-------|---------|
| API Server | `$PORT` (dynamic) | Express + Drizzle + Neon PG | Dashboard backend; runs AI interview; provisions and syncs tenants |
| Community Platform | `5001` | Express SSR + React/Vite | Serves all `*.mypillar.co` public sites from one shared process |
| Steward | `$PORT` | React/Vite | Internal admin UI |

---

## Key Domain Concepts

### Organizations (`organizationsTable`)
One per customer. Key columns:
- `id` — primary key
- `slug` — URL identifier, becomes the `{slug}.mypillar.co` subdomain
- `site_config` — JSONB payload built by the AI interview; source of truth for tenant provisioning
- `community_site_url` — set on first publish (**raw SQL only** — not in Drizzle schema)
- `community_site_key` — per-tenant admin key for community platform

### Sites (`sitesTable`)
Created at provision time. `status` = `'draft'` | `'published'`. The sync pipeline gates on `status = 'published'`.

### Events (`eventsTable`) — API Server DB
The organization's event calendar. Fields: `id`, `orgId`, `slug`, `name`, `description`, `startDate`, `startTime`, `location`, `eventType`, `isTicketed`, `ticketPrice`, `ticketCapacity`, `isActive`, `imageUrl`.

### Community Site Events (`cs_events`) — Community Platform DB
Mirror of events on the live tenant. Schema differs from `eventsTable`:  
`name → title`, `startDate → date`, `startTime → time`, `eventType → category`.  
Rows are keyed by `(orgId, slug)` — never by numeric ID.

### Community Site Org Config (`cs_org_configs`)
Per-tenant branding/config row. Updated by `PATCH /api/internal/org-config`.

---

## The AI Interview Flow

**Route:** `POST /api/community-site/interview`  
**File:** `artifacts/api-server/src/routes/communitySite.ts`

1. Authenticated user sends a chat message.
2. Route selects an interview tier (see below) and builds a system prompt with `{PAYLOAD_SPEC}` instructions.
3. Message + history is sent to `gpt-4o-mini`.
4. When the AI has enough info it emits `[PAYLOAD_READY]` followed immediately by a JSON payload.
5. `storePayloadReadyIfPresent(reply, orgId)` detects `[PAYLOAD_READY]`, isolates the first `{…}` block using brace-counting (not regex) to strip any trailing prose, parses it, and writes it to `organizations.site_config` via raw SQL:
   ```sql
   UPDATE organizations SET site_config = $json::jsonb WHERE id = $orgId
   ```
6. The UI sees `[PAYLOAD_READY]` and shows the "Launch Site" button.

### Interview Tiers
| Tier | Questions | Plan |
|------|-----------|------|
| `tier1` | 14 | Starter |
| `tier1a` | 17 | Autopilot |
| `tier2` / `tier3` | 24 | Growth / Pro |

---

## Site Provisioning Flow

**Route:** `POST /api/community-site/provision`  
**File:** `artifacts/api-server/src/routes/communitySite.ts`

1. Reads `organizations.site_config` (stored by interview).
2. Constructs `{slug}.mypillar.co` URL.
3. Updates `organizations` via raw SQL:
   ```sql
   SET site_config = $json::jsonb, community_site_url = $url
   ```
4. Calls Community Platform provision endpoint authenticated with `PILLAR_SERVICE_KEY`.
5. Community Platform:
   - Upserts `cs_org_configs` row with branding
   - Creates `cs_admin_users` row for tenant admin login
   - Creates `sitesTable` row with `status = 'published'`
6. All future syncs are gated on `sitesTable.status = 'published'`.

---

## Live Sync Pipeline (Phases 1–10)

Once a site is published, changes in the Pillar dashboard propagate live to the public site immediately.

### Architecture

```
Pillar Dashboard
      │
      ▼
 API Server (artifacts/api-server)
      │  checks sitesTable WHERE orgId AND status='published'
      │  calls pillarRequest() with x-pillar-service-key header
      ▼
 Community Platform (artifacts/community-platform, port 5001)
      │  requirePillarServiceKey() middleware validates header
      ▼
 storage.ts writes to cs_events / cs_org_configs
      │
      ▼
 Public site reflects change on next page load
```

---

## Sync Library Files

### `artifacts/api-server/src/lib/pillarSync.ts`
Base HTTP caller. Reads `COMMUNITY_PLATFORM_URL` (default `http://localhost:5001`) and `PILLAR_SERVICE_KEY` from env. 10-second timeout. Throws on non-2xx.

```typescript
export async function pillarRequest(path, method, body?): Promise<unknown>
```

Full source:
```typescript
type PillarMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export async function pillarRequest(path, method, body?) {
  const baseUrl = (process.env.COMMUNITY_PLATFORM_URL || "http://localhost:5001").replace(/\/$/, "");
  const serviceKey = process.env.PILLAR_SERVICE_KEY;
  if (!serviceKey) throw new Error("PILLAR_SERVICE_KEY is not set");

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-pillar-service-key": serviceKey },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Pillar sync ${method} ${path} → ${response.status}: ${JSON.stringify(data)}`);
  return data;
}
```

---

### `artifacts/api-server/src/lib/pillarEventSync.ts`
Maps `eventsTable` fields to `cs_events` schema and calls the three internal event routes.

```typescript
// Field mapping (toCsPayload):
//   name       → title
//   startDate  → date     (default "")
//   startTime  → time     (default "")
//   eventType  → category (default "general")
//   ticketPrice: number   → string

export async function syncCreateEventToPillar(event: SyncableEvent, orgSlug: string)
  // → POST /api/internal/events

export async function syncUpdateEventToPillar(event: SyncableEvent, orgSlug: string)
  // → PATCH /api/internal/events/slug/{event.slug}

export async function syncDeleteEventToPillar(eventSlug: string, orgSlug: string)
  // → DELETE /api/internal/events/slug/{eventSlug}
```

---

### `artifacts/api-server/src/lib/pillarOrgSync.ts`
Patches org branding on the live tenant.

```typescript
export type OrgConfigPatch = {
  orgId: string;
  orgName?: string;       shortName?: string;
  primaryColor?: string;  accentColor?: string;
  tagline?: string;       mission?: string;
  logoUrl?: string;
  contactEmail?: string;  contactPhone?: string;  contactAddress?: string;
  meetingDay?: string;    meetingTime?: string;    meetingLocation?: string;
};

export async function syncOrgConfigPatchToPillar(payload: OrgConfigPatch)
  // → PATCH /api/internal/org-config
```

---

## API Server Route Wiring

### `artifacts/api-server/src/routes/events.ts`

Every mutating operation follows this pattern:

```
1. Write to eventsTable (local Pillar DB)
2. SELECT from sitesTable WHERE orgId AND status='published'
3. If published → call sync helper
4. If sync throws → return 502 { error, localOnly: true }
5. If not published → skip sync silently
6. Return success response
```

**POST /api/events** — after insert calls `syncCreateEventToPillar(event, org.slug)`

**PUT /api/events/:id** — after update calls `syncUpdateEventToPillar(updated, org.slug)`

**DELETE /api/events/:id** — pre-fetches `{ id, slug }` *before* delete; after delete calls `syncDeleteEventToPillar(slug, org.slug)`  
(The pre-fetch is essential — the slug is needed for routing on the community platform and won't be available after deletion.)

---

### `artifacts/api-server/src/routes/organizations.ts`

**PUT /api/organizations** — expanded to accept branding fields alongside `name` and `type`:

```
Accepted body fields:
  name*, type,
  primaryColor, accentColor, tagline, mission, logoUrl,
  contactEmail, contactPhone, contactAddress,
  meetingDay, meetingTime, meetingLocation
```

Logic:
1. Validates `name` present
2. Updates `organizationsTable` (`name`, `type` only)
3. Checks for published site
4. Calls `syncOrgConfigPatchToPillar({ orgId: org.slug, orgName: name, ...brandingFields })`
5. Returns 502 `{ error, localOnly: true }` on sync failure

---

## Community Platform Internal Routes

**File:** `artifacts/community-platform/server/routes.ts`

All four routes require the `x-pillar-service-key` header, enforced by:

```typescript
function requirePillarServiceKey(req, res, next) {
  const expected = process.env.PILLAR_SERVICE_KEY;
  if (!expected) return res.status(500).json({ ok: false, error: "PILLAR_SERVICE_KEY not configured on server" });
  if (req.headers["x-pillar-service-key"] !== expected)
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}
```

| Method | Route | Body | Action |
|--------|-------|------|--------|
| `POST` | `/api/internal/events` | `{ orgId, title, description, date, time, location, category, slug?, ... }` | Creates `cs_events` row; generates slug from title if not provided |
| `PATCH` | `/api/internal/events/slug/:slug` | `{ orgId, title?, date?, ... }` | Partial update by `(orgId, slug)`; 404 if not found |
| `DELETE` | `/api/internal/events/slug/:slug` | `{ orgId }` | Delete by `(orgId, slug)`; 404 if not found |
| `PATCH` | `/api/internal/org-config` | `{ orgId, primaryColor?, tagline?, ... }` | Partial update to `cs_org_configs`; 404 if not provisioned |

---

## Community Platform Storage Layer

**File:** `artifacts/community-platform/server/storage.ts`

```typescript
// Org config
patchOrgConfig(orgId: string, data: Partial<OrgConfigInsert>): Promise<OrgConfig | null>
  // UPDATE cs_org_configs SET ...data, updatedAt=now() WHERE orgId

// Events (slug-based — never ID-based)
updateEventBySlug(orgId: string, slug: string, data: Partial<EventInsert>): Promise<Event | null>
  // UPDATE cs_events SET ...data WHERE orgId AND slug

deleteEventBySlug(orgId: string, slug: string): Promise<boolean>
  // DELETE FROM cs_events WHERE orgId AND slug  →  returns true if row existed
```

---

## Community Platform Database Schema

**File:** `artifacts/community-platform/server/schema.ts`

Key tables:

### `cs_org_configs`
| Column | Type | Notes |
|--------|------|-------|
| `orgId` | text PK | = org slug |
| `orgName` | text | |
| `shortName` | text | |
| `orgType` | text | |
| `tagline` | text | |
| `mission` | text | |
| `primaryColor` | text | Hex color |
| `accentColor` | text | Hex color |
| `logoUrl` | text | |
| `heroImageUrl` | text | |
| `contactEmail/Phone/Address` | text | |
| `meetingDay/Time/Location` | text | |
| `socialFacebook/Instagram/Twitter/Linkedin` | text | |
| `stats` | jsonb | Array of stat objects |
| `programs` | jsonb | Array of program objects |
| `partners` | jsonb | |
| `sponsorshipLevels` | jsonb | |
| `features` | jsonb | Feature flags |
| `createdAt/updatedAt` | timestamp | |

### `cs_events`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `orgId` | text | = org slug |
| `slug` | text | unique per org |
| `title` | text | |
| `description` | text | |
| `date` | text | "YYYY-MM-DD" |
| `time` | text | "7pm" etc. |
| `location` | text | |
| `category` | text | |
| `featured` | boolean | |
| `showInNav` | boolean | |
| `hasRegistration` | boolean | |
| `isTicketed` | boolean | |
| `ticketPrice` | text | Stored as string |
| `ticketCapacity` | integer | |
| `imageUrl` | text | |
| `posterImageUrl` | text | |
| `externalLink` | text | |
| `isActive` | boolean | |

---

## Pillar Main DB Schema

**Location:** `lib/db/src/schema/`  
Managed by Drizzle ORM. Migrations run via `runMigrations()` in `app.ts` using `CREATE TABLE IF NOT EXISTS` raw SQL. **Never use drizzle-kit push.**

Key schema files:

| File | Tables |
|------|--------|
| `organizations.ts` | `organizationsTable` — customers; `site_config` JSONB (raw SQL only) |
| `auth.ts` | `usersTable`, `sessionsTable` |
| `events.ts` | `eventsTable` — org event calendar |
| `sites.ts` | `sitesTable` — publish state; `status` gates all sync |
| `subscriptions.ts` | `subscriptionsTable` — Stripe subscriptions |
| `domains.ts` | `domainsTable` — custom domain mappings |
| `messages.ts` | `messagesTable` — AI interview message history |
| `conversations.ts` | `conversationsTable` — AI interview sessions |
| `contacts.ts` | `contactsTable` — CRM contacts |
| `social.ts` | `socialTable` — OAuth tokens (encrypted) |
| `sponsors.ts` | `sponsorsTable` |

---

## Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Both | Neon PostgreSQL connection string |
| `COMMUNITY_PLATFORM_URL` | API Server | Base URL of community platform (default `http://localhost:5001`) |
| `PILLAR_SERVICE_KEY` | Both | Shared secret for internal service-to-service calls |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | API Server | Google OAuth login |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | API Server | Facebook OAuth login |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | API Server | Encrypts stored social OAuth tokens |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | API Server | Object/file storage bucket |
| `PRIVATE_OBJECT_DIR` | API Server | Private storage path |
| `PUBLIC_OBJECT_SEARCH_PATHS` | API Server | Public object paths |
| `PORKBUN_API_KEY` / `PORKBUN_SECRET_KEY` | API Server | Custom domain DNS provisioning |
| `ANTHROPIC_API_KEY` | API Server | Available but model in use is `gpt-4o-mini` |

---

## Error Handling Conventions

| Scenario | Behavior |
|----------|----------|
| Org has no published site | Sync skipped silently; local write succeeds normally |
| `PILLAR_SERVICE_KEY` not set on API server | `pillarRequest()` throws; route returns 502 |
| `PILLAR_SERVICE_KEY` not set on community platform | `requirePillarServiceKey` returns 500 |
| Wrong / missing service key | `requirePillarServiceKey` returns 401 |
| Any sync HTTP failure (non-2xx) | Route returns 502 `{ error, localOnly: true }` |
| Event slug not found on PATCH/DELETE | Community platform returns 404 |
| Org config not found on PATCH | Community platform returns 404 (site not provisioned yet) |

---

## Full Source File Index

### API Server (`artifacts/api-server/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | Entry point, binds port |
| `app.ts` | Express setup, middleware, `runMigrations()`, route mounting |
| `routes/communitySite.ts` | AI interview, `[PAYLOAD_READY]` storage, provision, site-config edit |
| `routes/events.ts` | Event CRUD + live sync to community platform |
| `routes/organizations.ts` | Org CRUD + branding sync to community platform |
| `routes/sites.ts` | Publish/unpublish; calls CP provision endpoint |
| `routes/auth.ts` | Session login/logout, Google/Facebook OAuth |
| `routes/social.ts` | Social media OAuth connect + posting |
| `routes/management.ts` | Admin management endpoints |
| `routes/contacts.ts` | CRM contacts CRUD |
| `routes/stats.ts` | Analytics/stats endpoints |
| `lib/pillarSync.ts` | Base HTTP caller (service-key auth, timeout) |
| `lib/pillarEventSync.ts` | Event field mapping + 3 sync functions |
| `lib/pillarOrgSync.ts` | Org branding patch sync |
| `lib/resolveOrg.ts` | Resolve authenticated user → org |
| `lib/resolveOrgScope.ts` | Scope-aware org resolution |
| `lib/scheduleSiteAutoUpdate.ts` | Fire-and-forget HTML preview blob update |
| `lib/objectStorage.ts` | File/image upload helpers |
| `lib/objectAcl.ts` | Object access control |
| `lib/tokenCrypto.ts` | Encrypt/decrypt OAuth tokens |
| `lib/auth.ts` | Passport.js strategy setup |
| `lib/csrf.ts` | CSRF token utilities |
| `lib/logger.ts` | Pino logger |
| `lib/schedulerLock.ts` | Distributed lock for background jobs |
| `lib/sanitizeHtml.ts` | HTML sanitization helper |
| `lib/errorAlert.ts` | Error alerting |
| `scheduler.ts` | Background job scheduler |
| `mailer.ts` | Transactional email (nodemailer) |
| `tiers.ts` | Interview tier definitions (14q/17q/24q) |
| `siteTemplate.ts` | HTML site template renderer |
| `eventPage.ts` | Public event page HTML generator |
| `publicEventPages.ts` | Event page serving |
| `publicFormPages.ts` | Public form page serving |
| `agents.ts` | AI agent runner |
| `porkbun.ts` | Porkbun DNS API client |
| `stripeClient.ts` | Stripe SDK client |
| `ticketHooks.ts` | Stripe webhook handlers for tickets |
| `webhookHandlers.ts` | All Stripe webhook handlers |

### Community Platform (`artifacts/community-platform/`)
| File | Purpose |
|------|---------|
| `server/index.ts` | Entry point, `runMigrations()`, starts Express on `$PORT` (default 5001) |
| `server/routes.ts` | All routes including 4 internal sync routes |
| `server/storage.ts` | All DB queries via Drizzle |
| `server/schema.ts` | Drizzle schema for all `cs_*` tables |
| `server/db.ts` | Drizzle + Neon WebSocket DB client |
| `server/content-hooks.ts` | Content lifecycle hooks |
| `server/registration-window-engine.ts` | Event registration window logic |
| `client/App.tsx` | Tenant-aware React router |
| `client/config-context.tsx` | Loads `cs_org_configs` into React context |
| `client/lib/api.ts` | Client-side API helpers |
| `client/pages/HomePage.tsx` | Tenant home page |
| `client/pages/EventsPage.tsx` | Events listing |
| `client/pages/EventDetailPage.tsx` | Single event + ticket purchase |
| `client/pages/AboutPage.tsx` | About / mission page |
| `client/pages/ContactPage.tsx` | Contact form |
| `client/pages/AdminPage.tsx` | In-site tenant admin panel |
| `client/pages/AdminLoginPage.tsx` | Tenant admin login |
| `client/pages/BlogPage.tsx` | Blog listing |
| `client/pages/BlogPostPage.tsx` | Single blog post |
| `client/pages/GalleryPage.tsx` | Photo gallery |
| `client/pages/PaymentSuccessPage.tsx` | Post-checkout success page |
| `client/components/Navigation.tsx` | Tenant nav bar (config-aware) |
| `client/components/Footer.tsx` | Tenant footer |

### Shared DB Schema (`lib/db/src/schema/`)
`organizations.ts`, `events.ts`, `sites.ts`, `auth.ts`, `subscriptions.ts`,
`domains.ts`, `messages.ts`, `conversations.ts`, `contacts.ts`, `social.ts`,
`sponsors.ts`, `agentLogs.ts`, `boardLinks.ts`, `contentQueue.ts`,
`eventPublicMetrics.ts`, `eventRelations.ts`, `eventRevenueSummary.ts`,
`hookEventLog.ts`, `jobQueue.ts`, `newsletterSubscribers.ts`, `notifications.ts`,
`orgActivityStream.ts`, `orgBusinesses.ts`, `orgContactSubmissions.ts`,
`orgFeatureFlags.ts`, `orgMembers.ts`, `orgPlan.ts`, `orgSiteContent.ts`,
`orgUsageLimits.ts`, `outreachProspects.ts`, `passwordResets.ts`,
`photoAlbums.ts`, `siteSchedules.ts`, `websiteSpecs.ts`, `vendors.ts`

---

## Sync Flow Diagrams

### Event Create
```
User in dashboard clicks "Add Event"
       │
       ▼
POST /api/events  (api-server)
       │
       ├── INSERT INTO eventsTable (local Pillar DB)
       │
       ├── SELECT sitesTable WHERE orgId AND status='published'
       │
       ├── [if published]
       │      └── syncCreateEventToPillar(event, org.slug)
       │               │
       │               └── pillarRequest POST /api/internal/events
       │                        │  header: x-pillar-service-key
       │                        ▼
       │               requirePillarServiceKey()  ✓
       │                        │
       │                        ▼
       │               storage.createEvent(orgId, cs_payload)
       │                        │
       │                        ▼
       │               INSERT INTO cs_events
       │
       ├── [if sync fails] → 502 { error, localOnly: true }
       └── 201 { event }
```

### Event Update
```
PUT /api/events/:id
       │
       ├── UPDATE eventsTable SET ...
       ├── SELECT sitesTable WHERE status='published'
       └── [if published] syncUpdateEventToPillar(updated, org.slug)
                  │
                  └── PATCH /api/internal/events/slug/:slug
                           └── storage.updateEventBySlug(orgId, slug, data)
```

### Event Delete
```
DELETE /api/events/:id
       │
       ├── SELECT { id, slug } FROM eventsTable  ← pre-fetch slug BEFORE delete
       ├── DELETE FROM eventsTable
       ├── SELECT sitesTable WHERE status='published'
       └── [if published] syncDeleteEventToPillar(slug, org.slug)
                  │
                  └── DELETE /api/internal/events/slug/:slug
                           └── storage.deleteEventBySlug(orgId, slug)
```

### Org Branding Update
```
PUT /api/organizations { name, primaryColor, tagline, ... }
       │
       ├── UPDATE organizationsTable SET name, type
       ├── SELECT sitesTable WHERE status='published'
       └── [if published] syncOrgConfigPatchToPillar({ orgId: slug, primaryColor, ... })
                  │
                  └── PATCH /api/internal/org-config
                           └── storage.patchOrgConfig(orgId, patch)
                                    └── UPDATE cs_org_configs SET primaryColor=...
                                             └── Public site reflects on next load
```

---

## Testing Reference

### Test Org
- Slug: `pillar-test-001`
- User: `pillartest@example.com` / `TestPillar2024!`

### PILLAR_SERVICE_KEY
`f8d531dbc2b53a8a15ab08bca95d4dd09bc19e3266155b69c96f99ca68138096`

### Quick Smoke Tests (run from project shell)
```bash
CP_PORT=5001
KEY="f8d531dbc2b53a8a15ab08bca95d4dd09bc19e3266155b69c96f99ca68138096"

# Should return 401 (no key):
curl -X POST http://localhost:$CP_PORT/api/internal/events \
  -H "Content-Type: application/json" -d '{"orgId":"test","title":"t"}' -w " status=%{http_code}"

# Should return 201 (event created):
curl -X POST http://localhost:$CP_PORT/api/internal/events \
  -H "Content-Type: application/json" -H "x-pillar-service-key: $KEY" \
  -d '{"orgId":"pillar-test-001","title":"Test","date":"2025-05-01","time":"7pm","category":"community"}' \
  -w " status=%{http_code}"

# Should return 200 (event updated by slug):
curl -X PATCH http://localhost:$CP_PORT/api/internal/events/slug/test \
  -H "Content-Type: application/json" -H "x-pillar-service-key: $KEY" \
  -d '{"orgId":"pillar-test-001","title":"Test Updated"}' -w " status=%{http_code}"

# Should return 200 (event deleted by slug):
curl -X DELETE http://localhost:$CP_PORT/api/internal/events/slug/test \
  -H "Content-Type: application/json" -H "x-pillar-service-key: $KEY" \
  -d '{"orgId":"pillar-test-001"}' -w " status=%{http_code}"

# Should return 200 (org config patched):
curl -X PATCH http://localhost:$CP_PORT/api/internal/org-config \
  -H "Content-Type: application/json" -H "x-pillar-service-key: $KEY" \
  -d '{"orgId":"pillar-test-001","primaryColor":"#c25038"}' -w " status=%{http_code}"
```

### Verified Results (April 7 2026)
```
POST   /api/internal/events (no key)              → 401 ✓
POST   /api/internal/events (correct key)         → 201 { ok: true, event: { id: 1, ... } } ✓
PATCH  /api/internal/events/slug/:slug            → 200 { ok: true, event: { title: "...UPDATED" } } ✓
DELETE /api/internal/events/slug/:slug            → 200 { ok: true } ✓
PATCH  /api/internal/org-config                   → 200 { ok: true, config: { primaryColor: "#ff0000" } } ✓
API server TypeScript build                       → clean ✓
Community platform server TypeScript              → clean ✓
```
