import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db,
  eventsTable,
  organizationsTable,
  sitesTable,
  ticketTypesTable,
  ticketSalesTable,
  eventApprovalsTable,
  eventCommunicationsTable,
  eventWaitlistTable,
  recurringEventTemplatesTable,
  eventSponsorsTable,
  sponsorsTable,
} from "@workspace/db";
import { eq, and, asc, desc, gte, sum, sql } from "drizzle-orm";
import OpenAI from "openai";
import { refreshSiteEventsSection } from "./sites";
import { resolveFullOrg, getFullOrgForUser } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";
import { createOpenAIClient } from "../lib/openaiClient";
import {
  syncCreateEventToPillar,
  syncUpdateEventToPillar,
  syncDeleteEventToPillar,
} from "../lib/pillarEventSync.js";

const router = Router();

function getOpenAIClient() {
  return createOpenAIClient();
}

function tierAllowsEvents(tier: string | null | undefined): boolean {
  return tier === "tier2" || tier === "tier3";
}

function tierAllowsRecurring(tier: string | null | undefined): boolean {
  return tier === "tier3";
}


function isValidISODate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed);
}

function isReasonableEventDate(value: unknown): boolean {
  if (!isValidISODate(value)) return false;
  const year = Number(String(value).slice(0, 4));
  return year >= 2000 && year <= 2100;
}

function isValidTime(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (typeof value !== "string") return false;
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value) || /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(value);
}

function isNonNegativeNumberLike(value: unknown): boolean {
  if (value == null || value === "") return true;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

function validateEventInput(body: Record<string, unknown>, opts: { requireName: boolean; requireStartDate: boolean }): string | null {
  const { name, startDate, endDate, startTime, endTime, maxCapacity, ticketPrice, ticketCapacity } = body;

  if (opts.requireName) {
    if (typeof name !== "string" || name.trim().length < 3) {
      return "Event name must be at least 3 characters";
    }
  } else if (name !== undefined && (typeof name !== "string" || name.trim().length < 3)) {
    return "Event name must be at least 3 characters";
  }

  if (opts.requireStartDate && !startDate) {
    return "startDate is required";
  }

  if (startDate !== undefined && startDate !== null && startDate !== "" && !isReasonableEventDate(startDate)) {
    return "Invalid start date";
  }

  if (endDate !== undefined && endDate !== null && endDate !== "" && !isReasonableEventDate(endDate)) {
    return "Invalid end date";
  }

  if (startDate && endDate && String(endDate) < String(startDate)) {
    return "End date cannot be before start date";
  }

  if (!isValidTime(startTime)) {
    return "Invalid start time";
  }

  if (!isValidTime(endTime)) {
    return "Invalid end time";
  }

  if (!isNonNegativeNumberLike(maxCapacity)) {
    return "Capacity must be positive";
  }

  if (!isNonNegativeNumberLike(ticketPrice)) {
    return "Ticket price must be positive";
  }

  if (!isNonNegativeNumberLike(ticketCapacity)) {
    return "Ticket capacity must be positive";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// Tier guard middleware — all event routes require Tier 2+ except /public/*
// ─────────────────────────────────────────────────────────────────
router.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/public/")) return next();
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const org = await getFullOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }
  if (!tierAllowsEvents(org.tier)) { res.status(403).json({ error: "Event features require the Events plan or higher" }); return; }
  next();
});

// ─────────────────────────────────────────────────────────────────
// Static sub-routes first (must precede /:id)
// ─────────────────────────────────────────────────────────────────

