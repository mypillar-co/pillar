import { Router, type Request, type Response } from "express";
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
import { eq, and, asc, desc, gte, sum } from "drizzle-orm";
import OpenAI from "openai";

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

async function resolveOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  return org;
}

function tierAllowsEvents(tier: string | null | undefined): boolean {
  return tier === "tier2" || tier === "tier3";
}

function tierAllowsRecurring(tier: string | null | undefined): boolean {
  return tier === "tier3";
}

// ─────────────────────────────────────────────────────────────────
// Static sub-routes first (must precede /:id)
// ─────────────────────────────────────────────────────────────────

// GET /api/events/metrics
router.get("/metrics", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsEvents(org.tier)) {
    res.status(403).json({ error: "Event dashboard requires Tier 2 or higher" });
    return;
  }
  const today = new Date().toISOString().split("T")[0];
  const [allEvents, upcomingEvents, salesRows] = await Promise.all([
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
  ]);
  const totalTicketsSold = Number(salesRows[0]?.qty ?? 0);
  const totalRevenue = Number(salesRows[0]?.revenue ?? 0);
  res.json({
    totalEvents: allEvents.length,
    publishedEvents: allEvents.filter(e => e.status === "published" || e.status === "active").length,
    upcomingEvents,
    totalTicketsSold,
    totalRevenue,
  });
});

// GET /api/events/approvals/queue
router.get("/approvals/queue", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require Tier 3" });
    return;
  }
  const templates = await db.select().from(recurringEventTemplatesTable).where(eq(recurringEventTemplatesTable.orgId, org.id)).orderBy(asc(recurringEventTemplatesTable.name));
  res.json(templates);
});

// POST /api/events/recurring/templates
router.post("/recurring/templates", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require Tier 3" });
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
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require Tier 3" });
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
  const org = await resolveOrg(req, res);
  if (!org) return;
  await db.delete(recurringEventTemplatesTable).where(and(eq(recurringEventTemplatesTable.id, String(req.params.id)), eq(recurringEventTemplatesTable.orgId, org.id)));
  res.status(204).send();
});

// POST /api/events/recurring/templates/:id/generate
router.post("/recurring/templates/:id/generate", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsRecurring(org.tier)) {
    res.status(403).json({ error: "Recurring events require Tier 3" });
    return;
  }
  const [template] = await db.select().from(recurringEventTemplatesTable).where(and(eq(recurringEventTemplatesTable.id, String(req.params.id)), eq(recurringEventTemplatesTable.orgId, org.id)));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  const openai = getOpenAIClient();
  const nextDate = computeNextOccurrence(template.frequency, template.dayOfWeek ?? undefined, template.weekOfMonth ?? undefined, template.dayOfMonth ?? undefined);
  const dateStr = nextDate.toISOString().split("T")[0];
  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: "You are an AI assistant for a civic organization. Generate a compelling event description (2-3 sentences, professional and welcoming) for a recurring event. Reply with only the description text.",
      },
      {
        role: "user",
        content: `Event: ${template.name}\nDate: ${dateStr}\nTime: ${template.startTime ?? "TBD"}\nLocation: ${template.location ?? "TBD"}\nType: ${template.eventType ?? "general"}\nBase description: ${template.description ?? ""}`,
      },
    ],
    max_tokens: 200,
  });
  const generatedDescription = completion.choices[0]?.message?.content?.trim() ?? template.description ?? "";
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

// GET /api/events
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const includeInactive = req.query.includeInactive === "1";
  const conditions = [eq(eventsTable.orgId, org.id)];
  if (!includeInactive) conditions.push(eq(eventsTable.isActive, true));
  const events = await db
    .select()
    .from(eventsTable)
    .where(and(...conditions))
    .orderBy(asc(eventsTable.startDate));
  res.json(events);
});

// GET /api/events/:id (with related data)
router.get("/:id", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
    db.select().from(ticketTypesTable).where(eq(ticketTypesTable.eventId, eventId)).orderBy(asc(ticketTypesTable.createdAt)),
    db.select().from(ticketSalesTable).where(eq(ticketSalesTable.eventId, eventId)).orderBy(desc(ticketSalesTable.createdAt)),
    db.select().from(eventApprovalsTable).where(eq(eventApprovalsTable.eventId, eventId)).orderBy(desc(eventApprovalsTable.createdAt)),
    db.select().from(eventCommunicationsTable).where(eq(eventCommunicationsTable.eventId, eventId)).orderBy(desc(eventCommunicationsTable.sentAt)),
  ]);
  const totalRevenue = sales.reduce((s, r) => s + r.amountPaid * r.quantity, 0);
  const totalSold = sales.reduce((s, r) => s + r.quantity, 0);
  res.json({ event, ticketTypes, sales, approvals, communications, totalRevenue, totalSold });
});

