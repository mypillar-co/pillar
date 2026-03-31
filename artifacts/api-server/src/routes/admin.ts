import { Router, type Request, type Response } from "express";
import {
  db,
  subscriptionsTable,
  usersTable,
  organizationsTable,
  agentLogsTable,
  contentQueueTable,
  outreachProspectsTable,
} from "@workspace/db";
import { eq, count, and, gte, lt, isNotNull, sql, desc } from "drizzle-orm";
import { adminMiddleware } from "../middlewares/adminMiddleware";
import { TIERS } from "../tiers";

const router = Router();

router.use("/admin", adminMiddleware);

function tierPrice(tierId: string | null): number {
  if (!tierId) return 0;
  const tier = TIERS.find((t) => t.id === tierId);
  return tier?.price ?? 0;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

router.get("/admin/overview", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const [allSubs, allOrgs, allUsers] = await Promise.all([
      db.select().from(subscriptionsTable),
      db.select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        tier: organizationsTable.tier,
        createdAt: organizationsTable.createdAt,
        subscriptionStatus: organizationsTable.subscriptionStatus,
      }).from(organizationsTable),
      db.select({ id: usersTable.id, createdAt: usersTable.createdAt }).from(usersTable),
    ]);

    const activeSubs = allSubs.filter((s) => s.status === "active");
    const mrr = activeSubs.reduce((sum, s) => sum + tierPrice(s.tierId), 0);
    const arr = mrr * 12;

    const newThisMonth = allSubs.filter(
      (s) => s.createdAt >= monthStart
    ).length;

    const churnedThisMonth = allSubs.filter(
      (s) =>
        s.status === "canceled" &&
        s.cancelledAt &&
        s.cancelledAt >= monthStart
    ).length;

    const activeLastMonth = allSubs.filter(
      (s) =>
        s.createdAt < monthStart &&
        (s.status === "active" ||
          (s.cancelledAt && s.cancelledAt >= monthStart))
    ).length;

    const churnRate =
      activeLastMonth > 0
        ? ((churnedThisMonth / activeLastMonth) * 100).toFixed(1)
        : "0.0";

    const arpu = activeSubs.length > 0 ? (mrr / activeSubs.length).toFixed(2) : "0.00";

    const tierBreakdown = TIERS.map((tier) => {
      const subs = activeSubs.filter((s) => s.tierId === tier.id);
      return {
        tierId: tier.id,
        tierName: tier.name,
        price: tier.price,
        count: subs.length,
        revenue: subs.length * tier.price,
      };
    });

    res.json({
      mrr,
      arr,
      totalSubscribers: activeSubs.length,
      totalOrgs: allOrgs.length,
      totalUsers: allUsers.length,
      newThisMonth,
      churnedThisMonth,
      churnRate: parseFloat(churnRate),
      arpu: parseFloat(arpu),
      tierBreakdown,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/subscribers", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        subId: subscriptionsTable.id,
        status: subscriptionsTable.status,
        tierId: subscriptionsTable.tierId,
        createdAt: subscriptionsTable.createdAt,
        cancelledAt: subscriptionsTable.cancelledAt,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
        userId: subscriptionsTable.userId,
        orgName: organizationsTable.name,
        orgType: organizationsTable.type,
        orgSlug: organizationsTable.slug,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(subscriptionsTable)
      .leftJoin(organizationsTable, eq(organizationsTable.userId, subscriptionsTable.userId))
      .leftJoin(usersTable, eq(usersTable.id, subscriptionsTable.userId))
      .orderBy(sql`${subscriptionsTable.createdAt} DESC`);

    const enriched = rows.map((r) => ({
      ...r,
      tierName: TIERS.find((t) => t.id === r.tierId)?.name ?? r.tierId ?? "Unknown",
      monthlyValue: tierPrice(r.tierId),
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/financials", async (_req: Request, res: Response) => {
  try {
    const allSubs = await db.select().from(subscriptionsTable);

    const now = new Date();

    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
      const end = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i + 1, 1));
      months.push({ label: monthLabel(start), start, end });
    }

    const monthly = months.map(({ label, start, end }) => {
      const activeThatMonth = allSubs.filter(
        (s) =>
          s.createdAt < end &&
          (s.status === "active" || (s.cancelledAt && s.cancelledAt >= end))
      );
      const newSubs = allSubs.filter(
        (s) => s.createdAt >= start && s.createdAt < end
      ).length;
      const churned = allSubs.filter(
        (s) =>
          s.status === "canceled" &&
          s.cancelledAt &&
          s.cancelledAt >= start &&
          s.cancelledAt < end
      ).length;
      const mrr = activeThatMonth.reduce((sum, s) => sum + tierPrice(s.tierId), 0);
      return { label, mrr, newSubs, churned, active: activeThatMonth.length };
    });

    const tierRevenue = TIERS.map((tier) => {
      const active = allSubs.filter(
        (s) => s.status === "active" && s.tierId === tier.id
      );
      return {
        tierId: tier.id,
        tierName: tier.name,
        price: tier.price,
        subscribers: active.length,
        monthlyRevenue: active.length * tier.price,
        annualRevenue: active.length * tier.price * 12,
      };
    });

    const totalMrr = tierRevenue.reduce((s, t) => s + t.monthlyRevenue, 0);

    res.json({ monthly, tierRevenue, totalMrr, totalArr: totalMrr * 12 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/churn", async (_req: Request, res: Response) => {
  try {
    const canceled = await db
      .select({
        subId: subscriptionsTable.id,
        tierId: subscriptionsTable.tierId,
        cancelledAt: subscriptionsTable.cancelledAt,
        createdAt: subscriptionsTable.createdAt,
        orgName: organizationsTable.name,
        email: usersTable.email,
      })
      .from(subscriptionsTable)
      .leftJoin(organizationsTable, eq(organizationsTable.userId, subscriptionsTable.userId))
      .leftJoin(usersTable, eq(usersTable.id, subscriptionsTable.userId))
      .where(eq(subscriptionsTable.status, "canceled"))
      .orderBy(sql`${subscriptionsTable.cancelledAt} DESC NULLS LAST`);

    const enriched = canceled.map((r) => {
      const lifetimeDays =
        r.cancelledAt && r.createdAt
          ? Math.round(
              (r.cancelledAt.getTime() - r.createdAt.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null;
      return {
        ...r,
        tierName: TIERS.find((t) => t.id === r.tierId)?.name ?? "Unknown",
        lifetimeDays,
        lostRevenue: tierPrice(r.tierId),
      };
    });

    const now = new Date();
    const monthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const churnedThisMonth = enriched.filter(
      (r) => r.cancelledAt && r.cancelledAt >= monthStart
    ).length;
    const churnedLastMonth = enriched.filter(
      (r) =>
        r.cancelledAt &&
        r.cancelledAt >= lastMonthStart &&
        r.cancelledAt < monthStart
    ).length;

    const avgLifetimeDays =
      enriched.filter((r) => r.lifetimeDays !== null).length > 0
        ? Math.round(
            enriched
              .filter((r) => r.lifetimeDays !== null)
              .reduce((sum, r) => sum + (r.lifetimeDays ?? 0), 0) /
              enriched.filter((r) => r.lifetimeDays !== null).length
          )
        : null;

    res.json({
      totalCanceled: enriched.length,
      churnedThisMonth,
      churnedLastMonth,
      avgLifetimeDays,
      canceled: enriched,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/health", async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    await db.select({ one: sql<number>`1` }).from(usersTable).limit(1);
    const dbLatency = Date.now() - start;

    const [subCount] = await db.select({ count: count() }).from(subscriptionsTable);
    const [orgCount] = await db.select({ count: count() }).from(organizationsTable);
    const [userCount] = await db.select({ count: count() }).from(usersTable);

    res.json({
      status: "healthy",
      dbLatencyMs: dbLatency,
      uptime: process.uptime(),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion: process.version,
      env: process.env.NODE_ENV ?? "unknown",
      counts: {
        subscriptions: subCount?.count ?? 0,
        organizations: orgCount?.count ?? 0,
        users: userCount?.count ?? 0,
      },
      schedulers: {
        siteUpdates: "30min",
        socialPublishing: "5min",
        domainRenewal: "6h",
        sslCheck: "1h",
        dnsPoll: "15min",
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "unhealthy",
      error: String(err),
      dbLatencyMs: Date.now() - start,
      uptime: process.uptime(),
    });
  }
});

router.get("/admin/me", async (req: Request, res: Response) => {
  res.json({ id: req.user!.id, isAdmin: true });
});

// ── AI Agents ──────────────────────────────────────────────────────────────

const AGENT_DEFS = [
  {
    name: "customerSuccess",
    label: "Customer Success",
    description: "Sends welcome emails, website nudges, trial ending reminders, and auto-responds to support tickets.",
    schedule: "Every 30 min",
  },
  {
    name: "operations",
    label: "Operations",
    description: "Sends weekly founder digest every Monday and payment failure recovery emails.",
    schedule: "Every 1 hr",
  },
  {
    name: "content",
    label: "Content",
    description: "Generates 5 marketing post drafts daily for LinkedIn, Facebook, and X.",
    schedule: "Every 24 hr",
  },
  {
    name: "outreach",
    label: "Outreach",
    description: "Sends personalized cold outreach emails and follow-ups to prospects. Respects a 40 email/day limit.",
    schedule: "Every 1 hr",
  },
];

router.get("/admin/agents", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const allLogs = await db
      .select()
      .from(agentLogsTable)
      .orderBy(desc(agentLogsTable.createdAt))
      .limit(200);

    const agents = AGENT_DEFS.map((def) => {
      const agentLogs = allLogs.filter(l => l.agentName === def.name);
      const lastLog = agentLogs[0];
      const todayCount = agentLogs.filter(l => l.createdAt >= startOfDay && l.status === "success").length;
      const errorCount = agentLogs.filter(l => l.status === "error").length;
      return {
        ...def,
        lastRun: lastLog?.createdAt ?? null,
        actionsToday: todayCount,
        totalErrors: errorCount,
        recentLogs: agentLogs.slice(0, 10),
        emailConfigured: !!process.env.RESEND_API_KEY,
      };
    });

    res.json({ agents });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/admin/agents/logs", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const agentName = req.query.agent as string | undefined;
    const logs = await db
      .select()
      .from(agentLogsTable)
      .where(agentName ? eq(agentLogsTable.agentName, agentName) : undefined)
      .orderBy(desc(agentLogsTable.createdAt))
      .limit(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Content queue
router.get("/admin/content-queue", async (_req: Request, res: Response) => {
  try {
    const items = await db
      .select()
      .from(contentQueueTable)
      .orderBy(desc(contentQueueTable.generatedAt))
      .limit(50);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/admin/content-queue/:id", async (req: Request, res: Response) => {
  try {
    const { status } = req.body as { status: string };
    const [updated] = await db.update(contentQueueTable)
      .set({ status, ...(status === "posted" ? { postedAt: new Date() } : {}) })
      .where(eq(contentQueueTable.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Outreach prospects
router.get("/admin/prospects", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(outreachProspectsTable)
      .orderBy(desc(outreachProspectsTable.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/admin/prospects", async (req: Request, res: Response) => {
  try {
    const { orgName, orgType, contactName, contactRole, contactEmail, currentWebsite, notes } = req.body as Record<string, string>;
    if (!orgName || !contactEmail) return res.status(400).json({ error: "orgName and contactEmail required" });
    const [row] = await db.insert(outreachProspectsTable)
      .values({ orgName, orgType, contactName, contactRole, contactEmail, currentWebsite, notes })
      .returning();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/admin/prospects/:id", async (req: Request, res: Response) => {
  try {
    const [updated] = await db.update(outreachProspectsTable)
      .set(req.body as Partial<typeof outreachProspectsTable.$inferInsert>)
      .where(eq(outreachProspectsTable.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/admin/prospects/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(outreachProspectsTable).where(eq(outreachProspectsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin: Test email send ───────────────────────────────────────────────────
router.post("/admin/test-email", async (req: Request, res: Response) => {
  const { to, type } = req.body as { to?: string; type?: string };
  if (!to) { res.status(400).json({ error: "to is required" }); return; }

  const { sendWelcomeEmail, sendTrialEndingEmail, sendWebsiteNudge } = await import("../mailer");

  let result;
  if (type === "trial") {
    result = await sendTrialEndingEmail(to, "Test", "Demo Organization", 3);
  } else if (type === "nudge") {
    result = await sendWebsiteNudge(to, "Test", "Demo Organization");
  } else {
    result = await sendWelcomeEmail(to, "Test", "Demo Organization");
  }

  res.json(result);
});

export default router;