// GET /api/events/metrics
router.get("/metrics", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const [allEvents, upcomingEvents, allTimeSales, thisMontSales] = await Promise.all([
    db.select({ id: eventsTable.id, status: eventsTable.status })
      .from(eventsTable)
      .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.isActive, true))),
    db.select({ id: eventsTable.id, name: eventsTable.name, startDate: eventsTable.startDate, status: eventsTable.status })
      .from(eventsTable)
      .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.isActive, true), gte(eventsTable.startDate, today)))
      .orderBy(asc(eventsTable.startDate))
      .limit(10),
    db.select({ qty: sum(ticketSalesTable.quantity), revenue: sum(ticketSalesTable.amountPaid) })
      .from(ticketSalesTable)
      .where(eq(ticketSalesTable.orgId, org.id)),
    db.select({ qty: sum(ticketSalesTable.quantity) })
      .from(ticketSalesTable)
      .where(and(eq(ticketSalesTable.orgId, org.id), gte(ticketSalesTable.createdAt, new Date(monthStart)))),
  ]);
  const totalTicketsSold = Number(allTimeSales[0]?.qty ?? 0);
  const totalRevenue = Number(allTimeSales[0]?.revenue ?? 0);
  const thisMonthTicketsSold = Number(thisMontSales[0]?.qty ?? 0);
  res.json({
    totalEvents: allEvents.length,
    publishedEvents: allEvents.filter(e => e.status === "published" || e.status === "active").length,
    upcomingEvents,
    totalTicketsSold,
    thisMonthTicketsSold,
    totalRevenue,
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/events/ai-manage  — natural-language event management
// ─────────────────────────────────────────────────────────────────
router.post("/ai-manage", async (req: Request, res: Response) => {
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
  const today = new Date().toISOString().split("T")[0];

  const tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "create_event",
        description: "Create a new event as a draft by default. Auto-generates a unique slug from the name. Only publish immediately when the user explicitly confirms publishing.",
        parameters: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "Event name" },
            startDate: { type: "string", description: "ISO date YYYY-MM-DD" },
            endDate: { type: "string", description: "ISO date YYYY-MM-DD, only if multi-day" },
            startTime: { type: "string", description: "24-hour HH:MM format" },
            endTime: { type: "string", description: "24-hour HH:MM format" },
            location: { type: "string" },
            description: { type: "string" },
            eventType: { type: "string", enum: ["festival", "mixer", "fundraiser", "meeting", "market", "conference", "workshop", "other"] },
            isTicketed: { type: "boolean", description: "True if the event sells tickets" },
            hasRegistration: { type: "boolean", description: "True if there is vendor/attendee registration" },
            maxCapacity: { type: "number", description: "Overall event capacity (not per-ticket)" },
            status: { type: "string", enum: ["draft", "published"], description: "Defaults to draft. Use published only after explicit user confirmation." },
            confirm: { type: "boolean", description: "Must be true only after the user explicitly confirms publishing." },
            tickets: {
              type: "array",
              description: "Ticket types to create. Only provide if isTicketed is true.",
              items: {
                type: "object",
                required: ["name", "price"],
                properties: {
                  name: { type: "string", description: "Ticket tier name, e.g. 'General Admission'" },
                  price: { type: "number", description: "Price in USD. Use 0 for free." },
                  quantity: { type: "number", description: "Max tickets available. Omit for unlimited." },
                },
              },
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_events",
        description: "List this organization's upcoming events with ticket stats.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "check_ticket_sales",
        description: "Get ticket sales details for a specific event.",
        parameters: {
          type: "object",
          required: ["eventId"],
          properties: {
            eventId: { type: "string" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_event",
        description: "Update an existing event's settings or status.",
        parameters: {
          type: "object",
          required: ["eventId"],
          properties: {
            eventId: { type: "string" },
            name: { type: "string" },
            status: { type: "string", enum: ["draft", "published", "cancelled"] },
            isTicketed: { type: "boolean" },
            hasRegistration: { type: "boolean" },
            location: { type: "string" },
            description: { type: "string" },
            startDate: { type: "string" },
            startTime: { type: "string" },
            endTime: { type: "string" },
            maxCapacity: { type: "number" },
          },
        },
      },
    },
  ];

  const systemPrompt = `You are an event management assistant for ${org.name}. Today is ${today}.
You help manage events through conversation. When given a command like "add a fall festival with $25 tickets and 150 capacity", you call the appropriate tool with all the right parameters filled in.
- Always infer the current year for dates unless told otherwise.
- When creating a ticketed event, always create at least one ticket type (default: "General Admission" if no name is specified).
- When creating events, set isTicketed: true if any ticket price is mentioned.
- New events are drafts by default. Only publish immediately when the user explicitly confirms publishing; otherwise tell them the draft is ready.
- Confirm what was done clearly. Include a public event URL only for published events.
- For check_ticket_sales, first call list_events to find the event ID if you only have the name.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  // Tool execution helpers
  async function execCreateEvent(args: Record<string, unknown>): Promise<string> {
    const name = String(args.name ?? "");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

    const publishConfirmed = args.status === "published" && args.confirm === true;
    const [event] = await db
      .insert(eventsTable)
      .values({
        orgId: org.id,
        name,
        slug: uniqueSlug,
        description: args.description ? String(args.description) : undefined,
        eventType: args.eventType ? String(args.eventType) : undefined,
        startDate: args.startDate ? String(args.startDate) : undefined,
        endDate: args.endDate ? String(args.endDate) : undefined,
        startTime: args.startTime ? String(args.startTime) : undefined,
        endTime: args.endTime ? String(args.endTime) : undefined,
        location: args.location ? String(args.location) : undefined,
        maxCapacity: args.maxCapacity ? Number(args.maxCapacity) : undefined,
        isTicketed: args.isTicketed === true,
        hasRegistration: args.hasRegistration === true,
        status: publishConfirmed ? "published" : "draft",
        isActive: publishConfirmed,
        showOnPublicSite: publishConfirmed,
      })
      .returning();

    const tickets = Array.isArray(args.tickets) ? args.tickets as { name: string; price: number; quantity?: number }[] : [];
    for (const tt of tickets) {
      await db.insert(ticketTypesTable).values({
        eventId: event.id,
        orgId: org.id,
        name: String(tt.name ?? "General Admission"),
        price: Number(tt.price ?? 0),
        quantity: tt.quantity != null ? Number(tt.quantity) : undefined,
        isActive: true,
      });
    }

    scheduleSiteAutoUpdate(org.id).catch(() => {});

    const publicUrl = publishConfirmed ? `https://${org.slug}.mypillar.co/events/${uniqueSlug}/tickets` : null;
    return JSON.stringify({
      ok: true,
      eventId: event.id,
      slug: uniqueSlug,
      status: publishConfirmed ? "published" : "draft",
      publicUrl,
      ticketTypesCreated: tickets.length,
      message: publishConfirmed
        ? "Event created and published."
        : "Event created as a draft. Confirm publishing before it appears on the public site.",
    });
  }

  async function execListEvents(): Promise<string> {
    const today2 = new Date().toISOString().split("T")[0];
    const rows = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        startDate: eventsTable.startDate,
        status: eventsTable.status,
        isTicketed: eventsTable.isTicketed,
        slug: eventsTable.slug,
      })
      .from(eventsTable)
      .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.isActive, true), gte(eventsTable.startDate, today2)))
      .orderBy(asc(eventsTable.startDate))
      .limit(15);

    const withSales = await Promise.all(
      rows.map(async (e) => {
        const sales = await db
          .select({ qty: sum(ticketSalesTable.quantity), rev: sum(ticketSalesTable.amountPaid) })
          .from(ticketSalesTable)
          .where(and(eq(ticketSalesTable.eventId, e.id), eq(ticketSalesTable.paymentStatus, "paid")));
        return { ...e, ticketsSold: Number(sales[0]?.qty ?? 0), revenue: Number(sales[0]?.rev ?? 0) };
      }),
    );

    return JSON.stringify(withSales);
  }

  async function execCheckTicketSales(args: Record<string, unknown>): Promise<string> {
    const eventId = String(args.eventId ?? "");
    const [event] = await db
      .select({ id: eventsTable.id, name: eventsTable.name })
      .from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
    if (!event) return JSON.stringify({ error: "Event not found" });

    const [types, sales] = await Promise.all([
      db.select().from(ticketTypesTable).where(eq(ticketTypesTable.eventId, eventId)),
      db.select().from(ticketSalesTable).where(and(eq(ticketSalesTable.eventId, eventId), eq(ticketSalesTable.paymentStatus, "paid"))),
    ]);

    return JSON.stringify({
      eventName: event.name,
      ticketTypes: types.map((tt) => ({
        name: tt.name,
        price: tt.price,
        quantity: tt.quantity,
        sold: tt.sold,
        remaining: tt.quantity != null ? tt.quantity - tt.sold : "unlimited",
      })),
      totalSold: sales.reduce((s, r) => s + (r.quantity ?? 0), 0),
      totalRevenue: sales.reduce((s, r) => s + (r.amountPaid ?? 0), 0),
      attendees: sales.map((s) => ({ name: s.attendeeName, email: s.attendeeEmail, qty: s.quantity })),
    });
  }

  async function execUpdateEvent(args: Record<string, unknown>): Promise<string> {
    const { eventId, ...rest } = args;
    const allowed = ["name", "status", "isTicketed", "hasRegistration", "location", "description", "startDate", "startTime", "endTime", "maxCapacity"];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in rest) updates[k] = rest[k];
    }
    if (!Object.keys(updates).length) return JSON.stringify({ error: "No updates provided" });

    const [updated] = await db
      .update(eventsTable)
      .set(updates)
      .where(and(eq(eventsTable.id, String(eventId)), eq(eventsTable.orgId, org.id)))
      .returning({ id: eventsTable.id, name: eventsTable.name, status: eventsTable.status });

    if (!updated) return JSON.stringify({ error: "Event not found" });

    scheduleSiteAutoUpdate(org.id).catch(() => {});
    return JSON.stringify({ ok: true, updated });
  }

  // Tool-calling loop (max 3 rounds to handle multi-step)
  for (let round = 0; round < 3; round++) {
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
        if (call.function.name === "create_event") result = await execCreateEvent(args);
        else if (call.function.name === "list_events") result = await execListEvents();
        else if (call.function.name === "check_ticket_sales") result = await execCheckTicketSales(args);
        else if (call.function.name === "update_event") result = await execUpdateEvent(args);
        else result = JSON.stringify({ error: "Unknown tool" });
      } catch (err) {
        result = JSON.stringify({ error: String(err) });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  res.status(500).json({ error: "AI did not produce a final response" });
});

