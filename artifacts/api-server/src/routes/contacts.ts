import { Router, type Request, type Response } from "express";
import { db, contactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";

const router = Router();

// GET /api/contacts
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const contacts = await db.select().from(contactsTable).where(eq(contactsTable.orgId, orgId));
  res.json(contacts);
});

// POST /api/contacts
router.post("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const { firstName, lastName, email, phone, company, contactType, notes } = req.body as Record<string, unknown>;
  if (!firstName || typeof firstName !== "string") { res.status(400).json({ error: "firstName is required" }); return; }
  const [contact] = await db.insert(contactsTable).values({
    orgId,
    firstName: String(firstName),
    lastName: lastName ? String(lastName) : undefined,
    email: email ? String(email) : undefined,
    phone: phone ? String(phone) : undefined,
    company: company ? String(company) : undefined,
    contactType: contactType ? String(contactType) : undefined,
    notes: notes ? String(notes) : undefined,
  }).returning();
  res.status(201).json(contact);
});

export default router;
