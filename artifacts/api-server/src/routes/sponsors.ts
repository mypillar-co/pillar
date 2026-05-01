import { Router, type Request, type Response } from "express";
import { db, sponsorsTable, eventsTable, eventSponsorsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";

const router = Router();

// GET /api/sponsors
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const sponsors = await db.select().from(sponsorsTable).where(eq(sponsorsTable.orgId, orgId));
  res.json(sponsors);
});

// POST /api/sponsors
router.post("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const { name, email, phone, website, logoUrl, notes, eventId, tier } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  let linkedEventId: string | null = null;
  if (eventId && typeof eventId === "string") {
    const [event] = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)));
    if (!event) {
      res.status(400).json({ error: "Event not found for this organization" });
      return;
    }
    linkedEventId = event.id;
  }
  const [sponsor] = await db.insert(sponsorsTable).values({
    orgId,
    name: String(name),
    email: email ? String(email) : undefined,
    phone: phone ? String(phone) : undefined,
    website: website ? String(website) : undefined,
    logoUrl: logoUrl ? String(logoUrl) : undefined,
    notes: notes ? String(notes) : undefined,
    status: "active",
  }).returning();

  if (linkedEventId) {
    await db
      .insert(eventSponsorsTable)
      .values({
        orgId,
        eventId: linkedEventId,
        sponsorId: sponsor.id,
        tier: tier ? String(tier) : undefined,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [eventSponsorsTable.eventId, eventSponsorsTable.sponsorId],
        set: {
          tier: tier ? String(tier) : undefined,
          status: "active",
          updatedAt: sql`now()`,
        },
      });
  }

  res.status(201).json(sponsor);
  // Fire-and-forget: new sponsor may affect the public site's sponsors display
  scheduleSiteAutoUpdate(orgId).catch(() => {});
});

export default router;