// GET /api/events/approvals/queue
router.get("/approvals/queue", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const pending = await db
    .select({
      approval: eventApprovalsTable,
      event: eventsTable,
    })
    .from(eventApprovalsTable)
    .innerJoin(eventsTable, eq(eventApprovalsTable.eventId, eventsTable.id))
    .where(and(eq(eventApprovalsTable.orgId, org.id), eq(eventApprovalsTable.status, "pending")))
    .orderBy(desc(eventApprovalsTable.createdAt));
  res.json(pending);
});

// GET /api/events/recurring/templates
router.get("/recurring/templates", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require the Total Operations plan" });
    return;
  }
  const templates = await db.select().from(recurringEventTemplatesTable).where(eq(recurringEventTemplatesTable.orgId, org.id)).orderBy(asc(recurringEventTemplatesTable.name));
  res.json(templates);
});

// POST /api/events/recurring/templates
router.post("/recurring/templates", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require the Total Operations plan" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const { name, description, eventType, location, startTime, durationMinutes, frequency, dayOfWeek, weekOfMonth, dayOfMonth } = body;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  if (!frequency || typeof frequency !== "string") { res.status(400).json({ error: "frequency is required" }); return; }
  const nextDate = computeNextOccurrence(frequency, dayOfWeek != null ? Number(dayOfWeek) : undefined, weekOfMonth != null ? Number(weekOfMonth) : undefined, dayOfMonth != null ? Number(dayOfMonth) : undefined);
  const [template] = await db.insert(recurringEventTemplatesTable).values({
    orgId: org.id,
    name: String(name),
    description: description ? String(description) : undefined,
    eventType: eventType ? String(eventType) : undefined,
    location: location ? String(location) : undefined,
    startTime: startTime ? String(startTime) : undefined,
    durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
    frequency: String(frequency),
    dayOfWeek: dayOfWeek != null ? Number(dayOfWeek) : undefined,
    weekOfMonth: weekOfMonth != null ? Number(weekOfMonth) : undefined,
    dayOfMonth: dayOfMonth != null ? Number(dayOfMonth) : undefined,
    nextGenerateAt: nextDate,
  }).returning();
  res.status(201).json(template);
});

// PUT /api/events/recurring/templates/:id
router.put("/recurring/templates/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require the Total Operations plan" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "description", "eventType", "location", "startTime", "durationMinutes", "frequency", "dayOfWeek", "weekOfMonth", "dayOfMonth", "isActive"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }
  const [updated] = await db.update(recurringEventTemplatesTable).set(updates).where(and(eq(recurringEventTemplatesTable.id, String(req.params.id)), eq(recurringEventTemplatesTable.orgId, org.id))).returning();
  if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(updated);
});

// DELETE /api/events/recurring/templates/:id
router.delete("/recurring/templates/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  await db.delete(recurringEventTemplatesTable).where(and(eq(recurringEventTemplatesTable.id, String(req.params.id)), eq(recurringEventTemplatesTable.orgId, org.id)));
  res.status(204).send();
});

// POST /api/events/recurring/templates/:id/generate
router.post("/recurring/templates/:id/generate", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require the Total Operations plan" });
    return;
  }
  const [template] = await db.select().from(recurringEventTemplatesTable).where(and(eq(recurringEventTemplatesTable.id, String(req.params.id)), eq(recurringEventTemplatesTable.orgId, org.id)));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  const nextDate = computeNextOccurrence(template.frequency, template.dayOfWeek ?? undefined, template.weekOfMonth ?? undefined, template.dayOfMonth ?? undefined);
  const dateStr = nextDate.toISOString().split("T")[0];
  let generatedDescription = template.description ?? "";
  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are an AI assistant for a civic organization. Generate a compelling event description (2-3 sentences, professional and welcoming) for a recurring event. Reply with only the description text." },
        { role: "user", content: `Event: ${template.name}\nDate: ${dateStr}\nTime: ${template.startTime ?? "TBD"}\nLocation: ${template.location ?? "TBD"}\nType: ${template.eventType ?? "general"}\nBase description: ${template.description ?? ""}` },
      ],
      max_completion_tokens: 200,
    });
    generatedDescription = completion.choices[0]?.message?.content?.trim() ?? generatedDescription;
  } catch {
    // AI unavailable — fall back to template's base description
  }
  const slug = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  const [event] = await db.insert(eventsTable).values({
    orgId: org.id,
    name: template.name,
    slug,
    description: generatedDescription,
    eventType: template.eventType ?? undefined,
    location: template.location ?? undefined,
    startTime: template.startTime ?? undefined,
    startDate: dateStr,
    isRecurring: true,
    recurringTemplateId: template.id,
    status: "draft",
    isActive: true,
  }).returning();
  await db.update(recurringEventTemplatesTable).set({
    lastGeneratedAt: new Date(),
    nextGenerateAt: computeNextOccurrence(template.frequency, template.dayOfWeek ?? undefined, template.weekOfMonth ?? undefined, template.dayOfMonth ?? undefined, nextDate),
  }).where(eq(recurringEventTemplatesTable.id, template.id));
  res.status(201).json(event);
});

