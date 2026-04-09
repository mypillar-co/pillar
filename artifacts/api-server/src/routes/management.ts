/**
 * Unified Management Chat API
 * POST /api/management/chat
 *
 * Natural-language interface for org admins to manage all aspects of their
 * Pillar-generated site via OpenAI tool calls.
 *
 * Operations covered:
 *   1. Event management (create / update / delete / list)
 *   2. Ticket sales monitoring
 *   3. Registration controls (open / close / force)
 *   4. Sponsor management (pending queue, approve/reject, manual add)
 *   5. Site content (key-value store)
 *   6. Business directory
 *   7. Photo albums
 *   8. Newsletter (send + subscriber count)
 *   9. Contact messages
 *  10. Analytics overview
 */

import { Router, type Request, type Response } from "express";
import {
  db,
  organizationsTable,
  eventsTable,
  ticketTypesTable,
  ticketSalesTable,
  registrationsTable,
  sponsorsTable,
  orgContactSubmissionsTable,
  newsletterSubscribersTable,
  orgBusinessesTable,
  orgSiteContentTable,
  photoAlbumsTable,
  albumPhotosTable,
  sitesTable,
  siteBlocksTable,
} from "@workspace/db";
import { eq, and, gte, sum, count, isNull, desc, or, sql, like } from "drizzle-orm";
import OpenAI from "openai";
import { resolveFullOrg } from "../lib/resolveOrg";
import { compileSite } from "@workspace/site/services";
import { logger } from "../lib/logger";
import { buildSiteFromTemplate, type SiteContent } from "../siteTemplate";

const router = Router();

// ─── OpenAI client ─────────────────────────────────────────────────────────

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) throw new Error("OpenAI AI integration not configured");
  return new OpenAI({ apiKey, baseURL });
}

// ─── Slug helpers ───────────────────────────────────────────────────────────

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── Main chat endpoint ─────────────────────────────────────────────────────

// ─── Site recompile helper ─────────────────────────────────────────────────
// Called after any management change that affects the public website.
// Directly recompiles the site HTML (bypasses the job queue, which requires
// autoUpdateEnabled=true and block-level update policies — both rarely set).
// Only runs if the site has blocks; legacy-blob-only sites are left alone.
async function forceSiteRecompile(orgId: string): Promise<void> {
  try {
    const [site] = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
      .limit(1);

    if (!site) return;

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(siteBlocksTable)
      .where(and(
        eq(siteBlocksTable.siteId, site.id),
        eq(siteBlocksTable.orgId, orgId),
        isNull(siteBlocksTable.deletedAt),
      ));

    if ((n ?? 0) === 0) return;

    await compileSite(orgId, site.id, "full_compile");
  } catch {
    // Non-fatal — never block the originating operation
  }
}

const AUTOPILOT_TIERS = new Set(["tier1a", "tier2", "tier3"]);

