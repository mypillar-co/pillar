import { Router, type Request, type Response } from "express";
import { db, sponsorsTable, eventsTable, eventSponsorsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";

const router = Router();
const SPONSOR_LOGO_INLINE_ERROR = "Please upload the logo first; sponsor records only store image URLs.";
const SPONSOR_STATUSES = new Set(["active", "inactive", "prospect"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const next = text(value);
  return next ? next : null;
}

function sponsorLogoUrl(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(SPONSOR_LOGO_INLINE_ERROR);
  }
  const logoUrl = value.trim();
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith("data:") || logoUrl.length > 4096) {
    throw new Error(SPONSOR_LOGO_INLINE_ERROR);
  }
  return logoUrl;
}

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
  let normalizedLogoUrl: string | undefined;
  try {
    normalizedLogoUrl = sponsorLogoUrl(logoUrl);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : SPONSOR_LOGO_INLINE_ERROR });
    return;
  }
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
    logoUrl: normalizedLogoUrl,
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

// PUT /api/sponsors/:id
router.put("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const id = text(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Partial<typeof sponsorsTable.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = text(body.name);
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    updates.name = name;
  }
  if (body.email !== undefined) updates.email = optionalText(body.email);
  if (body.phone !== undefined) updates.phone = optionalText(body.phone);
  if (body.website !== undefined) updates.website = optionalText(body.website);
  if (body.notes !== undefined) updates.notes = optionalText(body.notes);
  if (body.logoUrl !== undefined) {
    try {
      updates.logoUrl = sponsorLogoUrl(body.logoUrl) ?? null;
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : SPONSOR_LOGO_INLINE_ERROR });
      return;
    }
  }
  if (body.status !== undefined) {
    const status = text(body.status).toLowerCase();
    if (!SPONSOR_STATUSES.has(status)) {
      res.status(400).json({ error: "status must be active, inactive, or prospect" });
      return;
    }
    updates.status = status;
  }

  if (!Object.keys(updates).length && !body.eventId) {
    res.status(400).json({ error: "No sponsor changes provided" });
    return;
  }

  const [sponsor] = Object.keys(updates).length
    ? await db
      .update(sponsorsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(sponsorsTable.id, id), eq(sponsorsTable.orgId, orgId)))
      .returning()
    : await db
      .select()
      .from(sponsorsTable)
      .where(and(eq(sponsorsTable.id, id), eq(sponsorsTable.orgId, orgId)));

  if (!sponsor) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }

  const eventId = text(body.eventId);
  if (eventId) {
    const [event] = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)));
    if (!event) {
      res.status(400).json({ error: "Event not found for this organization" });
      return;
    }
    await db
      .insert(eventSponsorsTable)
      .values({
        orgId,
        eventId,
        sponsorId: sponsor.id,
        tier: text(body.tier) || undefined,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [eventSponsorsTable.eventId, eventSponsorsTable.sponsorId],
        set: {
          tier: text(body.tier) || undefined,
          status: "active",
          updatedAt: sql`now()`,
        },
      });
  }

  res.json(sponsor);
  scheduleSiteAutoUpdate(orgId).catch(() => {});
});

// DELETE /api/sponsors/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const id = text(req.params.id);
  const [existing] = await db
    .select({ id: sponsorsTable.id })
    .from(sponsorsTable)
    .where(and(eq(sponsorsTable.id, id), eq(sponsorsTable.orgId, orgId)));
  if (!existing) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }

  await db.delete(eventSponsorsTable).where(and(eq(eventSponsorsTable.sponsorId, id), eq(eventSponsorsTable.orgId, orgId)));
  await db.delete(sponsorsTable).where(and(eq(sponsorsTable.id, id), eq(sponsorsTable.orgId, orgId)));
  res.status(204).send();
  scheduleSiteAutoUpdate(orgId).catch(() => {});
});

export default router;
