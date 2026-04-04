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

    // ── 6. Business directory ───────────────────────────────────────────
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

    // ── Step 2: Force site recompile ────────────────────────────────────────
    await forceSiteRecompile(org.id);
    // Give compileSite time to finish (it's sync inside the call but may need I/O)
    await new Promise<void>((r) => setTimeout(r, 4000));

    // ── Step 3: Fetch compiled HTML ─────────────────────────────────────────
    const [siteRow] = await db
      .select({ generatedHtml: sitesTable.generatedHtml })
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, org.id), isNull(sitesTable.deletedAt)))
      .limit(1);

    const html = siteRow?.generatedHtml ?? "";
    const htmlLower = html.toLowerCase();

    // ── Step 4: Validation checks ───────────────────────────────────────────
    type Check = { id: string; name: string; pass: boolean; detail?: string };
    const checks: Check[] = [];

    function chk(id: string, name: string, pass: boolean, detail?: string) {
      checks.push({ id, name, pass, detail });
    }

    // ── HTML was generated ──────────────────────────────────────────────────
    chk("C01", "Site HTML generated", html.length > 1000, `HTML length: ${html.length} chars`);

    // ── Hero / brand identity ───────────────────────────────────────────────
    chk("C02", "Hero: org name in page", html.includes(org.name) || htmlLower.includes(org.name.toLowerCase()));
    chk("C03", "Brand: Rotary blue (#003366) present", /003366/i.test(html), "Rotary parent org requires #003366");
    chk("C04", "Brand: Gold accent (#F7A81B or #ffb700) present", /F7A81B|f7a81b|FFB700|ffb700|F7A800/i.test(html), "Rotary gold required");
    chk("C05", "No default gray hero", !(/#e5e7eb|#d1d5db|bg-gray-200|bg-gray-300/i.test(html) && /hero|banner/i.test(html)), "Hero should use brand color, not default gray");

    // ── Events ─────────────────────────────────────────────────────────────
    chk("C06", "Golf Outing event present", /golf\s*outing/i.test(html));
    chk("C07", "Backpack Program event present", /backpack/i.test(html));
    chk("C08", "Chili Cookoff event present", /chili/i.test(html));
    chk("C09", "Weekly Meetings / recurring event present", /weekly\s*meeting|every\s*tuesday/i.test(html));

    // ── Ticket pricing ──────────────────────────────────────────────────────
    chk("C10", "Golf Outing $125 price displayed", /\$125|125.*golfer|125.*ticket/i.test(html));
    chk("C11", "Chili Cookoff $10 price displayed", /\$10\b|10.*taster|10.*ticket/i.test(html));
    chk("C12", "Free event has no price badge (Backpack)", !(/backpack[\s\S]{0,400}\$\d/i.test(html) && /\$\d[\s\S]{0,400}backpack/i.test(html)));

    // ── DB: event records ───────────────────────────────────────────────────
    const allTestEvents = await db
      .select({ slug: eventsTable.slug, isTicketed: eventsTable.isTicketed, ticketPrice: eventsTable.ticketPrice, featured: eventsTable.featured, hasSponsorSection: eventsTable.hasSponsorSection, hasRegistration: eventsTable.hasRegistration })
      .from(eventsTable)
      .where(and(eq(eventsTable.orgId, org.id), like(eventsTable.slug, `${SELF_TEST_PREFIX}%`)));

    const golfEvent = allTestEvents.find(e => e.slug.includes("golf"));
    const backpackEvent = allTestEvents.find(e => e.slug.includes("backpack"));
    const chiliEvent = allTestEvents.find(e => e.slug.includes("chili"));
    const meetingEvent = allTestEvents.find(e => e.slug.includes("weekly"));

    chk("C13", "DB: Golf Outing record exists", !!golfEvent);
    chk("C14", "DB: Golf Outing isTicketed=true, price=$125", golfEvent?.isTicketed === true && Number(golfEvent?.ticketPrice) === 125, `isTicketed=${golfEvent?.isTicketed}, price=${golfEvent?.ticketPrice}`);
    chk("C15", "DB: Golf Outing featured=true", golfEvent?.featured === true);
    chk("C16", "DB: Golf Outing hasSponsorSection=true", golfEvent?.hasSponsorSection === true);
    chk("C17", "DB: Backpack record exists", !!backpackEvent);
    chk("C18", "DB: Backpack isTicketed=false (free event)", backpackEvent?.isTicketed === false || backpackEvent?.isTicketed == null);
    chk("C19", "DB: Chili Cookoff record exists", !!chiliEvent);
    chk("C20", "DB: Chili Cookoff isTicketed=true, price=$10", chiliEvent?.isTicketed === true && Number(chiliEvent?.ticketPrice) === 10, `isTicketed=${chiliEvent?.isTicketed}, price=${chiliEvent?.ticketPrice}`);
    chk("C21", "DB: Chili Cookoff hasRegistration=true (vendor reg)", chiliEvent?.hasRegistration === true);
    chk("C22", "DB: Weekly Meetings record exists", !!meetingEvent);

    // ── Ticket types in DB ──────────────────────────────────────────────────
    if (golfEvent) {
      const [golfEventFull] = await db
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.slug, golfEvent.slug)))
        .limit(1);
      if (golfEventFull) {
        const [tt] = await db
          .select({ price: ticketTypesTable.price, quantity: ticketTypesTable.quantity })
          .from(ticketTypesTable)
          .where(and(eq(ticketTypesTable.eventId, golfEventFull.id), eq(ticketTypesTable.isActive, true)))
          .limit(1);
        chk("C23", "DB: Golf ticket type price=$125, capacity=144", tt?.price === 125 && tt?.quantity === 144, `price=${tt?.price}, qty=${tt?.quantity}`);
      } else {
        chk("C23", "DB: Golf ticket type price=$125, capacity=144", false, "Golf event not found by ID");
      }
    } else {
      chk("C23", "DB: Golf ticket type price=$125, capacity=144", false, "Golf event not found");
    }

    // ── Content quality ─────────────────────────────────────────────────────
    const fillerPhrases = [
      "scroll to explore",
      "making a meaningful impact",
      "bringing people together",
      "lasting connection",
      "vite app",
      "lorem ipsum",
    ];
    for (const filler of fillerPhrases) {
      chk(`FILLER-${filler.substring(0, 10)}`, `No filler: "${filler}"`, !htmlLower.includes(filler.toLowerCase()));
    }

    // ── Footer / affiliation ────────────────────────────────────────────────
    chk("C24", "Footer: Rotary International affiliation mentioned", /rotary\s*international|member\s*of\s*rotary/i.test(html));
    chk("C25", "Footer: Powered by Pillar", /powered\s*by\s*pillar/i.test(html));
    chk("C26", "Footer is dark (navy/black bg)", /footer[\s\S]{0,500}(#1[a-f0-9]{5}|#0{6}|#003|bg-navy|bg-dark|navy|#00003|dark.*footer)/i.test(html) || /#003366[\s\S]{0,800}footer/i.test(html));

    // ── Programs / about ────────────────────────────────────────────────────
    chk("C27", "Programs: Backpack Program listed", /backpack\s*program/i.test(html));
    chk("C28", "Programs: Scholarship Fund listed", /scholarship/i.test(html));
    chk("C29", "About: org description present", /service\s*club|rotary|irwin|norwin/i.test(html));

    // ── Contact / metadata ──────────────────────────────────────────────────
    chk("C30", "Contact: address or location present", /irwin|PA\s*15642|main\s*st/i.test(html));
    chk("C31", "No raw placeholder text", !/(TODO|PLACEHOLDER|INSERT.*HERE|your.*email.*here)/i.test(html));

    // ── Step 5: Summarize ───────────────────────────────────────────────────
    const passed = checks.filter(c => c.pass);
    const failed = checks.filter(c => !c.pass);

    const report = {
      ok: failed.length === 0,
      summary: `${passed.length}/${checks.length} checks passed`,
      eventsCreated,
      eventsReused,
      seededSlugs,
      siteUrl: `https://${org.slug}.mypillar.co`,
      eventsUrl: `https://${org.slug}.mypillar.co/events`,
      htmlLength: html.length,
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
Action: call run_self_test immediately — NO questions beforehand. The tool knows all the scenario data.
Wait time: The tool takes ~5–10 seconds (it seeds events + recompiles the site). Tell the user it's running.
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

export default router;