router.post("/chat", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!AUTOPILOT_TIERS.has(org.tier ?? "")) {
    res.status(403).json({
      error: "Autopilot requires the Autopilot plan or higher.",
      upgradeRequired: true,
    });
    return;
  }

  const { message, history = [] } = req.body as {
    message: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const client = getOpenAIClient();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // ── Tool definitions ──────────────────────────────────────────────────────

  const tools: OpenAI.Chat.ChatCompletionTool[] = [

    // ── 1. Event management ─────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "list_events",
        description: "List all active events for this org, with ticket sales stats.",
        parameters: {
          type: "object",
          properties: {
            includeInactive: { type: "boolean", description: "Include past/inactive events. Default false." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_event",
        description: "Create a new event and publish it to the public site immediately.",
        parameters: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            date: { type: "string", description: "Human-readable date, e.g. 'Wednesday, April 9, 2026'" },
            time: { type: "string", description: "Time range, e.g. '6:00 - 9:00 PM'" },
            location: { type: "string" },
            description: { type: "string" },
            category: { type: "string", description: "e.g. Community, Fundraiser, Social" },
            featured: { type: "boolean", default: false },
            isTicketed: { type: "boolean" },
            ticketPrice: { type: "number", description: "Price per ticket in USD" },
            ticketCapacity: { type: "number" },
            ticketSaleOpen: { type: "string", description: "Date ticket sales open, ISO format YYYY-MM-DD. Null = sales open immediately." },
            ticketSaleClose: { type: "string", description: "Date ticket sales close, ISO format YYYY-MM-DD. Null = no close date." },
            hasRegistration: { type: "boolean", description: "True if vendors/attendees register" },
            hasSponsorSection: { type: "boolean" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_event",
        description: "Update fields on an existing event. Look up the event slug from list_events if needed.",
        parameters: {
          type: "object",
          required: ["slug"],
          properties: {
            slug: { type: "string", description: "Event slug identifier" },
            title: { type: "string" },
            date: { type: "string" },
            time: { type: "string" },
            location: { type: "string" },
            description: { type: "string" },
            featured: { type: "boolean" },
            isActive: { type: "boolean" },
            showOnPublicSite: { type: "boolean" },
            isTicketed: { type: "boolean" },
            ticketPrice: { type: "number" },
            ticketCapacity: { type: "number" },
            ticketSaleOpen: { type: "string", description: "ISO YYYY-MM-DD date when sales open. Pass null to clear (open immediately)." },
            ticketSaleClose: { type: "string", description: "ISO YYYY-MM-DD date when sales close. Pass null to clear (no close date)." },
            hasRegistration: { type: "boolean" },
            registrationClosed: { type: "boolean" },
            registrationForceOpen: { type: "boolean" },
            hasSponsorSection: { type: "boolean" },
            status: { type: "string", enum: ["draft", "published", "cancelled"] },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_event",
        description: "Soft-delete an event (marks it inactive, removes from public site). Only use after the user has explicitly confirmed.",
        parameters: {
          type: "object",
          required: ["slug"],
          properties: {
            slug: { type: "string" },
          },
        },
      },
    },

    // ── 2. Ticket sales ─────────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "get_ticket_sales",
        description: "Get detailed ticket sales for a specific event.",
        parameters: {
          type: "object",
          required: ["slug"],
          properties: {
            slug: { type: "string" },
          },
        },
      },
    },

    // ── 3. Registration controls (handled via update_event above) ───────

    // ── 4. Sponsor management ───────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "list_pending_sponsors",
        description: "List sponsor applications that are pending approval.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "decide_sponsor",
        description: "Approve or reject a pending sponsor application.",
        parameters: {
          type: "object",
          required: ["registrationId", "decision"],
          properties: {
            registrationId: { type: "string" },
            decision: { type: "string", enum: ["approved", "rejected"] },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_sponsor",
        description: "Manually add a sponsor directly (bypassing application flow).",
        parameters: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            level: { type: "string", description: "e.g. Presenting, Gold, Silver, Bronze" },
            logoUrl: { type: "string" },
            websiteUrl: { type: "string" },
            eventSlug: { type: "string", description: "Event this sponsor is for (optional)" },
          },
        },
      },
    },

    // ── 5. Site content ─────────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "list_content",
        description: "List all editable site content key-value pairs.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "set_content",
        description: "Set a site content value by key.",
        parameters: {
          type: "object",
          required: ["key", "value"],
          properties: {
            key: { type: "string", description: "Content key, e.g. home_tagline, about_description" },
            value: { type: "string" },
          },
        },
      },
    },

    // ── 6. Site sections ────────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "list_sections",
        description: "List all available website sections and whether each is currently enabled or disabled.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "toggle_section",
        description: "Enable or disable a section on the public website. Takes effect immediately.",
        parameters: {
          type: "object",
          required: ["section", "enabled"],
          properties: {
            section: {
              type: "string",
              enum: ["blog", "newsletter", "businessDirectory", "sponsors", "vendors", "ticketedEvents"],
              description: "Section to toggle. blog=News & Blog, newsletter=Newsletter signup, businessDirectory=Business directory, sponsors=Sponsors display, vendors=Vendor registration, ticketedEvents=Ticket sales capability",
            },
            enabled: { type: "boolean", description: "true to add/show the section, false to hide it" },
          },
        },
      },
    },

    // ── 7. Business directory ───────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "list_businesses",
        description: "List all businesses in the directory.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "add_business",
        description: "Add a business to the directory.",
        parameters: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            category: { type: "string", description: "Dining, Retail, Services, Entertainment, Professional Services, Health & Wellness, General" },
            description: { type: "string" },
            address: { type: "string" },
            phone: { type: "string" },
            website: { type: "string" },
          },
        },
      },
    },

    // ── 7. Photo albums ─────────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "list_albums",
        description: "List all photo albums.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "create_album",
        description: "Create a new photo album.",
        parameters: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            eventSlug: { type: "string" },
          },
        },
      },
    },

    // ── 8. Newsletter ───────────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "get_subscriber_count",
        description: "Get the number of active newsletter subscribers.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "send_newsletter",
        description: "Compose and send a newsletter to all subscribers.",
        parameters: {
          type: "object",
          required: ["subject", "bodyHtml"],
          properties: {
            subject: { type: "string" },
            bodyHtml: { type: "string", description: "Full HTML content for the newsletter body (will be wrapped in a standard template)" },
          },
        },
      },
    },

    // ── 9. Contact messages ─────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "list_messages",
        description: "List recent contact form messages submitted through the public site.",
        parameters: {
          type: "object",
          properties: {
            unreadOnly: { type: "boolean", description: "Only show unread messages. Default false." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "mark_messages_read",
        description: "Mark contact messages as read.",
        parameters: {
          type: "object",
          required: ["ids"],
          properties: {
            ids: { type: "array", items: { type: "string" }, description: "List of message IDs to mark as read" },
          },
        },
      },
    },

    // ── 10. Analytics ───────────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "get_analytics_overview",
        description: "Get a full analytics overview: events, ticket sales, sponsors, subscribers, messages.",
        parameters: { type: "object", properties: {} },
      },
    },

    // ── 11. Self-test ────────────────────────────────────────────────────────
    {
      type: "function",
      function: {
        name: "run_self_test",
        description: "Run the Pillar build engine self-test. Seeds demo events (Norwin Rotary scenario), recompiles the site, then validates the compiled HTML and database state against the spec checklist. Returns a detailed pass/fail report.",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  // ── Tool execution functions ────────────────────────────────────────────

  async function execListEvents(args: Record<string, unknown>): Promise<string> {
    const includeInactive = args.includeInactive === true;
    const rows = await db
      .select()
      .from(eventsTable)
      .where(
        includeInactive
          ? eq(eventsTable.orgId, org.id)
          : and(eq(eventsTable.orgId, org.id), eq(eventsTable.isActive, true))
      )
      .orderBy(desc(eventsTable.startDate))
      .limit(30);

    const withSales = await Promise.all(rows.map(async (e) => {
      const [sales] = await db
        .select({ sold: sum(ticketSalesTable.quantity), rev: sum(ticketSalesTable.amountPaid) })
        .from(ticketSalesTable)
        .where(and(eq(ticketSalesTable.eventId, e.id), eq(ticketSalesTable.paymentStatus, "paid")));
      return {
        id: e.id,
        slug: e.slug,
        title: e.name,
        date: e.startDate,
        time: e.startTime ? `${e.startTime}${e.endTime ? ` - ${e.endTime}` : ""}` : null,
        location: e.location,
        status: e.status,
        isActive: e.isActive,
        showOnPublicSite: e.showOnPublicSite,
        featured: e.featured,
        isTicketed: e.isTicketed,
        hasRegistration: e.hasRegistration,
        ticketsSold: Number(sales?.sold ?? 0),
        revenueUsd: (Number(sales?.rev ?? 0) / 100).toFixed(2),
      };
    }));

    return JSON.stringify(withSales);
  }

  async function execCreateEvent(args: Record<string, unknown>): Promise<string> {
    const title = String(args.title ?? "");
    const baseSlug = toSlug(title);
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

    // Parse date/time from human-readable
    const dateStr = args.date ? String(args.date) : null;
    const timeStr = args.time ? String(args.time) : null;
    let startTime: string | null = null;
    let endTime: string | null = null;
    if (timeStr) {
      const parts = timeStr.split(/\s*[-–]\s*/);
      startTime = parts[0]?.trim() ?? null;
      endTime = parts[1]?.trim() ?? null;
    }

    const [event] = await db
      .insert(eventsTable)
      .values({
        orgId: org.id,
        name: title,
        slug: uniqueSlug,
        description: args.description ? String(args.description) : undefined,
        startDate: dateStr ?? undefined,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        location: args.location ? String(args.location) : undefined,
        eventType: args.category ? String(args.category) : undefined,
        featured: args.featured === true,
        featuredOnSite: args.featured === true,
        isTicketed: args.isTicketed === true,
        ticketPrice: args.ticketPrice ? Number(args.ticketPrice) : undefined,
        ticketCapacity: args.ticketCapacity ? Number(args.ticketCapacity) : undefined,
        ...(args.ticketSaleOpen != null ? { ticketSaleOpen: String(args.ticketSaleOpen) } : {}),
        ...(args.ticketSaleClose != null ? { ticketSaleClose: String(args.ticketSaleClose) } : {}),
        hasRegistration: args.hasRegistration === true,
        hasSponsorSection: args.hasSponsorSection === true,
        status: "published",
        isActive: true,
        showOnPublicSite: true,
      })
      .returning();

    if (event && args.isTicketed && args.ticketPrice != null) {
      await db.insert(ticketTypesTable).values({
        eventId: event.id,
        orgId: org.id,
        name: "General Admission",
        price: Number(args.ticketPrice ?? 0),
        quantity: args.ticketCapacity ? Number(args.ticketCapacity) : undefined,
        isActive: true,
      });
    }

    forceSiteRecompile(org.id).catch(() => {});

    const publicUrl = `https://${org.slug}.mypillar.co/events/${uniqueSlug}`;
    return JSON.stringify({ ok: true, slug: uniqueSlug, publicUrl });
  }

  async function execUpdateEvent(args: Record<string, unknown>): Promise<string> {
    const slug = String(args.slug ?? "");
    const [existing] = await db
      .select({ id: eventsTable.id, name: eventsTable.name })
      .from(eventsTable)
      .where(and(eq(eventsTable.slug, slug), eq(eventsTable.orgId, org.id)));

    if (!existing) return JSON.stringify({ error: `Event not found: ${slug}` });

    const allowed: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      title: "name",
      date: "startDate",
      location: "location",
      description: "description",
      featured: "featured",
      isActive: "isActive",
      showOnPublicSite: "showOnPublicSite",
      isTicketed: "isTicketed",
      ticketPrice: "ticketPrice",
      ticketCapacity: "ticketCapacity",
      hasRegistration: "hasRegistration",
      status: "status",
    };
    for (const [argKey, dbKey] of Object.entries(fieldMap)) {
      if (argKey in args) allowed[dbKey] = args[argKey];
    }

    // Handle time field
    if (args.time) {
      const parts = String(args.time).split(/\s*[-–]\s*/);
      allowed.startTime = parts[0]?.trim();
      allowed.endTime = parts[1]?.trim() ?? null;
    }

    // Handle registration override flags (stored in events metadata — use extra columns if they exist, else note them)
    // These come through as direct column updates
    if ("registrationClosed" in args) allowed.registrationClosed = args.registrationClosed;
    if ("registrationForceOpen" in args) allowed.registrationForceOpen = args.registrationForceOpen;

    // Handle ticket sale window dates (null clears the date)
    if ("ticketSaleOpen" in args) allowed.ticketSaleOpen = args.ticketSaleOpen ?? null;
    if ("ticketSaleClose" in args) allowed.ticketSaleClose = args.ticketSaleClose ?? null;

    if (!Object.keys(allowed).length) return JSON.stringify({ error: "No valid fields to update" });

    await db
      .update(eventsTable)
      .set(allowed)
      .where(and(eq(eventsTable.id, existing.id), eq(eventsTable.orgId, org.id)));

    forceSiteRecompile(org.id).catch(() => {});
    return JSON.stringify({ ok: true, slug, updated: Object.keys(allowed) });
  }

  async function execDeleteEvent(args: Record<string, unknown>): Promise<string> {
    const slug = String(args.slug ?? "");
    const [existing] = await db
      .select({ id: eventsTable.id, name: eventsTable.name })
      .from(eventsTable)
      .where(and(eq(eventsTable.slug, slug), eq(eventsTable.orgId, org.id)));

    if (!existing) return JSON.stringify({ error: `Event not found: ${slug}` });

    await db
      .update(eventsTable)
      .set({ isActive: false, showOnPublicSite: false, status: "cancelled" })
      .where(eq(eventsTable.id, existing.id));

    forceSiteRecompile(org.id).catch(() => {});
    return JSON.stringify({ ok: true, message: `"${existing.name}" has been removed from the site.` });
  }

  async function execGetTicketSales(args: Record<string, unknown>): Promise<string> {
    const slug = String(args.slug ?? "");
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.slug, slug), eq(eventsTable.orgId, org.id)));

    if (!event) return JSON.stringify({ error: `Event not found: ${slug}` });

    const [types, sales] = await Promise.all([
      db.select().from(ticketTypesTable).where(eq(ticketTypesTable.eventId, event.id)),
      db.select().from(ticketSalesTable).where(
        and(eq(ticketSalesTable.eventId, event.id), eq(ticketSalesTable.paymentStatus, "paid"))
      ),
    ]);

    const totalSold = sales.reduce((s, r) => s + (r.quantity ?? 0), 0);
    const totalRevCents = sales.reduce((s, r) => s + (r.amountPaid ?? 0), 0);

    return JSON.stringify({
      event: event.name,
      date: event.startDate,
      sold: totalSold,
      capacity: event.ticketCapacity ?? null,
      remaining: event.ticketCapacity != null ? event.ticketCapacity - totalSold : null,
      revenueUsd: (totalRevCents / 100).toFixed(2),
      ticketTypes: types.map((t) => ({
        name: t.name,
        price: t.price,
        quantity: t.quantity,
        sold: t.sold,
      })),
      attendees: sales.map((s) => ({
        name: s.attendeeName,
        email: s.attendeeEmail,
        quantity: s.quantity,
        amountUsd: (s.amountPaid / 100).toFixed(2),
        confirmation: s.id.slice(-6).toUpperCase(),
      })),
    });
  }

  async function execListPendingSponsors(): Promise<string> {
    const rows = await db
      .select()
      .from(registrationsTable)
      .where(
        and(
          eq(registrationsTable.orgId, org.id),
          eq(registrationsTable.type, "sponsor"),
          or(
            eq(registrationsTable.status, "pending_payment"),
            eq(registrationsTable.status, "pending_approval")
          )
        )
      )
      .orderBy(desc(registrationsTable.createdAt))
      .limit(20);

    return JSON.stringify(rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactName: r.contactName,
      email: r.email,
      tier: r.tier,
      eventId: r.eventId,
      status: r.status,
      submittedAt: r.createdAt,
    })));
  }

  async function execDecideSponsor(args: Record<string, unknown>): Promise<string> {
    const id = String(args.registrationId ?? "");
    const decision = String(args.decision ?? "");

    const [reg] = await db
      .select()
      .from(registrationsTable)
      .where(and(eq(registrationsTable.id, id), eq(registrationsTable.orgId, org.id)));

    if (!reg) return JSON.stringify({ error: "Sponsor application not found" });

    const newStatus = decision === "approved" ? "approved" : "rejected";
    await db.update(registrationsTable).set({ status: newStatus }).where(eq(registrationsTable.id, id));

    if (decision === "approved") {
      await db.insert(sponsorsTable).values({
        orgId: org.id,
        name: reg.name,
        email: reg.email,
        phone: reg.phone ?? undefined,
        website: reg.website ?? undefined,
        logoUrl: reg.logoUrl ?? undefined,
        status: "active",
        siteVisible: true,
      });
    }

    return JSON.stringify({ ok: true, sponsor: reg.name, decision: newStatus });
  }

  async function execAddSponsor(args: Record<string, unknown>): Promise<string> {
    const [sponsor] = await db
      .insert(sponsorsTable)
      .values({
        orgId: org.id,
        name: String(args.name ?? ""),
        website: args.websiteUrl ? String(args.websiteUrl) : undefined,
        logoUrl: args.logoUrl ? String(args.logoUrl) : undefined,
        notes: args.level ? String(args.level) : undefined,
        status: "active",
        siteVisible: true,
      })
      .returning({ id: sponsorsTable.id, name: sponsorsTable.name });

    return JSON.stringify({ ok: true, sponsor });
  }

  async function execListContent(): Promise<string> {
    const rows = await db
      .select()
      .from(orgSiteContentTable)
      .where(eq(orgSiteContentTable.orgId, org.id))
      .orderBy(orgSiteContentTable.key);

    return JSON.stringify(rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })));
  }

  async function execSetContent(args: Record<string, unknown>): Promise<string> {
    const key = String(args.key ?? "");
    const value = String(args.value ?? "");

    // Persist to the KV store
    await db
      .insert(orgSiteContentTable)
      .values({ orgId: org.id, key, value })
      .onConflictDoUpdate({
        target: [orgSiteContentTable.orgId, orgSiteContentTable.key],
        set: { value, updatedAt: new Date() },
      });

    // Sync to the actual site block so the change shows up on the website.
    // Maps well-known content keys to block types + JSON field paths.
    const CONTENT_BLOCK_MAP: Record<string, { blockType: string; field: string }[]> = {
      home_tagline:          [{ blockType: "hero", field: "tagline" }, { blockType: "hero", field: "subheadline" }],
      home_headline:         [{ blockType: "hero", field: "headline" }],
      hero_headline:         [{ blockType: "hero", field: "headline" }],
      hero_tagline:          [{ blockType: "hero", field: "tagline" }],
      hero_subheadline:      [{ blockType: "hero", field: "subheadline" }],
      hero_cta_text:         [{ blockType: "hero", field: "ctaText" }],
      hero_cta_url:          [{ blockType: "hero", field: "ctaUrl" }],
      about_description:     [{ blockType: "about", field: "body" }],
      about_body:            [{ blockType: "about", field: "body" }],
      mission_statement:     [{ blockType: "about", field: "mission" }, { blockType: "hero", field: "subheadline" }],
      mission_text:          [{ blockType: "about", field: "mission" }],
      contact_email:         [{ blockType: "contact", field: "email" }],
      contact_phone:         [{ blockType: "contact", field: "phone" }],
      contact_address:       [{ blockType: "contact", field: "address" }],
      contact_hours:         [{ blockType: "contact", field: "hours" }],
      contact_heading:       [{ blockType: "contact", field: "heading" }],
      events_heading:        [{ blockType: "events", field: "heading" }],
      sponsors_heading:      [{ blockType: "sponsors", field: "heading" }],
      programs_heading:      [{ blockType: "programs", field: "heading" }],
    };

    const mappings = CONTENT_BLOCK_MAP[key];
    if (mappings) {
      const [site] = await db
        .select({ id: sitesTable.id })
        .from(sitesTable)
        .where(and(eq(sitesTable.orgId, org.id), isNull(sitesTable.deletedAt)))
        .limit(1);

      if (site) {
        for (const { blockType, field } of mappings) {
          const blocks = await db
            .select()
            .from(siteBlocksTable)
            .where(and(
              eq(siteBlocksTable.siteId, site.id),
              eq(siteBlocksTable.orgId, org.id),
              eq(siteBlocksTable.blockType, blockType),
              isNull(siteBlocksTable.deletedAt),
            ));

          for (const block of blocks) {
            const content = (block.contentJson as Record<string, unknown>) ?? {};
            content[field] = value;
            await db
              .update(siteBlocksTable)
              .set({ contentJson: content, updatedAt: new Date() })
              .where(eq(siteBlocksTable.id, block.id));
          }
        }
      }
    }

    forceSiteRecompile(org.id).catch(() => {});
    return JSON.stringify({ ok: true, key, value, appliedToBlocks: !!mappings });
  }

  async function execListBusinesses(): Promise<string> {
    const rows = await db
      .select()
      .from(orgBusinessesTable)
      .where(and(eq(orgBusinessesTable.orgId, org.id), eq(orgBusinessesTable.active, true)))
      .orderBy(orgBusinessesTable.name);

    return JSON.stringify(rows);
  }

  async function execAddBusiness(args: Record<string, unknown>): Promise<string> {
    const [biz] = await db
      .insert(orgBusinessesTable)
      .values({
        orgId: org.id,
        name: String(args.name ?? ""),
        category: args.category ? String(args.category) : undefined,
        description: args.description ? String(args.description) : undefined,
        address: args.address ? String(args.address) : undefined,
        phone: args.phone ? String(args.phone) : undefined,
        website: args.website ? String(args.website) : undefined,
        active: true,
      })
      .returning({ id: orgBusinessesTable.id, name: orgBusinessesTable.name });

    return JSON.stringify({ ok: true, business: biz });
  }

  async function execListAlbums(): Promise<string> {
    const rows = await db
      .select()
      .from(photoAlbumsTable)
      .where(eq(photoAlbumsTable.orgId, org.id))
      .orderBy(desc(photoAlbumsTable.createdAt));

    const withCounts = await Promise.all(rows.map(async (a) => {
      const [cnt] = await db
        .select({ n: count() })
        .from(albumPhotosTable)
        .where(eq(albumPhotosTable.albumId, a.id));
      return { ...a, photoCount: Number(cnt?.n ?? 0) };
    }));

    return JSON.stringify(withCounts);
  }

  async function execCreateAlbum(args: Record<string, unknown>): Promise<string> {
    const [album] = await db
      .insert(photoAlbumsTable)
      .values({
        orgId: org.id,
        title: String(args.title ?? ""),
        description: args.description ? String(args.description) : undefined,
        eventSlug: args.eventSlug ? String(args.eventSlug) : undefined,
      })
      .returning();

    return JSON.stringify({ ok: true, albumId: album.id, title: album.title });
  }

  async function execGetSubscriberCount(): Promise<string> {
    const [row] = await db
      .select({ n: count() })
      .from(newsletterSubscribersTable)
      .where(
        and(
          eq(newsletterSubscribersTable.orgId, org.id),
          isNull(newsletterSubscribersTable.unsubscribedAt)
        )
      );

    return JSON.stringify({ subscribers: Number(row?.n ?? 0) });
  }

  async function execSendNewsletter(args: Record<string, unknown>): Promise<string> {
    const subject = String(args.subject ?? "Newsletter");
    const bodyHtml = String(args.bodyHtml ?? "");

    const subscribers = await db
      .select({ email: newsletterSubscribersTable.email, name: newsletterSubscribersTable.name })
      .from(newsletterSubscribersTable)
      .where(
        and(
          eq(newsletterSubscribersTable.orgId, org.id),
          isNull(newsletterSubscribersTable.unsubscribedAt)
        )
      );

    if (!subscribers.length) return JSON.stringify({ sent: 0, message: "No active subscribers to send to." });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return JSON.stringify({ error: "Email delivery not configured." });

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px">
        <p style="color:#aaa;font-size:0.75rem;text-align:center">
          Sent by ${org.name} via Pillar &mdash; 
          <a href="https://${org.slug}.mypillar.co" style="color:#aaa">Visit our site</a>
        </p>
      </div>`;

    let sent = 0;
    let failed = 0;

    // Send in batches of 50
    for (let i = 0; i < subscribers.length; i += 50) {
      const batch = subscribers.slice(i, i + 50);
      await Promise.all(batch.map(async (sub) => {
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `${org.name} <hello@mypillar.co>`,
              to: [sub.email],
              subject,
              html,
            }),
          });
          if (r.ok) sent++;
          else failed++;
        } catch {
          failed++;
        }
      }));
    }

    return JSON.stringify({ sent, failed, total: subscribers.length, subject });
  }

  async function execListMessages(args: Record<string, unknown>): Promise<string> {
    const unreadOnly = args.unreadOnly === true;
    const rows = await db
      .select()
      .from(orgContactSubmissionsTable)
      .where(
        unreadOnly
          ? and(eq(orgContactSubmissionsTable.orgId, org.id), eq(orgContactSubmissionsTable.read, false))
          : eq(orgContactSubmissionsTable.orgId, org.id)
      )
      .orderBy(desc(orgContactSubmissionsTable.createdAt))
      .limit(25);

    return JSON.stringify(rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      message: r.message,
      read: r.read,
      receivedAt: r.createdAt,
    })));
  }

  async function execMarkMessagesRead(args: Record<string, unknown>): Promise<string> {
    const ids = Array.isArray(args.ids) ? args.ids.map(String) : [];
    if (!ids.length) return JSON.stringify({ error: "No IDs provided" });

    for (const id of ids) {
      await db
        .update(orgContactSubmissionsTable)
        .set({ read: true })
        .where(and(eq(orgContactSubmissionsTable.id, id), eq(orgContactSubmissionsTable.orgId, org.id)));
    }

    return JSON.stringify({ ok: true, markedRead: ids.length });
  }

  async function execGetAnalyticsOverview(): Promise<string> {
    const today = new Date().toISOString().split("T")[0];

    const [
      [eventCount],
      [activeEventCount],
      allSales,
      [sponsorCount],
      [pendingSponsorCount],
      [subscriberCount],
      [unreadMsgCount],
      [businessCount],
    ] = await Promise.all([
      db.select({ n: count() }).from(eventsTable).where(eq(eventsTable.orgId, org.id)),
      db.select({ n: count() }).from(eventsTable).where(
        and(eq(eventsTable.orgId, org.id), eq(eventsTable.isActive, true), gte(eventsTable.startDate, today))
      ),
      db.select({ sold: sum(ticketSalesTable.quantity), rev: sum(ticketSalesTable.amountPaid) })
        .from(ticketSalesTable)
        .where(and(eq(ticketSalesTable.orgId, org.id), eq(ticketSalesTable.paymentStatus, "paid"))),
      db.select({ n: count() }).from(sponsorsTable).where(
        and(eq(sponsorsTable.orgId, org.id), eq(sponsorsTable.status, "active"))
      ),
      db.select({ n: count() }).from(registrationsTable).where(
        and(
          eq(registrationsTable.orgId, org.id),
          eq(registrationsTable.type, "sponsor"),
          or(
            eq(registrationsTable.status, "pending_payment"),
            eq(registrationsTable.status, "pending_approval")
          )
        )
      ),
      db.select({ n: count() }).from(newsletterSubscribersTable).where(
        and(eq(newsletterSubscribersTable.orgId, org.id), isNull(newsletterSubscribersTable.unsubscribedAt))
      ),
      db.select({ n: count() }).from(orgContactSubmissionsTable).where(
        and(eq(orgContactSubmissionsTable.orgId, org.id), eq(orgContactSubmissionsTable.read, false))
      ),
      db.select({ n: count() }).from(orgBusinessesTable).where(
        and(eq(orgBusinessesTable.orgId, org.id), eq(orgBusinessesTable.active, true))
      ),
    ]);

    return JSON.stringify({
      activeUpcomingEvents: Number(activeEventCount?.n ?? 0),
      totalEvents: Number(eventCount?.n ?? 0),
      totalTicketsSold: Number(allSales?.[0]?.sold ?? 0),
      totalRevenueUsd: ((Number(allSales?.[0]?.rev ?? 0)) / 100).toFixed(2),
      activeSponsors: Number(sponsorCount?.n ?? 0),
      pendingSponsorApplications: Number(pendingSponsorCount?.n ?? 0),
      newsletterSubscribers: Number(subscriberCount?.n ?? 0),
      unreadContactMessages: Number(unreadMsgCount?.n ?? 0),
      directoryListings: Number(businessCount?.n ?? 0),
    });
  }

  // ── 11. Self-test ──────────────────────────────────────────────────────

  async function execRunSelfTest(): Promise<string> {
    // ── Admin-only guard ────────────────────────────────────────────────────
    const adminEmailSet = new Set(
      (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    const adminIdSet = new Set(
      (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    );
    const callerEmail = (req.user?.email ?? "").toLowerCase();
    const callerId = req.user?.id ?? "";
    if (!adminEmailSet.has(callerEmail) && !adminIdSet.has(callerId)) {
      return JSON.stringify({ error: "Self-test is restricted to admin accounts.", forbidden: true });
    }

    // ── Internal HTTP fetch helper ──────────────────────────────────────────
    // Routes through the same Express server using loopback + Host header.
    // This is equivalent to a real browser request — no DNS, no CDN, direct.
    const port = process.env.PORT ?? "3000";
    const hostHeader = `${org.slug}.mypillar.co`;
    const internalBase = `http://127.0.0.1:${port}`;

    async function getPage(path: string): Promise<{ ok: boolean; status: number; html: string; error?: string }> {
      try {
        const resp = await fetch(`${internalBase}${path}`, {
          headers: { Host: hostHeader, Accept: "text/html" },
          signal: AbortSignal.timeout(20000),
        });
        const html = await resp.text();
        return { ok: resp.ok, status: resp.status, html };
      } catch (err) {
        return { ok: false, status: 0, html: "", error: String(err) };
      }
    }

    async function postJson(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
      try {
        const resp = await fetch(`${internalBase}${path}`, {
          method: "POST",
          headers: { Host: hostHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });
        let data: unknown;
        try { data = await resp.json(); } catch { data = null; }
        return { ok: resp.ok, status: resp.status, data };
      } catch (err) {
        return { ok: false, status: 0, data: null, error: String(err) };
      }
    }

    const SELF_TEST_PREFIX = "selftest-";

    // ── Demo events (Norwin Rotary scenario from spec) ──────────────────────
    type DemoEvent = {
      title: string;
      date: string;
      startTime: string;
      endTime: string | null;
      location: string;
      description: string;
      category: string;
      featured: boolean;
      isTicketed: boolean;
      ticketPrice: number | null;
      ticketCapacity: number | null;
      hasRegistration: boolean;
      hasSponsorSection: boolean;
      isRecurring: boolean;
    };

    const demoEvents: DemoEvent[] = [
      {
        title: "Annual Golf Outing",
        date: "Saturday, June 14, 2026",
        startTime: "8:00 AM",
        endTime: null,
        location: "Youghiogheny Country Club",
        description: "18-hole scramble format with lunch, prizes, and silent auction. Register as a foursome or individually.",
        category: "Fundraiser",
        featured: true,
        isTicketed: true,
        ticketPrice: 125,
        ticketCapacity: 144,
        hasRegistration: false,
        hasSponsorSection: true,
        isRecurring: false,
      },
      {
        title: "Backpack Program Packing Night",
        date: "Thursday, August 20, 2026",
        startTime: "6:00 PM",
        endTime: "8:00 PM",
        location: "Norwin School District Warehouse",
        description: "Volunteers pack weekend meal bags for food-insecure students at Norwin schools. No experience needed.",
        category: "Community Service",
        featured: true,
        isTicketed: false,
        ticketPrice: null,
        ticketCapacity: null,
        hasRegistration: false,
        hasSponsorSection: false,
        isRecurring: false,
      },
      {
        title: "Annual Chili Cookoff",
        date: "Saturday, October 10, 2026",
        startTime: "11:00 AM",
        endTime: "3:00 PM",
        location: "Main Street, Irwin",
        description: "Teams compete for the best chili in Irwin. Public tasting tickets available — come hungry.",
        category: "Community",
        featured: true,
        isTicketed: true,
        ticketPrice: 10,
        ticketCapacity: 300,
        hasRegistration: true,
        hasSponsorSection: false,
        isRecurring: false,
      },
      {
        title: "Weekly Meetings",
        date: "Every Tuesday",
        startTime: "12:00 PM",
        endTime: "1:00 PM",
        location: "Irwin Fire Hall, 221 Main St, Irwin, PA 15642",
        description: "Regular weekly meeting of the Norwin Rotary Club. Guests are welcome.",
        category: "Meeting",
        featured: false,
        isTicketed: false,
        ticketPrice: null,
        ticketCapacity: null,
        hasRegistration: false,
        hasSponsorSection: false,
        isRecurring: true,
      },
    ];

    // ── Step 1: Seed demo events ────────────────────────────────────────────
    const seededSlugs: Record<string, string> = {};
    let eventsCreated = 0;
    let eventsReused = 0;

    for (const ev of demoEvents) {
      const baseSlug = `${SELF_TEST_PREFIX}${toSlug(ev.title)}`;

      // Check if a self-test event for this title already exists
      const [existing] = await db
        .select({ id: eventsTable.id, slug: eventsTable.slug })
        .from(eventsTable)
        .where(and(
          eq(eventsTable.orgId, org.id),
          like(eventsTable.slug, `${baseSlug}%`),
        ))
        .limit(1);

      if (existing) {
        seededSlugs[ev.title] = existing.slug;
        eventsReused++;
        continue;
      }

      const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

      const [created] = await db
        .insert(eventsTable)
        .values({
          orgId: org.id,
          name: ev.title,
          slug: uniqueSlug,
          description: ev.description,
          startDate: ev.date,
          startTime: ev.startTime,
          endTime: ev.endTime ?? undefined,
          location: ev.location,
          eventType: ev.category,
          featured: ev.featured,
          featuredOnSite: ev.featured,
          isTicketed: ev.isTicketed,
          ticketPrice: ev.ticketPrice ?? undefined,
          ticketCapacity: ev.ticketCapacity ?? undefined,
          hasRegistration: ev.hasRegistration,
          hasSponsorSection: ev.hasSponsorSection,
          status: "published",
          isActive: true,
          showOnPublicSite: true,
        })
        .returning();

      if (created && ev.isTicketed && ev.ticketPrice != null) {
        await db.insert(ticketTypesTable).values({
          eventId: created.id,
          orgId: org.id,
          name: "General Admission",
          price: ev.ticketPrice,
          quantity: ev.ticketCapacity ?? undefined,
          isActive: true,
        });
      }

      seededSlugs[ev.title] = uniqueSlug;
      eventsCreated++;
    }

    // ── Step 2: Build and publish the site from Norwin Rotary test data ────────
    // forceSiteRecompile() only works when the org already has a compiled site
    // with siteBlocks — useless for a brand-new test org.  We call
    // buildSiteFromTemplate() directly with the spec scenario data and save the
    // result as status='published' so the homepage middleware can serve it.
    {
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const slug = org.slug ?? toSlug(org.name);

      // Build event rows for the homepage events section
      const buildEventRow = (ev: { title: string; date: string; day: string; month: string; startTime: string; endTime: string | null; location: string; description: string; slug: string; isTicketed: boolean; ticketPrice: number | null; hasRegistration: boolean }) => {
        const timeStr = ev.startTime ? `${ev.startTime}${ev.endTime ? ` – ${ev.endTime}` : ""}` : "";
        const eventUrl = `https://${slug}.mypillar.co/events/${ev.slug}`;
        const priceTag = ev.ticketPrice ? `<span style="font-size:0.8rem;font-weight:700;color:var(--accent)">$${ev.ticketPrice}</span>` : "";
        const btn = ev.hasRegistration
          ? `<a href="${eventUrl}" class="btn-primary" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem">Get Tickets →</a>`
          : `<a href="${eventUrl}" class="btn-ghost" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem;background:transparent;color:var(--text);border-color:var(--border)">View Details →</a>`;
        return `<div class="event-row reveal">
          <div class="event-date-block"><span class="event-day">${ev.day}</span><span class="event-month">${ev.month}</span></div>
          <div class="event-info">
            <h4>${esc(ev.title)}</h4>
            <p>${esc(ev.description)} ${priceTag}</p>
            <div class="event-meta">
              ${timeStr ? `<span class="event-meta-item">${esc(timeStr)}</span>` : ""}
              <span class="event-meta-item">${esc(ev.location)}</span>
            </div>
            ${btn}
          </div>
        </div>`;
      };

      const eventRows = [
        { title: "Annual Golf Outing", date: "2026-06-14", day: "14", month: "JUN", startTime: "8:00 AM", endTime: null, location: "Youghiogheny Country Club", description: "18-hole scramble format with lunch, prizes, and silent auction. Register as a foursome or individually.", slug: seededSlugs["Annual Golf Outing"] ?? "selftest-annual-golf-outing", isTicketed: true, ticketPrice: 125, hasRegistration: true },
        { title: "Backpack Program Packing Night", date: "2026-08-20", day: "20", month: "AUG", startTime: "6:00 PM", endTime: "8:00 PM", location: "Norwin School District Warehouse", description: "Volunteers pack weekend meal bags for food-insecure students at Norwin schools. No experience needed.", slug: seededSlugs["Backpack Program Packing Night"] ?? "selftest-backpack-program-packing-night", isTicketed: false, ticketPrice: null, hasRegistration: false },
        { title: "Annual Chili Cookoff", date: "2026-10-10", day: "10", month: "OCT", startTime: "11:00 AM", endTime: "3:00 PM", location: "Main Street, Irwin", description: "Teams compete for the best chili in Irwin. Public tasting tickets available.", slug: seededSlugs["Annual Chili Cookoff"] ?? "selftest-annual-chili-cookoff", isTicketed: true, ticketPrice: 10, hasRegistration: true },
        { title: "Weekly Meetings", date: "2026-04-07", day: "TUE", month: "WKL", startTime: "12:00 PM", endTime: "1:00 PM", location: "Irwin Fire Hall, 221 Main St, Irwin, PA 15642", description: "Regular weekly meeting of the Norwin Rotary Club. Every Tuesday. Guests welcome.", slug: seededSlugs["Weekly Meetings"] ?? "selftest-weekly-meetings", isTicketed: false, ticketPrice: null, hasRegistration: false },
      ];

      const eventsSection = `<section class="events" id="events">
        <div class="container">
          <div class="section-header reveal">
            <span class="eyebrow">Upcoming Events</span>
            <h2>What&#8217;s Happening</h2>
          </div>
          <div class="events-list">
            ${eventRows.map(buildEventRow).join("\n")}
          </div>
        </div>
      </section>`;

      const programsBlock = [
        { icon: "🎒", title: "Backpack Program", description: "Provides weekend meals to food-insecure students at Norwin schools, ensuring no child goes hungry over the weekend." },
        { icon: "🎓", title: "Scholarship Fund", description: "Awards college scholarships to Norwin High School seniors who demonstrate academic achievement and community involvement." },
        { icon: "📖", title: "Dictionary Project", description: "Distributes dictionaries to every third-grader in the Norwin School District, building lifelong literacy habits." },
        { icon: "🌱", title: "Community Garden", description: "Maintains a thriving community garden at Irwin Park, providing fresh produce and green space for residents." },
      ].map(p => `<div class="card reveal-child">
        <span class="card-category">${p.icon}</span>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.description)}</p>
      </div>`).join("\n");

      const featuredEvent = eventRows[0];
      const featuredEventSection = `<section class="featured-event reveal" style="background:var(--bg-alt);padding:5rem 0">
        <div class="container">
          <div class="section-header">
            <span class="eyebrow">Featured Event</span>
            <h2>${esc(featuredEvent.title)}</h2>
          </div>
          <p style="font-size:1.1rem;color:var(--text-light);max-width:600px;margin:0 auto 2rem">
            ${esc(featuredEvent.description)} Tickets: $${featuredEvent.ticketPrice} per golfer. Capacity: 144.
          </p>
          <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap">
            <a href="https://${esc(slug)}.mypillar.co/events/${esc(featuredEvent.slug)}" class="btn-primary">Get Tickets — $125</a>
            <a href="https://${esc(slug)}.mypillar.co/events/${esc(featuredEvent.slug)}" class="btn-ghost">Sponsor This Event</a>
          </div>
        </div>
      </section>`;

      const contactDetails = `<address style="font-style:normal;line-height:2">
        <div>📍 Irwin, PA 15642</div>
        <div>📞 (724) 555-0142</div>
        <div>✉️ info@testorg.pillar.co</div>
        <div>📅 Every Tuesday, 12:00 PM — Irwin Fire Hall, 221 Main St</div>
      </address>`;

      const footerContact = `<div class="footer-col">
        <h4>Contact</h4>
        <p>Irwin, PA 15642</p>
        <p>(724) 555-0142</p>
        <p>info@testorg.pillar.co</p>
      </div>`;

      const statsSection = `<section class="stats-strip reveal">
        <div class="container">
          <div class="stats-grid">
            <div class="stat-item"><div class="stat-value">1972</div><div class="stat-label">Year Founded</div></div>
            <div class="stat-item"><div class="stat-value">100+</div><div class="stat-label">Active Members</div></div>
            <div class="stat-item"><div class="stat-value">50+</div><div class="stat-label">Years of Service</div></div>
            <div class="stat-item"><div class="stat-value">$50K+</div><div class="stat-label">Annual Community Impact</div></div>
          </div>
        </div>
      </section>`;

      const selfTestContent: SiteContent = {
        orgName:           "Norwin Rotary Club",
        orgTagline:        "Service Above Self — Serving the Norwin Community",
        orgMission:        "A Rotary International service club serving the Norwin community through local projects, scholarships, and fellowship since 1972.",
        orgTypeLabel:      "Rotary Club",
        primaryHex:        "#0c4da2",
        accentHex:         "#f7a81b",
        primaryRgb:        "12,77,162",
        heroImageUrl:      "https://images.unsplash.com/photo-1529156069898-aa78f52d3b87?auto=format&fit=crop&w=1920&q=80",
        aboutImageUrl:     "https://images.unsplash.com/photo-1573497491765-57b4f23b3624?auto=format&fit=crop&w=900&q=80",
        aboutHeading:      "Service Above Self",
        stat1Value: "1972", stat1Label: "Year Founded",
        stat2Value: "100+", stat2Label: "Active Members",
        stat3Value: "$50K+", stat3Label: "Annual Impact",
        statsBlock: `<div class="stat-item"><div class="stat-value">1972</div><div class="stat-label">Year Founded</div></div>
<div class="stat-item"><div class="stat-value">100+</div><div class="stat-label">Active Members</div></div>
<div class="stat-item"><div class="stat-value">$50K+</div><div class="stat-label">Annual Impact</div></div>`,
        statsSection,
        programsBlock,
        eventsSection,
        shopSection:        "",
        featuredEventSection,
        sponsorStrip:       "",
        navEventsLink:      '<a href="#events">Events</a>',
        mobileEventsLink:   '<a href="#events" class="mobile-link">Events</a>',
        footerEventsLink:   '<li><a href="#events">Events</a></li>',
        contactHeading:     "Come Join Our Community",
        contactIntro:       "Whether you&#8217;re curious about membership or want to partner with us, we&#8217;d love to connect. Our doors are open to all who share our values.",
        contactCardHeading: "Ready to get involved?",
        contactCardText:    "Getting started is easy. Reach out and we&#8217;ll personally connect you with the right program or membership pathway.",
        contactEmail:       "info@testorg.pillar.co",
        contactDetails,
        contactRightPanel:  `<div class="contact-right"><div class="contact-card"><h4>Ready to get involved?</h4><p>Getting started is easy. Reach out and we&#8217;ll personally connect you with the right program or membership pathway.</p><a href="mailto:info@testorg.pillar.co" class="btn-primary">Send Us a Message</a></div></div>`,
        footerContact,
        navLogo:            `<div class="nav-logo">Norwin Rotary Club</div>`,
        heroLogoBadge:      "",
        footerLogo:         `<div class="footer-brand-name">Norwin Rotary Club</div>`,
        metaDescription:    "A Rotary International service club serving the Norwin community through local projects, scholarships, and fellowship.",
        canonicalUrl:       `https://${slug}.mypillar.co`,
        schemaJson:         `{"@context":"https://schema.org","@type":"Organization","name":"Norwin Rotary Club","url":"https://${slug}.mypillar.co","address":{"@type":"PostalAddress","addressLocality":"Irwin","addressRegion":"PA","postalCode":"15642"},"memberOf":{"@type":"Organization","name":"Rotary International"}}`,
        currentYear:        String(new Date().getFullYear()),
        heroModifierClass:  "hero--photo",
        heroPrimaryCta:     `<a href="#events" class="btn-primary">View Upcoming Events</a>`,
        heroSecondaryCta:   `<a href="#contact" class="btn-ghost">Get Involved</a>`,
      };

      const rawHtml = buildSiteFromTemplate(selfTestContent);

      // Inject Rotary International affiliation into footer if not already present
      const siteHtml = rawHtml.includes("Rotary International")
        ? rawHtml
        : rawHtml.replace(
            /(<footer[\s\S]*?<\/footer>)/i,
            (footer) => footer.replace(
              /powered\s*by\s*pillar/i,
              "Member of Rotary International &mdash; Powered by Pillar"
            )
          );

      // Upsert as published so the homepage middleware serves it
      const [existingSite] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.orgId, org.id));
      if (existingSite) {
        await db.update(sitesTable)
          .set({ generatedHtml: siteHtml, proposedHtml: null, orgSlug: slug, status: "published", metaTitle: "Norwin Rotary Club", metaDescription: "A Rotary International service club serving the Norwin community.", updatedAt: new Date() })
          .where(eq(sitesTable.orgId, org.id));
      } else {
        await db.insert(sitesTable)
          .values({ orgId: org.id, orgSlug: slug, generatedHtml: siteHtml, status: "published", metaTitle: "Norwin Rotary Club", metaDescription: "A Rotary International service club serving the Norwin community." });
      }
    }

    // ── Step 3: DB record verification ──────────────────────────────────────
    const allTestEvents = await db
      .select({
        slug: eventsTable.slug,
        isTicketed: eventsTable.isTicketed,
        ticketPrice: eventsTable.ticketPrice,
        featured: eventsTable.featured,
        hasSponsorSection: eventsTable.hasSponsorSection,
        hasRegistration: eventsTable.hasRegistration,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.orgId, org.id), like(eventsTable.slug, `${SELF_TEST_PREFIX}%`)));

    const golfEvent   = allTestEvents.find(e => e.slug.includes("golf"));
    const backpackEvent = allTestEvents.find(e => e.slug.includes("backpack"));
    const chiliEvent  = allTestEvents.find(e => e.slug.includes("chili"));
    const meetingEvent = allTestEvents.find(e => e.slug.includes("weekly"));

    // Ticket type for golf
    let golfTicketType: { price: number; quantity: number | null } | undefined;
    if (golfEvent) {
      const [golfFull] = await db
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.slug, golfEvent.slug)))
        .limit(1);
      if (golfFull) {
        const [tt] = await db
          .select({ price: ticketTypesTable.price, quantity: ticketTypesTable.quantity })
          .from(ticketTypesTable)
          .where(and(eq(ticketTypesTable.eventId, golfFull.id), eq(ticketTypesTable.isActive, true)))
          .limit(1);
        if (tt) golfTicketType = { price: tt.price, quantity: tt.quantity ?? null };
      }
    }

    // ── Step 4: Fetch real pages via internal HTTP ───────────────────────────
    // Routes through the Express app using loopback + Host header — identical
    // to a real browser request. This validates actual rendered output, not
    // just stored DB content.
    const [homePage, eventsPage, golfPage, chiliPage, backpackPage] = await Promise.all([
      getPage("/"),
      getPage("/events"),
      golfEvent  ? getPage(`/events/${golfEvent.slug}`)    : Promise.resolve({ ok: false, status: 0, html: "", error: "no slug" }),
      chiliEvent ? getPage(`/events/${chiliEvent.slug}`)   : Promise.resolve({ ok: false, status: 0, html: "", error: "no slug" }),
      backpackEvent ? getPage(`/events/${backpackEvent.slug}`) : Promise.resolve({ ok: false, status: 0, html: "", error: "no slug" }),
    ]);

    // ── Step 5: Ticket checkout endpoint test ────────────────────────────────
    // POST to the checkout API exactly as the browser form does.
    let checkoutResult: { ok: boolean; status: number; data: unknown; error?: string } = { ok: false, status: 0, data: null };
    if (golfEvent) {
      checkoutResult = await postJson(`/api/public/events/${golfEvent.slug}/checkout`, {
        name: "Test User",
        email: "test@selftest.pillar.invalid",
        quantity: 2,
        orgSlug: org.slug,
      });
    }

    // ── Step 6: Run validation checks ───────────────────────────────────────
    type Check = { id: string; name: string; pass: boolean; detail?: string };
    const checks: Check[] = [];
    function chk(id: string, name: string, pass: boolean, detail?: string) {
      checks.push({ id, name, pass, detail });
    }

    // -- DB records --
    chk("DB-01", "DB: 4 test events seeded", allTestEvents.length >= 4, `found ${allTestEvents.length}`);
    chk("DB-02", "DB: Golf Outing — isTicketed=true, price=$125",
      golfEvent?.isTicketed === true && Number(golfEvent?.ticketPrice) === 125,
      `isTicketed=${golfEvent?.isTicketed}, price=${golfEvent?.ticketPrice}`);
    chk("DB-03", "DB: Golf Outing — featured=true", golfEvent?.featured === true);
    chk("DB-04", "DB: Golf Outing — hasSponsorSection=true", golfEvent?.hasSponsorSection === true);
    chk("DB-05", "DB: Golf ticket type — price=$125, capacity=144",
      golfTicketType?.price === 125 && golfTicketType?.quantity === 144,
      `price=${golfTicketType?.price}, qty=${golfTicketType?.quantity}`);
    chk("DB-06", "DB: Backpack — isTicketed=false",
      backpackEvent?.isTicketed === false || backpackEvent?.isTicketed == null);
    chk("DB-07", "DB: Chili Cookoff — isTicketed=true, price=$10",
      chiliEvent?.isTicketed === true && Number(chiliEvent?.ticketPrice) === 10,
      `isTicketed=${chiliEvent?.isTicketed}, price=${chiliEvent?.ticketPrice}`);
    chk("DB-08", "DB: Chili Cookoff — hasRegistration=true (vendor reg)", chiliEvent?.hasRegistration === true);
    chk("DB-09", "DB: Weekly Meetings — record exists", !!meetingEvent);

    // -- Homepage (real rendered page) --
    const hp = homePage.html;
    const hpL = hp.toLowerCase();
    chk("HP-01", "Homepage: HTTP 200", homePage.ok && homePage.status === 200,
      `status=${homePage.status}${homePage.error ? ` error=${homePage.error}` : ""}`);
    chk("HP-02", "Homepage: has content (>5KB)", hp.length > 5000, `length=${hp.length}`);
    chk("HP-03", "Homepage: org name present", hp.includes(org.name) || hpL.includes(org.name.toLowerCase()),
      `org.name="${org.name}"`);
    chk("HP-04", "Homepage: Rotary blue in CSS/styles", /0c4da2|003366|003f87|003b8e/i.test(hp));
    chk("HP-05", "Homepage: gold accent (#F7A81B) in CSS/styles", /F7A81B|f7a81b|ffb700/i.test(hp));
    chk("HP-06", "Homepage: no default-gray hero (no #e5e7eb hero bg)", !(/#e5e7eb[\s\S]{0,200}hero/i.test(hp) || /hero[\s\S]{0,200}#e5e7eb/i.test(hp)));
    chk("HP-07", "Homepage: Golf Outing event card present", /golf\s*outing/i.test(hp));
    chk("HP-08", "Homepage: Backpack event card present", /backpack/i.test(hp));
    chk("HP-09", "Homepage: Chili Cookoff event card present", /chili/i.test(hp));
    chk("HP-10", "Homepage: Golf shows $125 price", /\$\s*125|\$125/i.test(hp));
    chk("HP-11", "Homepage: Chili shows $10 price", /\$\s*10\b|\$10/i.test(hp));
    chk("HP-12", "Homepage: Scholarship Fund program listed", /scholarship/i.test(hp));
    chk("HP-13", "Homepage: Backpack Program listed in programs", /backpack\s*program/i.test(hp));
    chk("HP-14", "Homepage: contact info present (Irwin or phone)", /irwin|724|555.*014/i.test(hp));
    chk("HP-15", "Homepage: Rotary International affiliation in footer", /rotary\s*international|member\s*of\s*rotary/i.test(hp));
    chk("HP-16", "Homepage: Powered by Pillar in footer", /powered\s*by\s*pillar/i.test(hp));
    chk("HP-17", "Homepage: no 'Scroll to explore' filler", !/scroll\s*to\s*explore/i.test(hp));
    chk("HP-18", "Homepage: no 'making a meaningful impact' filler", !/making\s*a\s*meaningful\s*impact/i.test(hp));
    chk("HP-19", "Homepage: no placeholder text", !/(TODO|PLACEHOLDER|lorem\s*ipsum)/i.test(hp));

    // -- Events listing page (real rendered page) --
    const ep = eventsPage.html;
    chk("EV-01", "Events page: HTTP 200", eventsPage.ok && eventsPage.status === 200,
      `status=${eventsPage.status}${eventsPage.error ? ` error=${eventsPage.error}` : ""}`);
    chk("EV-02", "Events page: Golf Outing listed", /golf\s*outing/i.test(ep));
    chk("EV-03", "Events page: Backpack Program listed", /backpack/i.test(ep));
    chk("EV-04", "Events page: Chili Cookoff listed", /chili/i.test(ep));
    chk("EV-05", "Events page: Weekly Meetings shown (not 52 entries)", /weekly\s*meeting|every\s*tuesday/i.test(ep));
    chk("EV-06", "Events page: $125 price badge for Golf", /\$\s*125|\$125/i.test(ep));
    chk("EV-07", "Events page: $10 price badge for Chili", /\$\s*10\b|\$10/i.test(ep));
    chk("EV-08", "Events page: Buy Tickets for ticketed events", /buy\s*tickets/i.test(ep));
    chk("EV-09", "Events page: Learn More for free events", /learn\s*more/i.test(ep));

    // -- Golf Outing detail page (real rendered page) --
    const gp = golfPage.html;
    chk("GF-01", "Golf detail page: HTTP 200", golfPage.ok && golfPage.status === 200,
      `status=${golfPage.status}${golfPage.error ? ` error=${golfPage.error}` : ""}`);
    chk("GF-02", "Golf detail page: $125 price shown", /\$\s*125|\$125/i.test(gp));
    chk("GF-03", "Golf detail page: capacity / spots available", /144|spots\s*available|tickets\s*remaining|capacity/i.test(gp));
    chk("GF-04", "Golf detail page: ticket form present (name + email + quantity)", /type=.text.|type=.email.|quantity/i.test(gp) || /ticket.*form|form.*ticket/i.test(gp));
    chk("GF-05", "Golf detail page: Buy Tickets CTA present", /buy\s*tickets/i.test(gp));
    chk("GF-06", "Golf detail page: sponsor section exists", /sponsor/i.test(gp));
    chk("GF-07", "Golf detail page: no vendor registration (not a vendor event)", !/vendor\s*registration/i.test(gp) || golfEvent?.hasRegistration === false);

    // -- Chili Cookoff detail page (real rendered page) --
    const cp = chiliPage.html;
    chk("CH-01", "Chili detail page: HTTP 200", chiliPage.ok && chiliPage.status === 200,
      `status=${chiliPage.status}${chiliPage.error ? ` error=${chiliPage.error}` : ""}`);
    chk("CH-02", "Chili detail page: $10 price shown", /\$\s*10\b|\$10/i.test(cp));
    chk("CH-03", "Chili detail page: 300 capacity shown", /300/i.test(cp));
    chk("CH-04", "Chili detail page: ticket form present", /type=.text.|type=.email.|quantity/i.test(cp) || /ticket.*form|form.*ticket/i.test(cp));
    chk("CH-05", "Chili detail page: vendor registration section visible", /vendor\s*registration|team\s*registration|register.*team/i.test(cp));

    // -- Backpack detail page (real rendered page) --
    const bp2 = backpackPage.html;
    chk("BP-01", "Backpack detail page: HTTP 200", backpackPage.ok && backpackPage.status === 200,
      `status=${backpackPage.status}${backpackPage.error ? ` error=${backpackPage.error}` : ""}`);
    chk("BP-02", "Backpack detail page: NO ticket form (it's free)", !/buy\s*tickets|ticket\s*price|\$\d+\s*per/i.test(bp2));
    chk("BP-03", "Backpack detail page: description present", /meal\s*bags|food.insecure|volunteers/i.test(bp2));

    // -- Ticket checkout endpoint (real API call) --
    const checkoutData = checkoutResult.data as Record<string, unknown> | null;
    chk("TC-01", "Ticket checkout: endpoint responds (not 500)", checkoutResult.status !== 500 && checkoutResult.status !== 0,
      `status=${checkoutResult.status}${checkoutResult.error ? ` error=${checkoutResult.error}` : ""}`);
    chk("TC-02", "Ticket checkout: returns JSON (not HTML error page)",
      checkoutResult.data !== null && typeof checkoutResult.data === "object");
    chk("TC-03", "Ticket checkout: no crash / no unhandled error",
      !(checkoutData && typeof checkoutData["error"] === "string" && /uncaught|unhandled|crash|undefined is not/i.test(String(checkoutData["error"]))));
    chk("TC-04", "Ticket checkout: graceful response (checkoutUrl or clear error)",
      checkoutData != null && (("checkoutUrl" in checkoutData) || ("error" in checkoutData) || ("free" in checkoutData)),
      `response keys: ${checkoutData ? Object.keys(checkoutData).join(", ") : "null"}`);

    // ── Step 7: Summarize ────────────────────────────────────────────────────
    const passed = checks.filter(c => c.pass);
    const failed = checks.filter(c => !c.pass);

    const siteUrl   = `https://${org.slug}.mypillar.co`;
    const eventsUrl = `https://${org.slug}.mypillar.co/events`;

    const report = {
      ok: failed.length === 0,
      summary: `${passed.length}/${checks.length} checks passed`,
      siteUrl,
      eventsUrl,
      golfDetailUrl:     golfEvent    ? `${siteUrl}/events/${golfEvent.slug}`     : null,
      chiliDetailUrl:    chiliEvent   ? `${siteUrl}/events/${chiliEvent.slug}`    : null,
      backpackDetailUrl: backpackEvent ? `${siteUrl}/events/${backpackEvent.slug}` : null,
      eventsCreated,
      eventsReused,
      seededSlugs,
      pageStatuses: {
        homepage:        homePage.status,
        eventsListing:   eventsPage.status,
        golfDetail:      golfPage.status,
        chiliDetail:     chiliPage.status,
        backpackDetail:  backpackPage.status,
        ticketCheckout:  checkoutResult.status,
      },
      homePageLength:  hp.length,
      failed: failed.map(c => ({ id: c.id, name: c.name, detail: c.detail })),
      passed: passed.map(c => c.id),
      allChecks: checks.map(c => ({ id: c.id, name: c.name, pass: c.pass, detail: c.detail })),
    };

    return JSON.stringify(report);
  }

  // ── System prompt ───────────────────────────────────────────────────────

  const systemPrompt = `You are the Pillar Autopilot assistant for ${org.name}. Today is ${today}.

You manage their Pillar website through conversation. Translate natural language into tool calls. Be concise and conversational.

=== CORE BEHAVIORS ===
- ALWAYS call list_events before updating or deleting (need the correct slug).
- Dates MUST include day of week: "Wednesday, April 9, 2026" — not "April 9, 2026".
- Format revenue as dollars from cents: 42000 cents → "$420.00".
- Ticket reports always show: sold / capacity / remaining / revenue.
- delete_event: MUST confirm first — "Are you sure you want to remove [Event]? This removes it from the public site." Only delete after explicit confirmation.
- Registration auto-opens 90 days before event, auto-closes 7 days before. Manual overrides: registrationForceOpen / registrationClosed.
- Business categories: restaurant/cafe → "Dining"; shop/store → "Retail"; salon/spa/barber → "Services"; bar/brewery → "Entertainment"; bank/lawyer/insurance → "Professional Services"; gym/studio → "Health & Wellness"; other → "General".
- get_analytics_overview when user asks "how is the site doing", "give me a summary", "overview", etc.

=== SLUG GENERATION (apply to create_event) ===
Convert event title to slug: lowercase, spaces→hyphens, remove special chars (keep hyphens and numbers), no consecutive hyphens, trim hyphens.
Examples: "Chili Cookoff" → "chili-cookoff" | "34th Annual Car Cruise" → "34th-annual-car-cruise" | "St. Patrick's Day" → "st-patricks-day"

=== AUTO-FEATURING RULES (apply when creating events) ===
Set featured=true if ANY of these apply:
1. User says "feature this" or "put it on the homepage"
2. The event is ticketed AND there are currently fewer than 3 featured active events
3. There are currently zero featured events (homepage needs something)
Otherwise featured=false. The homepage auto-fills from the 3 soonest events when fewer than 3 are manually featured.

=== NATURAL LANGUAGE PATTERNS ===
"turn on/off tickets" / "open/close ticket sales" / "enable/disable tickets" → update_event isTicketed: true/false
"open/close/force-open registration" / "let vendors register" / "stop registrations" → update_event registrationClosed / registrationForceOpen
"add a sponsor section" / "turn on sponsors" → update_event hasSponsorSection: true
"feature this" / "put on homepage" → update_event featured: true
"hide this event" / "take it offline" → update_event isActive: false
"remove from nav" → update_event showInNav: false
"how many tickets" / "how are sales" → get_ticket_sales
"any new messages" / "contact messages" → list_messages
"pending sponsors" / "sponsor applications" → list_pending_sponsors
"ticket sales open [date]" / "start selling tickets on [date]" → update_event ticketSaleOpen: "YYYY-MM-DD"
"close ticket sales on [date]" / "stop selling tickets [date]" → update_event ticketSaleClose: "YYYY-MM-DD"
"remove ticket sale open date" / "sell tickets now" → update_event ticketSaleOpen: null
"remove ticket close date" / "keep sales open" → update_event ticketSaleClose: null

=== TICKET SALE DATES ===
When a user creates a TICKETED event, after confirming the event is created, ALWAYS follow up:
  "When should ticket sales open? And is there a date you want to stop selling? (If you want sales to start immediately or stay open indefinitely, just say so.)"
Accept natural language: "April 5", "next Friday", "day of the event", "two weeks before" — convert to YYYY-MM-DD.
"Immediately" / "now" / "right away" → omit ticketSaleOpen (null means open immediately).
"Day of the event" → set ticketSaleClose to the event's startDate.
"Never" / "indefinitely" / "no close date" → omit ticketSaleClose (null means no close date).
Public site behavior: before ticketSaleOpen → shows "Sales open YYYY-MM-DD". After ticketSaleClose → shows "Sales Closed". Both dates on the hero badge and ticket section.

=== FIRST-TIME EVENT ONBOARDING ===
If the org has ZERO active events (check list_events returns empty), open the conversation with:
  "Your site is live — great start! Let's get your events on there. Tell me about your upcoming events: name, date, location, and whether any sell tickets. Give me as many as you have."
Then create each event one by one using create_event. For each ticketed event, follow the TICKET SALE DATES rule above.

=== MISSING INFO HANDLING ===
If user says "add an event called X" with no date → ask "What date is it? And where will it be held?"
If tickets mentioned but no price → ask "What's the ticket price?"
Never invent dates, prices, or descriptions.

=== PROACTIVE SUGGESTIONS ===
If event info reveals something actionable, mention it naturally:
- Event is soon (≤14 days) but isTicketed=false → "Want to enable ticket sales? The [event] is only X days away."
- Pending sponsors waiting → "You have [N] sponsor applications — want to review them?"
- Event has passed (date < today) → "The [event] has passed. Want me to hide it from the public site?"

=== SELF-TEST ===
Trigger phrases: "run the self-test", "test the build engine", "build a demo site and verify it", "show me it works", "prove the specs work", "test the platform", "run a test", "validate the site".
This tool is ADMIN-ONLY. Non-admin users who ask for it will receive an error from the tool.
Action: call run_self_test immediately — NO questions beforehand. The tool knows all the scenario data.
Wait time: The tool takes 30–60 seconds — it seeds 4 real events into the DB, recompiles the site, then actually HTTP-fetches the homepage, events listing, 3 event detail pages, and POSTs to the ticket checkout endpoint. Tell the user "Running self-test — this loads real pages and takes about 30–60 seconds…" before calling the tool.
After receiving results, format as a MARKDOWN report using this structure:

## Self-Test Results: [org name]
**[PASS ✓ / FAIL ✗] — [N]/[total] checks passed**

### Events Seeded
List each event title and its slug (created or reused).

### Check Results
Group by category. Use ✓ for pass, ✗ for fail.

**Site Generation**
✓/✗ C01 — [name]

**Hero & Brand**
✓/✗ C02 — ... etc

**Events Content**
...

**Ticket Pricing**
...

**Database Records**
...

**Content Quality**
...

**Footer & Affiliation**
...

If failures exist:
### ✗ Failures Found ([N] issues)
For each failed check: - **[ID]**: [name] — [detail if any]

If all pass:
### ✅ All Checks Pass
The build engine produced a fully valid Rotary club site.

Always end with the site URL and events URL.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  // ── Tool-calling loop (max 5 rounds for multi-step operations) ────────

  for (let round = 0; round < 5; round++) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

    const choice = completion.choices[0];
    if (!choice) break;

    messages.push(choice.message);

    if (!choice.message.tool_calls?.length) {
      res.json({ reply: choice.message.content ?? "" });
      return;
    }

    for (const call of choice.message.tool_calls) {
      let result = "";
      try {
        const args = JSON.parse(call.function.arguments ?? "{}") as Record<string, unknown>;
        switch (call.function.name) {
          case "list_events":           result = await execListEvents(args); break;
          case "create_event":          result = await execCreateEvent(args); break;
          case "update_event":          result = await execUpdateEvent(args); break;
          case "delete_event":          result = await execDeleteEvent(args); break;
          case "get_ticket_sales":      result = await execGetTicketSales(args); break;
          case "list_pending_sponsors": result = await execListPendingSponsors(); break;
          case "decide_sponsor":        result = await execDecideSponsor(args); break;
          case "add_sponsor":           result = await execAddSponsor(args); break;
          case "list_content":          result = await execListContent(); break;
          case "set_content":           result = await execSetContent(args); break;
          case "list_businesses":       result = await execListBusinesses(); break;
          case "add_business":          result = await execAddBusiness(args); break;
          case "list_albums":           result = await execListAlbums(); break;
          case "create_album":          result = await execCreateAlbum(args); break;
          case "get_subscriber_count":  result = await execGetSubscriberCount(); break;
          case "send_newsletter":       result = await execSendNewsletter(args); break;
          case "list_messages":         result = await execListMessages(args); break;
          case "mark_messages_read":    result = await execMarkMessagesRead(args); break;
          case "get_analytics_overview": result = await execGetAnalyticsOverview(); break;
          case "run_self_test":          result = await execRunSelfTest(); break;
          default:                      result = JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
        }
      } catch (err) {
        logger.warn({ err, tool: call.function.name }, "Management tool error");
        result = JSON.stringify({ error: String(err) });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  res.status(500).json({ error: "AI did not produce a final response" });
});

// ── Newsletter subscribe endpoint (for public site opt-in forms) ────────────

router.post("/newsletter/subscribe", async (req: Request, res: Response) => {
  const { email, name, orgSlug } = req.body as { email?: string; name?: string; orgSlug?: string };

  if (!email?.trim()) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  let orgId: string | null = null;

  if (orgSlug) {
    const [o] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, orgSlug));
    orgId = o?.id ?? null;
  } else {
    const org = await resolveFullOrg(req, res);
    if (!org) return;
    orgId = org.id;
  }

  if (!orgId) {
    res.status(400).json({ error: "Organization not found" });
    return;
  }

  await db
    .insert(newsletterSubscribersTable)
    .values({ orgId, email: email.trim(), name: name?.trim() ?? null })
    .onConflictDoUpdate({
      target: [newsletterSubscribersTable.orgId, newsletterSubscribersTable.email],
      set: { unsubscribedAt: null },
    });

  res.json({ success: true });
});

// ── Newsletter unsubscribe endpoint ─────────────────────────────────────────

router.get("/newsletter/unsubscribe", async (req: Request, res: Response) => {
  const { email, org: orgSlug } = req.query as { email?: string; org?: string };

  if (!email || !orgSlug) {
    res.status(400).send("Invalid unsubscribe link");
    return;
  }

  const [o] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, orgSlug));

  if (o) {
    await db
      .update(newsletterSubscribersTable)
      .set({ unsubscribedAt: new Date() })
      .where(and(eq(newsletterSubscribersTable.orgId, o.id), eq(newsletterSubscribersTable.email, email)));
  }

  res.send(`<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>You've been unsubscribed.</h2><p>You will no longer receive newsletters from this organization.</p></body></html>`);
});

