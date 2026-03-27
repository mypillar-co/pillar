# Steward — Your Organization, on Autopilot

## Overview
Steward is an AI-powered SaaS platform designed to autonomously manage websites, event dashboards, and social media for small businesses, Masonic lodges, and local organizations. It aims to provide a "Wix meets Eventbrite" experience, putting organizational management on autopilot. The platform offers tiered subscriptions ranging from basic AI website generation to fully autonomous management across websites, events, and social media.

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
- **Aesthetic**: A civic organization feel – trustworthy, professional, and formal.
- **Navigation**: Sidebar navigation, collapsible on desktop, overlay on mobile.
- **Tagline**: "Your organization, on autopilot."
- **Target Audience**: Masonic lodges, civic organizations, social clubs, local businesses.

### Core Features
- **AI Site Builder**: Chat-based interface using AI models to generate and update organizational websites. Includes event data injection and logo upload.
- **Event Dashboard**: Management of events, vendors, sponsors, contacts, and payments.
- **Social Media Automation**: Scheduling and publishing posts to platforms like Facebook and X.
- **Custom Domain Management**: Support for purchasing domains via Porkbun, external domains, DNS/SSL checks, and auto-renewal.
- **Subscription Tiers**: Multiple tiers offering varying levels of automation and features.
- **Tier Gating**: Features are gated based on subscription tiers, with frontend prompts for upgrades.

### AI Model Strategy
- **Chat & Spec Extraction**: `gpt-5-mini` for reasoning, structured JSON, and short replies.
- **HTML Generation**: `gpt-4o-mini` for direct HTML output due to its efficiency with token usage for large outputs.

### Security & Reliability
- **CORS**: Restricted to specific Replit and Steward domains.
- **Session Cookies**: `httpOnly`, `secure`, `sameSite: "lax"` for CSRF protection.
- **Error Handling**: Express 5 async error handling and global error middleware.
- **Slug Uniqueness**: Database constraint ensures unique organization slugs.

## External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Stripe**: Payment processing for subscriptions and domain purchases. Integrated via Replit Connectors for secure API key management.
- **Replit Auth**: Authentication service for user login and management.
- **Anthropic (Claude)**: AI models (`claude-3-haiku` mentioned) used in the AI site builder.
- **OpenAI**: AI models (`gpt-5-mini`, `gpt-4o-mini`) used for site generation and content strategy.
- **Porkbun**: Domain registrar API for domain availability checks, registration, and management.