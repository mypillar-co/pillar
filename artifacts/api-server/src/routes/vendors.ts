import { Router, type Request, type Response } from "express";
import { db, vendorsTable, eventVendorsTable, eventsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";

const router = Router();

const VENDOR_STATUSES = new Set(["active", "inactive"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const next = text(value);
  return next ? next : null;
}

async function linkVendorToEvent(orgId: string, vendorId: string, body: Record<string, unknown>): Promise<string | null> {
  const eventId = text(body.eventId);
  if (!eventId) return null;
  const [event] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)));
  if (!event) return "Event not found for this organization";
  const feeAmount = body.feeAmount != null && body.feeAmount !== "" ? Number(body.feeAmount) : undefined;
  await db
    .insert(eventVendorsTable)
    .values({
      orgId,
      eventId,
      vendorId,
      feeAmount: Number.isFinite(feeAmount) ? feeAmount : undefined,
      feeStatus: text(body.feeStatus) || "waived",
      status: text(body.eventStatus) || "active",
      notes: optionalText(body.eventNotes),
    })
    .onConflictDoUpdate({
      target: [eventVendorsTable.eventId, eventVendorsTable.vendorId],
      set: {
        feeAmount: Number.isFinite(feeAmount) ? feeAmount : undefined,
        feeStatus: text(body.feeStatus) || "waived",
        status: text(body.eventStatus) || "active",
        notes: optionalText(body.eventNotes),
        updatedAt: sql`now()`,
      },
    });
  return null;
}

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
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { name, vendorType, email, phone, notes } = body;
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
  const linkError = await linkVendorToEvent(orgId, vendor.id, body);
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }
  res.status(201).json(vendor);
});

// PUT /api/vendors/:id
router.put("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const id = text(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Partial<typeof vendorsTable.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = text(body.name);
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    updates.name = name;
  }
  if (body.vendorType !== undefined) updates.vendorType = optionalText(body.vendorType);
  if (body.email !== undefined) updates.email = optionalText(body.email);
  if (body.phone !== undefined) updates.phone = optionalText(body.phone);
  if (body.notes !== undefined) updates.notes = optionalText(body.notes);
  if (body.status !== undefined) {
    const status = text(body.status).toLowerCase();
    if (!VENDOR_STATUSES.has(status)) {
      res.status(400).json({ error: "status must be active or inactive" });
      return;
    }
    updates.status = status;
  }

  if (!Object.keys(updates).length && !body.eventId) {
    res.status(400).json({ error: "No vendor changes provided" });
    return;
  }

  const [vendor] = Object.keys(updates).length
    ? await db
      .update(vendorsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(vendorsTable.id, id), eq(vendorsTable.orgId, orgId)))
      .returning()
    : await db.select().from(vendorsTable).where(and(eq(vendorsTable.id, id), eq(vendorsTable.orgId, orgId)));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  const linkError = await linkVendorToEvent(orgId, vendor.id, body);
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }
  res.json(vendor);
});

// DELETE /api/vendors/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const id = text(req.params.id);
  const [existing] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.id, id), eq(vendorsTable.orgId, orgId)));
  if (!existing) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  await db.delete(eventVendorsTable).where(and(eq(eventVendorsTable.vendorId, id), eq(eventVendorsTable.orgId, orgId)));
  await db.delete(vendorsTable).where(and(eq(vendorsTable.id, id), eq(vendorsTable.orgId, orgId)));
  res.status(204).send();
});

export default router;
