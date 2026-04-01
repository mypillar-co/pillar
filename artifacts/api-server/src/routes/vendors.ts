import { Router, type Request, type Response } from "express";
import { db, vendorsTable } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";

const router = Router();

// GET /api/vendors
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const vendors = await db.select().from(vendorsTable).where(eq(vendorsTable.orgId, orgId));
  res.json(vendors);
});

// POST /api/vendors
router.post("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const { name, vendorType, email, phone, notes } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  const [vendor] = await db.insert(vendorsTable).values({
    orgId,
    name: String(name),
    vendorType: vendorType ? String(vendorType) : undefined,
    email: email ? String(email) : undefined,
    phone: phone ? String(phone) : undefined,
    notes: notes ? String(notes) : undefined,
    status: "active",
  }).returning();
  res.status(201).json(vendor);
});

export default router;
