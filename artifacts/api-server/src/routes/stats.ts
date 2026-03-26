import { Router, type Request, type Response } from "express";
import { db, eventsTable, vendorsTable, sponsorsTable, contactsTable, paymentsTable, organizationsTable } from "@workspace/db";
import { eq, and, count, sum, gte } from "drizzle-orm";

const router = Router();

// GET /api/stats
router.get("/", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [org] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) {
    res.json({ activeEvents: 0, totalVendors: 0, totalSponsors: 0, totalRevenue: 0, totalContacts: 0 });
    return;
  }
  const orgId = org.id;
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
