import { Router, type Request, type Response } from "express";
import { db, eventsTable, organizationsTable } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";

const router = Router();

// Require auth + resolve org for all event routes
async function resolveOrg(req: Request, res: Response): Promise<string | null> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [org] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  return org.id;
}

// GET /api/events
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const includeInactive = req.query.includeInactive === "1";
  const conditions = [eq(eventsTable.orgId, orgId)];
  if (!includeInactive) conditions.push(eq(eventsTable.isActive, true));
  const events = await db
    .select()
    .from(eventsTable)
    .where(and(...conditions))
    .orderBy(asc(eventsTable.startDate));
  res.json(events);
});

// GET /api/events/:id
router.get("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const eventId = String(req.params.id);
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(event);
});

// POST /api/events
router.post("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const { name, description, eventType, startDate, endDate, startTime, endTime, location, maxCapacity, isTicketed, ticketPrice, ticketCapacity } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
  const [event] = await db
    .insert(eventsTable)
    .values({
      orgId,
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
      status: "draft",
      isActive: true,
    })
    .returning();
  res.status(201).json(event);
});

// PUT /api/events/:id
router.put("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const body = req.body as Record<string, unknown>;
  const allowed = ["name","description","eventType","status","startDate","endDate","startTime","endTime","location","maxCapacity","isTicketed","ticketPrice","ticketCapacity","featured","imageUrl","isActive"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }
  const [updated] = await db
    .update(eventsTable)
    .set(updates)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, orgId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(updated);
});

// DELETE /api/events/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  await db
    .delete(eventsTable)
    .where(and(eq(eventsTable.id, String(req.params.id)), eq(eventsTable.orgId, orgId)));
  res.status(204).send();
});

export default router;
