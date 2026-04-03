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
} from "@workspace/db";
import { eq, and, gte, sum, count, isNull, desc, or } from "drizzle-orm";
import OpenAI from "openai";
import { resolveFullOrg } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";
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

router.post("/chat", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

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

    scheduleSiteAutoUpdate(org.id).catch(() => {});

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

    scheduleSiteAutoUpdate(org.id).catch(() => {});
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

    scheduleSiteAutoUpdate(org.id).catch(() => {});
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

    await db
      .insert(orgSiteContentTable)
      .values({ orgId: org.id, key, value })
      .onConflictDoUpdate({
        target: [orgSiteContentTable.orgId, orgSiteContentTable.key],
        set: { value, updatedAt: new Date() },
      });

    scheduleSiteAutoUpdate(org.id).catch(() => {});
    return JSON.stringify({ ok: true, key, value });
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

  // ── System prompt ───────────────────────────────────────────────────────

  const systemPrompt = `You are the Pillar management assistant for ${org.name}. Today is ${today}.

You help the org admin manage their Pillar website through conversation. Translate natural language requests into the appropriate tool calls.

Key behaviors:
- ALWAYS call list_events first before updating or deleting an event, so you have the correct slug.
- When creating events, include day of week in dates (e.g. "Wednesday, April 9, 2026").
- Format revenue as dollars (e.g. "$420.00").
- Always show sold/capacity/remaining for ticket sales.
- For delete_event: you MUST get explicit user confirmation before calling it. Ask "Are you sure you want to remove [event name]? This will remove it from the public site." Only call delete_event after they confirm.
- Registration auto-opens 90 days before and auto-closes 7 days before the event. Manual overrides use registrationForceOpen and registrationClosed via update_event.
- Infer business category from description: restaurant/cafe → "Dining"; shop/store → "Retail"; salon/spa → "Services"; bar/brewery → "Entertainment"; bank/lawyer → "Professional Services"; gym/fitness → "Health & Wellness"; other → "General".
- When a user asks about analytics or "how is the site doing", call get_analytics_overview.
- Be concise and conversational. Use plain language.`;

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
