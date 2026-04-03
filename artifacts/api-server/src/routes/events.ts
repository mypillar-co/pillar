import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db,
  eventsTable,
  organizationsTable,
  ticketTypesTable,
  ticketSalesTable,
  eventApprovalsTable,
  eventCommunicationsTable,
  recurringEventTemplatesTable,
} from "@workspace/db";
import { eq, and, asc, desc, gte, sum, sql } from "drizzle-orm";
import OpenAI from "openai";
import { refreshSiteEventsSection } from "./sites";
import { resolveFullOrg, getFullOrgForUser } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";

const router = Router();

function getOpenAIClient() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("Replit AI integration not configured.");
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

function tierAllowsEvents(tier: string | null | undefined): boolean {
  return tier === "tier2" || tier === "tier3";
}

function tierAllowsRecurring(tier: string | null | undefined): boolean {
  return tier === "tier3";
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
  const [ticketTypes, sales, approvals, communications] = await Promise.all([
    db.select().from(ticketTypesTable).where(and(eq(ticketTypesTable.eventId, eventId), eq(ticketTypesTable.orgId, org.id))).orderBy(asc(ticketTypesTable.createdAt)),
    db.select().from(ticketSalesTable).where(and(eq(ticketSalesTable.eventId, eventId), eq(ticketSalesTable.orgId, org.id))).orderBy(desc(ticketSalesTable.createdAt)),
    db.select().from(eventApprovalsTable).where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id))).orderBy(desc(eventApprovalsTable.createdAt)),
    db.select().from(eventCommunicationsTable).where(and(eq(eventCommunicationsTable.eventId, eventId), eq(eventCommunicationsTable.orgId, org.id))).orderBy(desc(eventCommunicationsTable.sentAt)),
  ]);
  const totalRevenue = sales.reduce((s, r) => s + r.amountPaid, 0);
  const totalSold = sales.reduce((s, r) => s + r.quantity, 0);
  const totalPlatformFees = Math.round(sales.reduce((s, r) => s + (r.platformFee ?? 0), 0) * 100) / 100;
  res.json({ event, ticketTypes, sales, approvals, communications, totalRevenue, totalSold, totalPlatformFees });
});

// POST /api/events
router.post("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const body = req.body as Record<string, unknown>;
  const { name, description, eventType, startDate, endDate, startTime, endTime, location, maxCapacity, isTicketed, ticketPrice, ticketCapacity, requiresApproval } = body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (startDate && endDate && String(endDate) < String(startDate)) {
    res.status(400).json({ error: "End date cannot be before start date" });
    return;
  }
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
  const [event] = await db
    .insert(eventsTable)
    .values({
      orgId: org.id,
      name: String(name),
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
      status: "draft",
      isActive: true,
    })
    .returning();
  res.status(201).json(event);
  // Fire-and-forget: new event may affect the public site's events display
  scheduleSiteAutoUpdate(org.id).catch(() => {});
});

// PUT /api/events/:id
router.put("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "description", "eventType", "status", "startDate", "endDate", "startTime", "endTime", "location", "maxCapacity", "isTicketed", "ticketPrice", "ticketCapacity", "requiresApproval", "featured", "imageUrl", "isActive"];
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
  const effectiveStart = String(updates.startDate ?? existing.startDate ?? "");
  const effectiveEnd = String(updates.endDate ?? existing.endDate ?? "");
  if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
    res.status(400).json({ error: "End date cannot be before start date" });
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
  res.json(updated);
  // Fire-and-forget: event changes may affect the public site
  scheduleSiteAutoUpdate(org.id).catch(() => {});
});

// DELETE /api/events/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  await db
    .delete(eventsTable)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, org.id)));
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
  await db.delete(ticketSalesTable).where(and(eq(ticketSalesTable.id, String(req.params.saleId)), eq(ticketSalesTable.orgId, org.id)));
  res.status(204).send();
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
  const uniqueEmails = new Set(sales.map(s => s.email).filter(Boolean));
  const [comm] = await db.insert(eventCommunicationsTable).values({
    eventId,
    orgId: org.id,
    subject: String(subject),
    body: String(body),
    recipientCount: uniqueEmails.size,
  }).returning();
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