// GET /api/events/public/calendar/:orgSlug — public iCal/ICS feed (works with Google, Apple, Outlook)
router.get("/public/calendar/:orgSlug", async (req: Request, res: Response) => {
  const orgSlug = String(req.params.orgSlug);
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, slug: organizationsTable.slug, tier: organizationsTable.tier })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, orgSlug));
  if (!org) { res.status(404).send("Organization not found"); return; }

  const events = await db
    .select({
      id: eventsTable.id,
      name: eventsTable.name,
      slug: eventsTable.slug,
      description: eventsTable.description,
      startDate: eventsTable.startDate,
      endDate: eventsTable.endDate,
      startTime: eventsTable.startTime,
      endTime: eventsTable.endTime,
      location: eventsTable.location,
      updatedAt: eventsTable.updatedAt,
    })
    .from(eventsTable)
    .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.status, "published"), eq(eventsTable.isActive, true)))
    .orderBy(asc(eventsTable.startDate))
    .limit(200);

  function foldLine(line: string): string {
    const chunks: string[] = [];
    while (line.length > 75) { chunks.push(line.substring(0, 75)); line = " " + line.substring(75); }
    chunks.push(line);
    return chunks.join("\r\n");
  }

  function escapeIcal(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  function parseTime(t: string | null | undefined): { h: number; m: number } | null {
    if (!t) return null;
    const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m) return null;
    let h = parseInt(m[1]); const min = parseInt(m[2]); const p = m[3]?.toUpperCase();
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    return { h, m: min };
  }

  function toIcalDate(dateStr: string | null | undefined, timeStr: string | null | undefined): { value: string; allDay: boolean } | null {
    if (!dateStr) return null;
    const datePart = dateStr.replace(/-/g, "");
    const t = parseTime(timeStr);
    if (t) {
      const hh = String(t.h).padStart(2, "0"); const mm = String(t.m).padStart(2, "0");
      return { value: `${datePart}T${hh}${mm}00`, allDay: false };
    }
    return { value: datePart, allDay: true };
  }

  const now = new Date().toISOString().replace(/[-:.]/g, "").substring(0, 15) + "Z";
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://mypillar.co";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pillar//Pillar Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcal(org.name)} Events`),
    foldLine(`X-WR-CALDESC:Events from ${escapeIcal(org.name)}, powered by Pillar`),
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const e of events) {
    const start = toIcalDate(e.startDate, e.startTime);
    if (!start) continue;

    const rawEndDate = e.endDate ?? e.startDate;
    let end = toIcalDate(rawEndDate, e.endTime ?? e.startTime);
    if (!end) end = start;

    // iCal all-day DTEND is exclusive (next day)
    if (start.allDay) {
      const d = new Date((rawEndDate ?? e.startDate) + "T00:00:00");
      d.setDate(d.getDate() + 1);
      end = { value: d.toISOString().split("T")[0].replace(/-/g, ""), allDay: true };
    }

    const url = e.slug ? `${baseUrl}/events/${org.slug}/${e.slug}` : `${baseUrl}`;
    const lastMod = e.updatedAt
      ? String(e.updatedAt).replace(/[-:.T]/g, "").substring(0, 15) + "Z"
      : now;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@mypillar.co`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`LAST-MODIFIED:${lastMod}`);
    if (start.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${start.value}`);
      lines.push(`DTEND;VALUE=DATE:${end.value}`);
    } else {
      lines.push(`DTSTART:${start.value}`);
      lines.push(`DTEND:${end.value}`);
    }
    lines.push(foldLine(`SUMMARY:${escapeIcal(e.name)}`));
    if (e.description) lines.push(foldLine(`DESCRIPTION:${escapeIcal(e.description)}`));
    if (e.location) lines.push(foldLine(`LOCATION:${escapeIcal(e.location)}`));
    lines.push(foldLine(`URL:${url}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${org.slug}-events.ics"`);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(body);
});

// GET /api/events/public/:orgSlug
router.get("/public/:orgSlug", async (req: Request, res: Response) => {
  const orgSlug = String(req.params.orgSlug);
  const [org] = await db.select({ id: organizationsTable.id, name: organizationsTable.name, tier: organizationsTable.tier })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, orgSlug));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }
  if (!tierAllowsEvents(org.tier)) { res.json({ events: [] }); return; }
  const today = new Date().toISOString().split("T")[0];
  const events = await db.select({
    id: eventsTable.id,
    name: eventsTable.name,
    slug: eventsTable.slug,
    description: eventsTable.description,
    eventType: eventsTable.eventType,
    startDate: eventsTable.startDate,
    endDate: eventsTable.endDate,
    startTime: eventsTable.startTime,
    endTime: eventsTable.endTime,
    location: eventsTable.location,
    isTicketed: eventsTable.isTicketed,
    imageUrl: eventsTable.imageUrl,
  })
    .from(eventsTable)
    .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.status, "published"), eq(eventsTable.isActive, true), gte(eventsTable.startDate, today)))
    .orderBy(asc(eventsTable.startDate))
    .limit(20);
  res.json({ events, orgName: org.name });
});

