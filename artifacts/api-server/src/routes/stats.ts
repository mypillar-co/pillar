import { Router, type Request, type Response } from "express";
import {
  db,
  eventsTable,
  vendorsTable,
  sponsorsTable,
  contactsTable,
  paymentsTable,
  socialPostsTable,
  studioOutputsTable,
  registrationsTable,
  notificationsTable,
  membersTable,
} from "@workspace/db";
import { eq, and, count, sum, gte, lte, sql } from "drizzle-orm";
import { resolveOrgId } from "../lib/resolveOrg";

const router = Router();

// GET /api/stats
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrgId(req, res);
  if (!orgId) return;
  const [
    eventsRes,
    vendorsRes,
    sponsorsRes,
    contactsRes,
    paymentsRes,
    memberCountResult,
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
    db.select({ count: sql<number>`count(*)::int` }).from(membersTable).where(
      and(eq(membersTable.orgId, orgId), eq(membersTable.status, "active"))
    ),
  ]);

  const activeMembersCount = memberCountResult[0]?.count ?? 0;

  res.json({
    activeEvents: eventsRes[0]?.count ?? 0,
    totalVendors: vendorsRes[0]?.count ?? 0,
    totalSponsors: sponsorsRes[0]?.count ?? 0,
    totalContacts: contactsRes[0]?.count ?? 0,
    totalRevenue: Number(paymentsRes[0]?.total ?? 0),
    activeMembersCount,
  });
});

// GET /api/stats/activity — what Pillar handled in the past 7 days
router.get("/activity", async (req: Request, res: Response) => {
  const orgId = await resolveOrgId(req, res);
  if (!orgId) return;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    socialPublished,
    contentGenerated,
    registrationsReceived,
    notificationsSent,
    upcomingEvents,
  ] = await Promise.all([
    db.select({ count: count() }).from(socialPostsTable).where(
      and(
        eq(socialPostsTable.orgId, orgId),
        eq(socialPostsTable.status, "published"),
        gte(socialPostsTable.publishedAt, since),
      )
    ),
    db.select({ count: count() }).from(studioOutputsTable).where(
      and(
        eq(studioOutputsTable.orgId, orgId),
        gte(studioOutputsTable.createdAt, since),
      )
    ),
    db.select({ count: count() }).from(registrationsTable).where(
      and(
        eq(registrationsTable.orgId, orgId),
        gte(registrationsTable.createdAt, since),
      )
    ),
    db.select({ count: count() }).from(notificationsTable).where(
      and(
        eq(notificationsTable.orgId, orgId),
        gte(notificationsTable.createdAt, since),
      )
    ),
    db.select({ count: count() }).from(eventsTable).where(
      and(
        eq(eventsTable.orgId, orgId),
        eq(eventsTable.status, "published"),
        gte(eventsTable.startDate, new Date().toISOString().split("T")[0]),
        lte(eventsTable.startDate, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
      )
    ),
  ]);

  res.json({
    socialPostsPublished: Number(socialPublished[0]?.count ?? 0),
    contentDraftsGenerated: Number(contentGenerated[0]?.count ?? 0),
    registrationsReceived: Number(registrationsReceived[0]?.count ?? 0),
    notificationsSent: Number(notificationsSent[0]?.count ?? 0),
    upcomingEventsCount: Number(upcomingEvents[0]?.count ?? 0),
  });
});

// GET /api/stats/decisions — items requiring human action
router.get("/decisions", async (req: Request, res: Response) => {
  const orgId = await resolveOrgId(req, res);
  if (!orgId) return;

  const [pendingRegistrations, draftSocialPosts, unreadNotifications] = await Promise.all([
    db.select({
      id: registrationsTable.id,
      name: registrationsTable.name,
      type: registrationsTable.type,
      createdAt: registrationsTable.createdAt,
    }).from(registrationsTable).where(
      and(
        eq(registrationsTable.orgId, orgId),
        eq(registrationsTable.status, "pending_approval"),
      )
    ).limit(5),

    db.select({
      id: socialPostsTable.id,
      content: sql<string>`LEFT(${socialPostsTable.content}, 80)`,
      platforms: socialPostsTable.platforms,
      scheduledAt: socialPostsTable.scheduledAt,
    }).from(socialPostsTable).where(
      and(
        eq(socialPostsTable.orgId, orgId),
        eq(socialPostsTable.status, "draft"),
      )
    ).limit(5),

    db.select({
      id: notificationsTable.id,
      title: notificationsTable.title,
      body: sql<string>`LEFT(${notificationsTable.body}, 100)`,
      type: notificationsTable.type,
      createdAt: notificationsTable.createdAt,
    }).from(notificationsTable).where(
      and(
        eq(notificationsTable.orgId, orgId),
        eq(notificationsTable.read, false),
      )
    ).orderBy(sql`${notificationsTable.createdAt} DESC`).limit(5),
  ]);

  res.json({
    pendingRegistrations,
    draftSocialPosts,
    unreadNotifications,
    totalDecisions: pendingRegistrations.length + draftSocialPosts.length + unreadNotifications.length,
  });
});

export default router;
