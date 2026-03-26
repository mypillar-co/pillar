import { Router, type Request, type Response } from "express";
import { db, sponsorsTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function resolveOrg(req: Request, res: Response): Promise<string | null> {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org.id;
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
  const { name, email, phone, website, logoUrl, notes } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
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
  res.status(201).json(sponsor);
});

export default router;