// GET /api/events/public/:orgSlug/slug/:eventSlug — single event detail for public site
router.get("/public/:orgSlug/slug/:eventSlug", async (req: Request, res: Response) => {
  const orgSlug = String(req.params.orgSlug);
  const eventSlug = String(req.params.eventSlug);
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, tier: organizationsTable.tier, senderEmail: organizationsTable.senderEmail })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, orgSlug));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }
  if (!tierAllowsEvents(org.tier)) { res.status(404).json({ error: "Events not available for this organization" }); return; }
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.slug, eventSlug), eq(eventsTable.status, "published"), eq(eventsTable.isActive, true)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const ticketTypes = await db
    .select()
    .from(ticketTypesTable)
    .where(and(eq(ticketTypesTable.eventId, event.id), eq(ticketTypesTable.isActive, true)));
  res.json({ event, ticketTypes, orgName: org.name, orgEmail: org.senderEmail });
});

// ─────────────────────────────────────────────────────────────────
// Events CRUD (/:id routes)
// ─────────────────────────────────────────────────────────────────

// GET /api/events (with per-event quick stats)
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const includeInactive = req.query.includeInactive === "1";
  const conditions = [eq(eventsTable.orgId, org.id)];
  if (!includeInactive) conditions.push(eq(eventsTable.isActive, true));

  try {
    const [events, salesByEvent] = await Promise.all([
      db.select().from(eventsTable).where(and(...conditions)).orderBy(asc(eventsTable.startDate)),
      db.select({
        eventId: ticketSalesTable.eventId,
        totalSold: sum(ticketSalesTable.quantity),
        totalRevenue: sum(ticketSalesTable.amountPaid),
      })
        .from(ticketSalesTable)
        .where(eq(ticketSalesTable.orgId, org.id))
        .groupBy(ticketSalesTable.eventId),
    ]);
    const statsMap = new Map(salesByEvent.map(r => [r.eventId, { totalSold: Number(r.totalSold ?? 0), totalRevenue: Number(r.totalRevenue ?? 0) }]));
    const result = events.map(e => ({ ...e, totalSold: statsMap.get(e.id)?.totalSold ?? 0, totalRevenue: statsMap.get(e.id)?.totalRevenue ?? 0 }));
    res.json(result);
  } catch (err) {
    console.error("[events] GET /api/events failed", err);
    res.status(500).json({ error: "Failed to load events" });
  }
});

// GET /api/events/:id/ticket-purchases — admin view of all ticket purchases for an event
router.get("/:id/ticket-purchases", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const eventId = String(req.params.id);
  const [event] = await db
    .select({ id: eventsTable.id, name: eventsTable.name, orgId: eventsTable.orgId })
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const sales = await db
    .select()
    .from(ticketSalesTable)
    .where(and(eq(ticketSalesTable.eventId, eventId), eq(ticketSalesTable.orgId, org.id)))
    .orderBy(desc(ticketSalesTable.createdAt));

  const totalRevenue = sales.filter(s => s.paymentStatus === "paid").reduce((s, r) => s + r.amountPaid, 0);
  const totalTickets = sales.filter(s => s.paymentStatus === "paid").reduce((s, r) => s + r.quantity, 0);

  res.json({
    eventId: event.id,
    eventName: event.name,
    totalRevenue,
    totalTickets,
    purchases: sales.map(s => ({
      id: s.id,
      attendeeName: s.attendeeName,
      attendeeEmail: s.attendeeEmail,
      attendeePhone: s.attendeePhone,
      ticketTypeId: s.ticketTypeId,
      quantity: s.quantity,
      amountPaid: s.amountPaid,
      paymentStatus: s.paymentStatus,
      paymentMethod: s.paymentMethod,
      stripeCheckoutSessionId: s.stripeCheckoutSessionId,
      confirmation: (s.stripeCheckoutSessionId ?? s.id).slice(-8).toUpperCase(),
      createdAt: s.createdAt,
    })),
  });
});

// GET /api/events/:id (with related data)
router.get("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const [ticketTypes, sales, approvals, communications, sponsors] = await Promise.all([
    db.select().from(ticketTypesTable).where(and(eq(ticketTypesTable.eventId, eventId), eq(ticketTypesTable.orgId, org.id))).orderBy(asc(ticketTypesTable.createdAt)),
    db.select().from(ticketSalesTable).where(and(eq(ticketSalesTable.eventId, eventId), eq(ticketSalesTable.orgId, org.id))).orderBy(desc(ticketSalesTable.createdAt)),
    db.select().from(eventApprovalsTable).where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id))).orderBy(desc(eventApprovalsTable.createdAt)),
    db.select().from(eventCommunicationsTable).where(and(eq(eventCommunicationsTable.eventId, eventId), eq(eventCommunicationsTable.orgId, org.id))).orderBy(desc(eventCommunicationsTable.sentAt)),
    db
      .select({
        id: eventSponsorsTable.id,
        eventId: eventSponsorsTable.eventId,
        sponsorId: eventSponsorsTable.sponsorId,
        orgId: eventSponsorsTable.orgId,
        tier: eventSponsorsTable.tier,
        amountPledged: eventSponsorsTable.amountPledged,
        amountReceived: eventSponsorsTable.amountReceived,
        status: eventSponsorsTable.status,
        notes: eventSponsorsTable.notes,
        createdAt: eventSponsorsTable.createdAt,
        updatedAt: eventSponsorsTable.updatedAt,
        name: sponsorsTable.name,
        email: sponsorsTable.email,
        phone: sponsorsTable.phone,
        website: sponsorsTable.website,
        logoUrl: sponsorsTable.logoUrl,
        sponsorStatus: sponsorsTable.status,
        siteVisible: sponsorsTable.siteVisible,
      })
      .from(eventSponsorsTable)
      .innerJoin(sponsorsTable, eq(eventSponsorsTable.sponsorId, sponsorsTable.id))
      .where(and(eq(eventSponsorsTable.eventId, eventId), eq(eventSponsorsTable.orgId, org.id)))
      .orderBy(asc(sponsorsTable.tierRank), asc(sponsorsTable.siteDisplayPriority), asc(sponsorsTable.name)),
  ]);
  const totalRevenue = sales.reduce((s, r) => s + r.amountPaid, 0);
  const totalSold = sales.reduce((s, r) => s + r.quantity, 0);
  const totalPlatformFees = Math.round(sales.reduce((s, r) => s + (r.platformFee ?? 0), 0) * 100) / 100;
  res.json({ event, ticketTypes, sales, approvals, communications, sponsors, totalRevenue, totalSold, totalPlatformFees });
});

