import { Router, type Request, type Response } from "express";
import { db, eventsTable, vendorsTable, sponsorsTable, contactsTable, paymentsTable } from "@workspace/db";
import { eq, and, count, sum, gte } from "drizzle-orm";
import { resolveOrgId } from "../lib/resolveOrg";

const router = Router();

// GET /api/stats
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrgId(req, res);
  if (!orgId) return;
  const today = new Date().toISOString().split("T")[0];
  const [
    eventsRes,
    vendorsRes,
    sponsorsRes,
    contactsRes,
    paymentsRes,
  ] = await Promise.all([
    db.select({ count: count() }).from(eventsTable).where(
      and(
        eq(eventsTable.orgId, orgId),
        eq(eventsTable.isActive, true),
        eq(eventsTable.status, "published"),
      )
    ),
    db.select({ count: count() }).from(vendorsTable).where(
      and(eq(vendorsTable.orgId, orgId), eq(vendorsTable.status, "active"))
    ),
    db.select({ count: count() }).from(sponsorsTable).where(
      and(eq(sponsorsTable.orgId, orgId), eq(sponsorsTable.status, "active"))
    ),
    db.select({ count: count() }).from(contactsTable).where(eq(contactsTable.orgId, orgId)),
    db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(
      and(eq(paymentsTable.orgId, orgId), eq(paymentsTable.status, "completed"))
    ),
  ]);

  res.json({
    activeEvents: eventsRes[0]?.count ?? 0,
    totalVendors: vendorsRes[0]?.count ?? 0,
    totalSponsors: sponsorsRes[0]?.count ?? 0,
    totalContacts: contactsRes[0]?.count ?? 0,
    totalRevenue: Number(paymentsRes[0]?.total ?? 0),
  });
});

export default router;
