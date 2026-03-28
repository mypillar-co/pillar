# Steward — Your Organization, on Autopilot

## Overview
Steward is an AI-powered SaaS platform designed to autonomously manage websites, event dashboards, and social media for civic organizations, nonprofits, clubs, and community groups. It provides a "Wix meets Eventbrite" experience, putting organizational management on autopilot. The platform offers tiered subscriptions ranging from basic AI website generation to fully autonomous management across websites, events, and social media.

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
- **AI Site Builder**: Chat-based interview (8 questions) using AI models to generate and update organizational websites. Includes event data injection, logo upload, Google Fonts typography, Unsplash photography, scroll animations, parallax effects, and responsive hamburger navigation. Sites are Squarespace-quality with CSS custom properties architecture.
- **Guided Tour**: First-time dashboard visitors see a 5-step guided tour highlighting key features (Overview, Site Builder, Events, Social, Payments). Uses localStorage to track completion.
- **Event Dashboard**: Management of events, vendors, sponsors, contacts, and payments.
- **Payment Collection (Stripe Connect)**: Organizations connect their bank accounts via Stripe Express to collect ticket sales, vendor fees, and sponsorship payments. Steward takes 2.9% + $0.30 per transaction. Public ticket purchase pages at `/events/:slug/tickets` with Stripe Checkout. Atomic inventory reservation prevents overselling. Webhook handles `checkout.session.completed`, `checkout.session.expired` (releases inventory), and `charge.refunded` (marks refunds). Tax liability notice and nonprofit support built into Payments page.
- **Social Media Automation**: Scheduling and publishing posts to platforms like Facebook, Instagram, and X.
- **Custom Domain Management**: Support for purchasing domains via Porkbun, external domains, DNS/SSL checks, and auto-renewal.
- **Dashboard Getting Started Checklist**: New user onboarding shows progress through plan selection, website building, event creation, and social media connection.
- **Tier Gating**: Features are gated based on subscription tiers, with frontend prompts for upgrades using plan names (Starter, Autopilot, Events, Total Operations).

### AI Model Strategy
- **Chat & Spec Extraction**: `gpt-5-mini` for reasoning, structured JSON, and short replies.
- **HTML Generation**: `gpt-4o-mini` for direct HTML output due to its efficiency with token usage for large outputs. Enhanced prompt includes detailed design standards (typography hierarchy, whitespace, shadows, gradients, mobile responsiveness).

### Security & Reliability
- **CORS**: Restricted to specific Replit and Steward domains.
- **Session Cookies**: `httpOnly`, `secure`, `sameSite: "lax"` for CSRF protection.
- **Error Handling**: Express 5 async error handling and global error middleware.
- **Slug Uniqueness**: Database constraint ensures unique organization slugs.
- **Webhook Safety**: Errors fail closed (re-thrown for Stripe retry). Idempotent payment processing. Atomic inventory reservation with rollback on failure.

## External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Stripe**: Payment processing for subscriptions, Stripe Connect for org payments. Integrated via Replit Connectors for secure API key management.
- **Replit Auth**: Authentication service for user login and management.
- **OpenAI**: AI models (`gpt-5-mini`, `gpt-4o-mini`) used for site generation, interviews, event descriptions, and content strategy.
- **Porkbun**: Domain registrar API for domain availability checks, registration, and management.
