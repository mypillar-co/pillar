# Pillar — Platform Overview for External Review

**Tagline:** Your organization, on autopilot.  
**Domain:** mypillar.co  
**Stack:** TypeScript monorepo (pnpm workspaces) · Node/Express API · React/Vite frontend · PostgreSQL (Drizzle ORM) · Google Cloud Storage · Stripe

---

## What Pillar Is

Pillar is an AI-powered SaaS platform built for civic and community organizations — Rotary clubs, VFW posts, HOAs, PTAs, lodges, and nonprofits. It replaces the patchwork of spreadsheets, Facebook groups, email chains, and paper forms that most of these organizations rely on today.

The core value proposition: an org admin sets things up once, and Pillar handles operations autonomously from that point forward.

---

## Subscription Tiers

| Tier | Price | Key Features |
|------|-------|--------------|
| Starter (`tier1`) | $29/mo | Website, contacts, basic events |
| Autopilot (`tier1a`) | $59/mo | + AI social posts, email campaigns, automated scheduling |
| Events (`tier2`) | $99/mo | + Ticketing (Stripe), recurring templates, approval workflows |
| Total Operations (`tier3`) | $149/mo | + Full AI agent autonomy, Stripe Connect, vendor/sponsor portals |

All tiers include a 14-day free trial. Billing is handled via Stripe Subscriptions.

---

## Monorepo Structure

```
/
├── artifacts/
│   ├── api-server/          Express API (Node.js, TypeScript, esbuild)
│   └── steward/             React + Vite frontend (the "Pillar" web app)
├── lib/
│   ├── db/                  Drizzle ORM schema + migrations (PostgreSQL)
│   ├── api-spec/            OpenAPI spec + codegen (Zod schemas)
│   ├── api-client-react/    React Query hooks generated from OpenAPI spec
│   └── object-storage-web/  GCS presigned-URL upload client (Uppy v5)
└── package.json             pnpm workspace root
```

---

## Key Features

### 1. Organization Website (Site Builder)
- AI-generated organization website from a simple setup wizard
- Import from existing website via URL (Cheerio scraping + Claude AI)
- 4 style presets, 6 color themes, 10 configurable sections
- Custom domain support (Porkbun DNS API + Let's Encrypt SSL via Caddy)
- Website auto-updates when events or sponsors change

### 2. Event Management
- Create one-time or recurring events (templates auto-generate future instances)
- Paid ticketing via Stripe Connect (money goes directly to org's bank account)
- Public ticket purchase page at `/events/:slug/tickets`
- Board approval workflow: secure email link → board votes → auto-approved
- AI auto-drafts promotional social posts on event creation

### 3. Vendor & Sponsor Registration Portal
- Public self-registration at `/apply/:orgSlug`
- Vendors upload ServSafe certificates and Certificates of Insurance (COI)
  directly to Google Cloud Storage via presigned URLs (no server relay)
- Stripe Connect checkout for paid registration fees (platform takes 2.9%+30¢)
- Admin approval/rejection workflow with optional rejection notes
- Approved registrations auto-create sponsor or vendor records

### 4. AI Content & Communications
- Social media drafting (Facebook, Instagram, etc.) via Claude/GPT-4o-mini
- Email campaign generation for org contacts
- Content Studio: general AI writing assistant
- Scheduled posts queue with admin review gate

### 5. AI Agents (Tier 3)
- Customer Success agent: monitors org health, sends check-in emails
- Operations agent: flags upcoming deadlines, compliance gaps
- Outreach agent: drafts sponsor prospecting emails
- Content agent: queues 30-day content calendar automatically

### 6. Contacts & CRM
- Contact database with import/export
- Tagging and filtering
- Email outreach history

### 7. Payments & Finance
- Stripe Connect onboarding for orgs to accept payments
- Revenue dashboard (ticket sales, registration fees)
- Stripe webhook-driven state machine for payment → approval flows

### 8. Board Links (Approval Workflow)
- Generate secure one-time voting links for board members
- Members vote Yes/No without needing an account
- Auto-approve when threshold met

---

## Authentication

- **Replit Auth** (OpenID Connect / PKCE) — primary login
- **Google OAuth** — secondary login option
- **Session-based** auth with PostgreSQL session storage

---

## Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `users` | Auth identities |
| `organizations` | Org settings, tier, Stripe IDs, domain config, storage stats |
| `subscriptions` | Stripe subscription state machine |
| `events` | Events with ticketing config |
| `ticket_types` | Ticket pricing/capacity per event |
| `ticket_sales` | Individual ticket purchases |
| `sponsors` | Approved sponsor records |
| `vendors` | Approved vendor records |
| `registrations` | Vendor/sponsor applications (pending → approved) with doc URLs |
| `contacts` | CRM contacts per org |
| `sites` | Generated website HTML + metadata |
| `domains` | Custom domain config + SSL status |
| `social_posts` | Scheduled social content |
| `notifications` | In-app notifications |
| `support_tickets` | Help desk tickets |
| `agent_logs` | AI agent activity log |
| `content_queue` | Pending AI-drafted content |
| `board_links` | Secure board voting tokens |

---

## Infrastructure & Third-Party Services

| Service | Purpose |
|---------|---------|
| **Stripe** | Billing subscriptions + Stripe Connect for org payments |
| **Google Cloud Storage** | File/document storage (presigned URL uploads) |
| **Resend** | Transactional email (7 template types) |
| **Anthropic Claude** | AI support responses, site generation |
| **OpenAI GPT-4o-mini** | Social content, site import, email drafts |
| **Porkbun** | DNS management for custom domains |
| **Google OAuth** | Secondary authentication |

---

## Security Notes for Reviewer

- No secrets are stored in code — all via environment variables
- Stripe webhook signature verified before processing
- File uploads use GCS presigned URLs (files never pass through the app server)
- SSRF protection on the site-import URL scraper: hostname blocklist + ipaddr.js DNS validation + redirect-safe fetch wrapper
- All admin routes gated by `req.isAuthenticated()` middleware
- Storage ACL framework for object-level access control

---

## What Is NOT Included in This Archive

- `.env` / secret environment variable values
- `node_modules/` directories
- Build output (`dist/`)
- Git history (`.git/`)
- Internal agent/task tooling (`.local/`)

---

*Generated: April 2026 — for external technical review only. Not for redistribution.*