// POST /api/events
router.post("/", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsEvents(org.tier)) {
    res.status(403).json({ error: "Event dashboard requires Tier 2 or higher" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const { name, description, eventType, startDate, endDate, startTime, endTime, location, maxCapacity, isTicketed, ticketPrice, ticketCapacity, requiresApproval } = body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
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
});

// PUT /api/events/:id
router.put("/:id", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "description", "eventType", "status", "startDate", "endDate", "startTime", "endTime", "location", "maxCapacity", "isTicketed", "ticketPrice", "ticketCapacity", "requiresApproval", "featured", "imageUrl", "isActive"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
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
});

// DELETE /api/events/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  await db
    .delete(eventsTable)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, org.id)));
  res.status(204).send();
});

// POST /api/events/:id/submit
router.post("/:id/submit", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const [event] = await db.select().from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  if (!event.requiresApproval) {
    const [updated] = await db.update(eventsTable).set({ status: "published" }).where(eq(eventsTable.id, eventId)).returning();
    res.json(updated);
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
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const { comments } = req.body as { comments?: string };
  await db.update(eventApprovalsTable)
    .set({ status: "approved", approverUserId: req.user?.id ?? null, comments: comments ?? null })
    .where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id)));
  const [updated] = await db.update(eventsTable).set({ status: "published" }).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id))).returning();
  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(updated);
});

// POST /api/events/:id/reject
router.post("/:id/reject", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const { comments } = req.body as { comments?: string };
  await db.update(eventApprovalsTable)
    .set({ status: "rejected", approverUserId: req.user?.id ?? null, comments: comments ?? null })
    .where(and(eq(eventApprovalsTable.eventId, eventId), eq(eventApprovalsTable.orgId, org.id)));
  const [updated] = await db.update(eventsTable).set({ status: "draft" }).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id))).returning();
  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(updated);
});

// ─────────────────────────────────────────────────────────────────
// Ticket Types
// ─────────────────────────────────────────────────────────────────

router.get("/:id/ticket-types", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const types = await db.select().from(ticketTypesTable).where(and(eq(ticketTypesTable.eventId, eventId), eq(ticketTypesTable.orgId, org.id))).orderBy(asc(ticketTypesTable.createdAt));
  res.json(types);
});

router.post("/:id/ticket-types", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
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
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
  if (!org) return;
  await db.delete(ticketTypesTable).where(and(eq(ticketTypesTable.id, String(req.params.typeId)), eq(ticketTypesTable.orgId, org.id)));
  res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────
// Ticket Sales
// ─────────────────────────────────────────────────────────────────

router.get("/:id/sales", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const sales = await db.select().from(ticketSalesTable).where(and(eq(ticketSalesTable.eventId, eventId), eq(ticketSalesTable.orgId, org.id))).orderBy(desc(ticketSalesTable.createdAt));
  res.json(sales);
});

router.post("/:id/sales", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const [event] = await db.select().from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const { attendeeName, attendeeEmail, attendeePhone, ticketTypeId, quantity, amountPaid, paymentMethod, notes } = req.body as Record<string, unknown>;
  if (!attendeeName || typeof attendeeName !== "string") { res.status(400).json({ error: "attendeeName is required" }); return; }
  const qty = quantity ? Number(quantity) : 1;
  const [sale] = await db.insert(ticketSalesTable).values({
    eventId,
    orgId: org.id,
    ticketTypeId: ticketTypeId ? String(ticketTypeId) : undefined,
    attendeeName: String(attendeeName),
    attendeeEmail: attendeeEmail ? String(attendeeEmail) : undefined,
    attendeePhone: attendeePhone ? String(attendeePhone) : undefined,
    quantity: qty,
    amountPaid: amountPaid ? Number(amountPaid) : 0,
    paymentMethod: paymentMethod ? String(paymentMethod) : "manual",
    notes: notes ? String(notes) : undefined,
  }).returning();
  if (ticketTypeId) {
    const [tt] = await db.select().from(ticketTypesTable).where(eq(ticketTypesTable.id, String(ticketTypeId)));
    if (tt) {
      await db.update(ticketTypesTable).set({ sold: tt.sold + qty }).where(eq(ticketTypesTable.id, String(ticketTypeId)));
    }
  }
  res.status(201).json(sale);
});

router.delete("/:eventId/sales/:saleId", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  await db.delete(ticketSalesTable).where(and(eq(ticketSalesTable.id, String(req.params.saleId)), eq(ticketSalesTable.orgId, org.id)));
  res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────
// Communications
// ─────────────────────────────────────────────────────────────────

router.get("/:id/communications", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const eventId = String(req.params.id);
  const comms = await db.select().from(eventCommunicationsTable).where(and(eq(eventCommunicationsTable.eventId, eventId), eq(eventCommunicationsTable.orgId, org.id))).orderBy(desc(eventCommunicationsTable.sentAt));
  res.json(comms);
});

router.post("/:id/communications", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