// POST /api/events
router.post("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const body = req.body as Record<string, unknown>;
  const { name, description, eventType, startDate, endDate, startTime, endTime, location, maxCapacity, isTicketed, ticketPrice, ticketCapacity, requiresApproval, hasRegistration, hasSponsorSection, membersOnly } = body;
  const validationError = validateEventInput(body, { requireName: true, requireStartDate: true });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const cleanName = String(name).trim();

  // Generate URL-safe slug from name
  const rawSlug = cleanName
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  // Ensure slug uniqueness by appending short timestamp if needed
  const [existingSlug] = await db
    .select({ slug: eventsTable.slug })
    .from(eventsTable)
    .where(and(eq(eventsTable.orgId, org.id), eq(eventsTable.slug, rawSlug)));
  const uniqueSlug = existingSlug ? `${rawSlug}-${Date.now().toString(36)}` : rawSlug;
  const [event] = await db
    .insert(eventsTable)
    .values({
      orgId: org.id,
      name: cleanName,
      slug: uniqueSlug,
      description: description ? String(description) : undefined,
      eventType: eventType ? String(eventType) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      startTime: startTime ? String(startTime) : undefined,
      endTime: endTime ? String(endTime) : undefined,
      location: location ? String(location) : undefined,
      maxCapacity: maxCapacity ? Number(maxCapacity) : undefined,
      isTicketed: isTicketed === true,
      ticketPrice: ticketPrice ? Number(ticketPrice) : undefined,
      ticketCapacity: ticketCapacity ? Number(ticketCapacity) : undefined,
      requiresApproval: requiresApproval === true,
      hasRegistration: hasRegistration === true,
      hasSponsorSection: hasSponsorSection === true,
      membersOnly: membersOnly === true,
      status: "draft",
      isActive: true,
    })
    .returning();
  // Sync to live community site if published
  if (org.slug) {
    const [publishedSite] = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, org.id), eq(sitesTable.status, "published")))
      .limit(1);
    if (publishedSite) {
      try {
        await syncCreateEventToPillar(event, org.slug);
      } catch (syncErr: any) {
        console.error("[events] local create OK but live Pillar sync failed", syncErr);
        return res.status(502).json({
          error: "Event was saved but failed to sync to the live Pillar site",
          localOnly: true,
        });
      }
    }
  }

  res.status(201).json(event);
  // Fire-and-forget: update static HTML preview blob
  scheduleSiteAutoUpdate(org.id).catch(() => {});
});

// PUT /api/events/:id
router.put("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "description", "eventType", "status", "startDate", "endDate", "startTime", "endTime", "location", "maxCapacity", "isTicketed", "ticketPrice", "ticketCapacity", "requiresApproval", "hasRegistration", "hasSponsorSection", "registrationClosed", "featured", "imageUrl", "isActive", "showOnPublicSite", "featuredOnSite", "membersOnly"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }
  const [existing] = await db
    .select({ startDate: eventsTable.startDate, endDate: eventsTable.endDate })
    .from(eventsTable)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, org.id)));
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const validationError = validateEventInput(
    { ...updates, startDate: updates.startDate ?? existing.startDate, endDate: updates.endDate ?? existing.endDate },
    { requireName: false, requireStartDate: false },
  );
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const [updated] = await db
    .update(eventsTable)
    .set(updates)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, org.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  // Sync to live community site if published
  if (org.slug) {
    const [publishedSite] = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, org.id), eq(sitesTable.status, "published")))
      .limit(1);
    if (publishedSite) {
      try {
        await syncUpdateEventToPillar(updated, org.slug);
      } catch (syncErr: any) {
        console.error("[events] local update OK but live Pillar sync failed", syncErr);
        return res.status(502).json({
          error: "Event was updated but failed to sync to the live Pillar site",
          localOnly: true,
        });
      }
    }
  }
  res.json(updated);
  // Fire-and-forget: update static HTML preview blob
  scheduleSiteAutoUpdate(org.id).catch(() => {});
});

// DELETE /api/events/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  // Pre-fetch the event slug before deletion — needed for live sync
  const [eventToDelete] = await db
    .select({ id: eventsTable.id, slug: eventsTable.slug })
    .from(eventsTable)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, org.id)));

  await db
    .delete(eventsTable)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, org.id)));

  // Sync deletion to live community site if published
  if (org.slug && eventToDelete?.slug) {
    const [publishedSite] = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(and(eq(sitesTable.orgId, org.id), eq(sitesTable.status, "published")))
      .limit(1);
    if (publishedSite) {
      try {
        await syncDeleteEventToPillar(eventToDelete.slug, org.slug);
      } catch (syncErr: any) {
        console.error("[events] local delete OK but live Pillar sync failed", syncErr);
        return res.status(502).json({
          error: "Event was deleted locally but failed to sync to the live Pillar site",
          localOnly: true,
        });
      }
    }
  }

  res.status(204).send();
});

// POST /api/events/:id/submit
router.post("/:id/submit", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const [event] = await db.select().from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  if (!event.requiresApproval) {
    const [updated] = await db.update(eventsTable).set({ status: "published" }).where(eq(eventsTable.id, eventId)).returning();
    res.json(updated);
    // Fire-and-forget: refresh events section + enqueue full block auto-update
    refreshSiteEventsSection(org.id).catch(() => {});
    scheduleSiteAutoUpdate(org.id).catch(() => {});
    return;
  }
  await db.insert(eventApprovalsTable).values({
    eventId,
    orgId: org.id,
    submittedByUserId: req.user?.id ?? null,
    status: "pending",
  });
  const [updated] = await db.update(eventsTable).set({ status: "pending_approval" }).where(eq(eventsTable.id, eventId)).returning();
  res.json(updated);
});

