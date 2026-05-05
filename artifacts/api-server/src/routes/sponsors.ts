import { Router, type Request, type Response } from "express";
import { db, sponsorsTable, eventsTable, eventSponsorsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";

const router = Router();
const SPONSOR_LOGO_INLINE_ERROR = "Please upload the logo first; sponsor records only store image URLs.";

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

export default router;
