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

router.post("/bulk-import", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows as Record<string, unknown>[] : [];
  if (!rows.length) {
    res.status(400).json({ error: "No contacts provided" });
    return;
  }

  const created: Array<typeof contactsTable.$inferSelect> = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? {};
    const firstName = typeof row.firstName === "string" ? row.firstName.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const [derivedFirst, ...restName] = name.split(/\s+/).filter(Boolean);
    const nextFirstName = firstName || derivedFirst || "";
    if (!nextFirstName) {
      skipped.push({ row: i + 1, reason: "Missing first name" });
      continue;
    }
    const [contact] = await db.insert(contactsTable).values({
      orgId,
      firstName: nextFirstName,
      lastName: typeof row.lastName === "string" && row.lastName.trim()
        ? row.lastName.trim()
        : restName.join(" ") || undefined,
      email: typeof row.email === "string" && row.email.trim() ? row.email.trim().toLowerCase() : undefined,
      phone: typeof row.phone === "string" && row.phone.trim() ? row.phone.trim() : undefined,
      company: typeof row.company === "string" && row.company.trim() ? row.company.trim() : undefined,
      contactType: typeof row.contactType === "string" && row.contactType.trim() ? row.contactType.trim() : "general",
      notes: typeof row.notes === "string" && row.notes.trim() ? row.notes.trim() : undefined,
    }).returning();
    created.push(contact);
  }

  res.json({
    ok: true,
    createdCount: created.length,
    skippedCount: skipped.length,
    skipped,
  });
});

export default router;