// POST /api/events/:id/approve
router.post("/:id/approve", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (req.user?.id !== org.userId) {
    res.status(403).json({ error: "Only the organization owner can approve events" });
    return;
  }
  const eventId = String(req.params.id);
  const { comments } = req.body as { comments?: string };
  const pendingApprovals = await db.select().from(eventApprovalsTable)
    .where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id), eq(eventApprovalsTable.status, "pending")));
  if (!pendingApprovals.length) {
    res.status(400).json({ error: "No pending approval found for this event" });
    return;
  }
  await db.update(eventApprovalsTable)
    .set({ status: "approved", approverUserId: req.user?.id ?? null, comments: comments ?? null })
    .where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id), eq(eventApprovalsTable.status, "pending")));
  const [updated] = await db.update(eventsTable).set({ status: "published" }).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id))).returning();
  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(updated);
  // Fire-and-forget: refresh events section + enqueue full block auto-update
  refreshSiteEventsSection(org.id).catch(() => {});
  scheduleSiteAutoUpdate(org.id).catch(() => {});
});

// POST /api/events/:id/reject
router.post("/:id/reject", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (req.user?.id !== org.userId) {
    res.status(403).json({ error: "Only the organization owner can reject events" });
    return;
  }
  const eventId = String(req.params.id);
  const { comments } = req.body as { comments?: string };
  const pendingApprovals = await db.select().from(eventApprovalsTable)
    .where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id), eq(eventApprovalsTable.status, "pending")));
  if (!pendingApprovals.length) {
    res.status(400).json({ error: "No pending approval found for this event" });
    return;
  }
  await db.update(eventApprovalsTable)
    .set({ status: "rejected", approverUserId: req.user?.id ?? null, comments: comments ?? null })
    .where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id), eq(eventApprovalsTable.status, "pending")));
  const [updated] = await db.update(eventsTable).set({ status: "draft" }).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id))).returning();
  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(updated);
});

// ─────────────────────────────────────────────────────────────────
// Ticket Types
// ─────────────────────────────────────────────────────────────────

router.get("/:id/ticket-types", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const types = await db.select().from(ticketTypesTable).where(and(eq(ticketTypesTable.eventId, eventId), eq(ticketTypesTable.orgId, org.id))).orderBy(asc(ticketTypesTable.createdAt));
  res.json(types);
});

router.post("/:id/ticket-types", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const [ownerCheck] = await db.select({ id: eventsTable.id }).from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
  if (!ownerCheck) { res.status(404).json({ error: "Event not found" }); return; }
  const { name, description, price, quantity } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  const [type] = await db.insert(ticketTypesTable).values({
    eventId,
    orgId: org.id,
    name: String(name),
    description: description ? String(description) : undefined,
    price: price ? Number(price) : 0,
    quantity: quantity ? Number(quantity) : undefined,
  }).returning();
  res.status(201).json(type);
});

router.put("/:eventId/ticket-types/:typeId", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "description", "price", "quantity", "isActive"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }
  const [updated] = await db.update(ticketTypesTable).set(updates).where(and(eq(ticketTypesTable.id, String(req.params.typeId)), eq(ticketTypesTable.orgId, org.id))).returning();
  if (!updated) { res.status(404).json({ error: "Ticket type not found" }); return; }
  res.json(updated);
});

router.delete("/:eventId/ticket-types/:typeId", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  await db.delete(ticketTypesTable).where(and(eq(ticketTypesTable.id, String(req.params.typeId)), eq(ticketTypesTable.orgId, org.id)));
  res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────
// Ticket Sales
// ─────────────────────────────────────────────────────────────────

router.get("/:id/sales", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const sales = await db.select().from(ticketSalesTable).where(and(eq(ticketSalesTable.eventId, eventId), eq(ticketSalesTable.orgId, org.id))).orderBy(desc(ticketSalesTable.createdAt));
  res.json(sales);
});

const PLATFORM_FEE_RATE = 0.025;

router.post("/:id/sales", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const [event] = await db.select().from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const { attendeeName, attendeeEmail, attendeePhone, ticketTypeId, quantity, amountPaid, paymentMethod, notes } = req.body as Record<string, unknown>;
  if (!attendeeName || typeof attendeeName !== "string") { res.status(400).json({ error: "attendeeName is required" }); return; }
  const qty = quantity ? Number(quantity) : 1;
  const paid = amountPaid ? Number(amountPaid) : 0;
  const platformFee = Math.round(paid * PLATFORM_FEE_RATE * 100) / 100;
  const [sale] = await db.insert(ticketSalesTable).values({
    eventId,
    orgId: org.id,
    ticketTypeId: ticketTypeId ? String(ticketTypeId) : undefined,
    attendeeName: String(attendeeName),
    attendeeEmail: attendeeEmail ? String(attendeeEmail) : undefined,
    attendeePhone: attendeePhone ? String(attendeePhone) : undefined,
    quantity: qty,
    amountPaid: paid,
    platformFee,
    paymentMethod: paymentMethod ? String(paymentMethod) : "manual",
    notes: notes ? String(notes) : undefined,
  }).returning();
  if (ticketTypeId) {
    const [tt] = await db.select().from(ticketTypesTable).where(
      and(
        eq(ticketTypesTable.id, String(ticketTypeId)),
        eq(ticketTypesTable.orgId, org.id),
        eq(ticketTypesTable.eventId, eventId),
      ),
    );
    if (tt) {
      await db.update(ticketTypesTable)
        .set({ sold: tt.sold + qty })
        .where(and(eq(ticketTypesTable.id, String(ticketTypeId)), eq(ticketTypesTable.orgId, org.id), eq(ticketTypesTable.eventId, eventId)));
    }
  }
  res.status(201).json(sale);
});