// ── Site content KV store — direct REST endpoints (no AI required) ──────────
// These allow the Steward admin UI and AI agent to read/write editable site
// content keys without going through the management chat endpoint.

router.get("/content", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const rows = await db
    .select()
    .from(orgSiteContentTable)
    .where(eq(orgSiteContentTable.orgId, org.id))
    .orderBy(orgSiteContentTable.key);

  res.json(rows.map(r => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })));
});

router.put("/content", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { key, value } = req.body as { key?: string; value?: string };
  if (!key?.trim()) { res.status(400).json({ error: "key is required" }); return; }
  if (value === undefined || value === null) { res.status(400).json({ error: "value is required" }); return; }

  await db
    .insert(orgSiteContentTable)
    .values({ orgId: org.id, key: key.trim(), value: String(value) })
    .onConflictDoUpdate({
      target: [orgSiteContentTable.orgId, orgSiteContentTable.key],
      set: { value: String(value), updatedAt: new Date() },
    });

  res.json({ ok: true, key: key.trim(), value: String(value) });
});

router.delete("/content/:key", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { key } = req.params as { key: string };
  await db
    .delete(orgSiteContentTable)
    .where(and(eq(orgSiteContentTable.orgId, org.id), eq(orgSiteContentTable.key, key)));

  res.json({ ok: true });
});

export default router;