router.delete("/:eventId/sales/:saleId", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.eventId);
  // Constrain delete to the route's event so a malformed request can't
  // delete a sale belonging to one event while triggering notify on another.
  const deleted = await db
    .delete(ticketSalesTable)
    .where(and(
      eq(ticketSalesTable.id, String(req.params.saleId)),
      eq(ticketSalesTable.orgId, org.id),
      eq(ticketSalesTable.eventId, eventId),
    ))
    .returning({ id: ticketSalesTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }

  // After deleting a sale, check if anyone is waiting and notify the first person
  try {
    const [nextWaiting] = await db
      .select()
      .from(eventWaitlistTable)
      .where(and(
        eq(eventWaitlistTable.eventId, eventId),
        eq(eventWaitlistTable.status, "waiting"),
      ))
      .orderBy(eventWaitlistTable.createdAt)
      .limit(1);

    if (nextWaiting && process.env.RESEND_API_KEY) {
      const [event] = await db.select({ name: eventsTable.name, slug: eventsTable.slug })
        .from(eventsTable).where(eq(eventsTable.id, eventId));
      const [orgRow] = await db.select({ slug: organizationsTable.slug, senderEmail: organizationsTable.senderEmail })
        .from(organizationsTable).where(eq(organizationsTable.id, org.id));

      if (event && orgRow) {
        const eventUrl = `https://${orgRow.slug}.mypillar.co/events/${event.slug}`;
        let sent = false;
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: orgRow.senderEmail ?? "noreply@mypillar.co",
            to: nextWaiting.email,
            subject: `A spot opened up — ${event.name}`,
            text: `Hi ${nextWaiting.name},\n\nA spot has opened up for ${event.name}. Visit ${eventUrl} to grab your ticket.`,
          });
          sent = true;
        } catch (sendErr) {
          console.error("[waitlist auto-notify] send failed:", sendErr);
        }

        // Only mark as notified if the email actually went out — otherwise
        // leave them as 'waiting' so a future cancellation can retry.
        if (sent) {
          await db.update(eventWaitlistTable)
            .set({ status: "notified", notifiedAt: new Date() })
            .where(eq(eventWaitlistTable.id, nextWaiting.id));
        }
      }
    }
  } catch (err) {
    console.error("[waitlist auto-notify] non-fatal error:", err);
  }

  res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────
// Waitlist (admin)
// ─────────────────────────────────────────────────────────────────

router.get("/:id/waitlist", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const waitlist = await db
    .select()
    .from(eventWaitlistTable)
    .where(and(
      eq(eventWaitlistTable.eventId, String(req.params.id)),
      eq(eventWaitlistTable.orgId, org.id),
    ))
    .orderBy(eventWaitlistTable.createdAt);

  res.json(waitlist);
});

router.post("/:id/waitlist/:waitlistId/notify", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const [entry] = await db
    .select()
    .from(eventWaitlistTable)
    .where(and(
      eq(eventWaitlistTable.id, String(req.params.waitlistId)),
      eq(eventWaitlistTable.orgId, org.id),
    ));
  if (!entry) { res.status(404).json({ error: "Waitlist entry not found" }); return; }

  const [event] = await db
    .select({ name: eventsTable.name, slug: eventsTable.slug })
    .from(eventsTable)
    .where(eq(eventsTable.id, String(req.params.id)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const [orgRow] = await db
    .select({ slug: organizationsTable.slug, senderEmail: organizationsTable.senderEmail })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, org.id));

  if (!process.env.RESEND_API_KEY) {
    res.status(503).json({ error: "Email is not configured. Set RESEND_API_KEY to send notifications." });
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const eventUrl = `https://${orgRow.slug}.mypillar.co/events/${event.slug}`;

    await resend.emails.send({
      from: orgRow.senderEmail ?? "noreply@mypillar.co",
      to: entry.email,
      subject: `A spot opened up — ${event.name}`,
      text: `Hi ${entry.name},\n\nGood news! A spot has opened up for ${event.name}.\n\nVisit ${eventUrl} to grab your ticket.`,
    });

    await db
      .update(eventWaitlistTable)
      .set({ status: "notified", notifiedAt: new Date() })
      .where(eq(eventWaitlistTable.id, entry.id));

    res.json({ ok: true });
  } catch (err) {
    console.error("[waitlist notify] send failed:", err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// ─────────────────────────────────────────────────────────────────
// Communications
// ─────────────────────────────────────────────────────────────────

router.get("/:id/communications", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const comms = await db.select().from(eventCommunicationsTable).where(and(eq(eventCommunicationsTable.eventId, eventId), eq(eventCommunicationsTable.orgId, org.id))).orderBy(desc(eventCommunicationsTable.sentAt));
  res.json(comms);
});

router.post("/:id/communications", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const [event] = await db.select().from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const { subject, body } = req.body as { subject?: string; body?: string };
  if (!subject || !body) { res.status(400).json({ error: "subject and body are required" }); return; }
  const sales = await db.select({ email: ticketSalesTable.attendeeEmail }).from(ticketSalesTable).where(eq(ticketSalesTable.eventId, eventId));
  const uniqueEmails = Array.from(new Set(sales.map(s => s.email).filter((e): e is string => !!e)));
  const [comm] = await db.insert(eventCommunicationsTable).values({
    eventId,
    orgId: org.id,
    subject: String(subject),
    body: String(body),
    recipientCount: uniqueEmails.length,
  }).returning();

  // After inserting the communication record, send the actual email.
  // If RESEND_API_KEY isn't set, we skip silently — the record is still saved.
  if (uniqueEmails.length > 0 && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: org.senderEmail ?? "noreply@mypillar.co",
        to: uniqueEmails,
        subject: String(subject),
        text: String(body),
      });
    } catch (emailErr) {
      console.error("[event communications] Failed to send email:", emailErr);
      // Do not fail the request — the record is already saved.
    }
  }

  res.status(201).json(comm);
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function computeNextOccurrence(
  frequency: string,
  dayOfWeek?: number,
  weekOfMonth?: number,
  dayOfMonth?: number,
  after?: Date,
): Date {
  const base = after ? new Date(after) : new Date();
  base.setDate(base.getDate() + 1);
  if (frequency === "weekly" && dayOfWeek != null) {
    while (base.getDay() !== dayOfWeek) base.setDate(base.getDate() + 1);
    return base;
  }
  if (frequency === "biweekly" && dayOfWeek != null) {
    while (base.getDay() !== dayOfWeek) base.setDate(base.getDate() + 1);
    base.setDate(base.getDate() + 7);
    return base;
  }
  if (frequency === "monthly") {
    if (dayOfMonth != null) {
      base.setDate(1);
      base.setMonth(base.getMonth() + 1);
      const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      base.setDate(Math.min(dayOfMonth, maxDay));
      return base;
    }
    if (weekOfMonth != null && dayOfWeek != null) {
      base.setDate(1);
      base.setMonth(base.getMonth() + 1);
      let c = 0;
      while (true) {
        if (base.getDay() === dayOfWeek) {
          c++;
          if (c === weekOfMonth) break;
        }
        base.setDate(base.getDate() + 1);
      }
      return base;
    }
  }
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

export default router;
