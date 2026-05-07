import { Router, type Request, type Response } from "express";
import {
  db,
  eventsTable,
  registrationsTable,
  sponsorsTable,
  ticketSalesTable,
  membersTable,
  orgContactSubmissionsTable,
  newsletterSubscribersTable,
} from "@workspace/db";
import { and, count, desc, eq, gte, ne, or } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";

const router = Router();

function numberValue(value: unknown): number {
  return Number(value ?? 0) || 0;
}

type DashboardEventRow = {
  id: string;
  name: string;
  startDate: string | null;
  startTime: string | null;
  location: string | null;
  isTicketed: boolean | null;
  hasRegistration: boolean | null;
};

function parseEventDate(value: string | null | undefined): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const parsed = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date(raw);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function formatDashboardTime(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match24 = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hour = Math.max(0, Math.min(23, Number(match24[1])));
    const minute = Math.max(0, Math.min(59, Number(match24[2])));
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }
  const match12 = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    const hour = Math.max(1, Math.min(12, Number(match12[1])));
    const minute = Math.max(0, Math.min(59, Number(match12[2] ?? 0)));
    return `${hour}:${String(minute).padStart(2, "0")} ${match12[3].toUpperCase()}`;
  }
  return raw;
}

async function loadUpcomingEvents(orgId: string): Promise<DashboardEventRow[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const eventRows = await db.select({
    id: eventsTable.id,
    name: eventsTable.name,
    startDate: eventsTable.startDate,
    startTime: eventsTable.startTime,
    location: eventsTable.location,
    isTicketed: eventsTable.isTicketed,
    hasRegistration: eventsTable.hasRegistration,
  }).from(eventsTable).where(and(
    eq(eventsTable.orgId, orgId),
    eq(eventsTable.isActive, true),
  )).limit(100);

  return eventRows
    .map((event) => ({ event, time: parseEventDate(event.startDate) }))
    .filter((entry): entry is { event: DashboardEventRow; time: number } =>
      entry.time !== null && entry.time >= todayStart.getTime(),
    )
    .sort((a, b) => a.time - b.time)
    .slice(0, 5)
    .map(({ event }) => event);
}

router.get("/briefing", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!requireOperationsTier(org, res)) return;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    [pendingRegistrationsRow],
    [pendingSponsorsRow],
    [unpaidRegistrationRow],
    [unpaidTicketRow],
    [newContactSubmissionsRow],
    [newSubscribersRow],
    [newMembersRow],
    upcomingEvents,
    recentRegistrations,
  ] = await Promise.all([
    db.select({ n: count() }).from(registrationsTable).where(and(
      eq(registrationsTable.orgId, org.id),
      or(eq(registrationsTable.status, "pending_approval"), eq(registrationsTable.status, "pending_payment")),
    )),
    db.select({ n: count() }).from(registrationsTable).where(and(
      eq(registrationsTable.orgId, org.id),
      eq(registrationsTable.type, "sponsor"),
      or(eq(registrationsTable.status, "pending_approval"), eq(registrationsTable.status, "pending_payment")),
    )),
    db.select({ n: count() }).from(registrationsTable).where(and(
      eq(registrationsTable.orgId, org.id),
      eq(registrationsTable.stripePaymentStatus, "unpaid"),
    )),
    db.select({ n: count() }).from(ticketSalesTable).where(and(
      eq(ticketSalesTable.orgId, org.id),
      ne(ticketSalesTable.paymentStatus, "paid"),
    )),
    db.select({ n: count() }).from(orgContactSubmissionsTable).where(and(
      eq(orgContactSubmissionsTable.orgId, org.id),
      gte(orgContactSubmissionsTable.createdAt, weekAgo),
    )),
    db.select({ n: count() }).from(newsletterSubscribersTable).where(and(
      eq(newsletterSubscribersTable.orgId, org.id),
      gte(newsletterSubscribersTable.subscribedAt, weekAgo),
    )),
    db.select({ n: count() }).from(membersTable).where(and(
      eq(membersTable.orgId, org.id),
      gte(membersTable.createdAt, weekAgo),
    )),
    loadUpcomingEvents(org.id),
    db.select({
      id: registrationsTable.id,
      name: registrationsTable.name,
      type: registrationsTable.type,
      createdAt: registrationsTable.createdAt,
    }).from(registrationsTable).where(and(
      eq(registrationsTable.orgId, org.id),
      gte(registrationsTable.createdAt, weekAgo),
    )).orderBy(desc(registrationsTable.createdAt)).limit(4),
  ]);

  const metrics = {
    upcomingEvents: upcomingEvents.length,
    pendingRegistrations: numberValue(pendingRegistrationsRow?.n),
    pendingSponsors: numberValue(pendingSponsorsRow?.n),
    unpaidItems: numberValue(unpaidRegistrationRow?.n) + numberValue(unpaidTicketRow?.n),
    newContacts: numberValue(newContactSubmissionsRow?.n) + numberValue(newSubscribersRow?.n),
    newMembers: numberValue(newMembersRow?.n),
  };

  const activity = [
    ...recentRegistrations.map((registration) => ({
      label: `${registration.type === "sponsor" ? "Sponsor" : "Registration"} received`,
      detail: `${registration.name} came in this week.`,
      tone: "positive",
      href: "/dashboard/registrations",
    })),
    ...(metrics.newMembers > 0 ? [{
      label: "Members added",
      detail: `${metrics.newMembers} new member${metrics.newMembers === 1 ? "" : "s"} joined the roster this week.`,
      tone: "positive",
      href: "/dashboard/members",
    }] : []),
    ...(metrics.newContacts > 0 ? [{
      label: "Audience activity",
      detail: `${metrics.newContacts} new contact or subscriber record${metrics.newContacts === 1 ? "" : "s"} came in.`,
      tone: "info",
      href: "/dashboard/communications",
    }] : []),
  ];

  const needsAttention = [
    ...(metrics.pendingRegistrations > 0 ? [{
      label: "Registrations need review",
      detail: `${metrics.pendingRegistrations} registration${metrics.pendingRegistrations === 1 ? "" : "s"} are waiting for payment or approval.`,
      priority: "high",
      href: "/dashboard/registrations",
    }] : []),
    ...(metrics.pendingSponsors > 0 ? [{
      label: "Sponsors are waiting",
      detail: `${metrics.pendingSponsors} sponsor application${metrics.pendingSponsors === 1 ? "" : "s"} need a decision.`,
      priority: "high",
      href: "/dashboard/sponsors",
    }] : []),
    ...(metrics.unpaidItems > 0 ? [{
      label: "Open revenue items",
      detail: `${metrics.unpaidItems} payment-related item${metrics.unpaidItems === 1 ? "" : "s"} are still unpaid or pending.`,
      priority: "medium",
      href: "/dashboard/payments",
    }] : []),
    ...(metrics.upcomingEvents === 0 ? [{
      label: "No upcoming events",
      detail: "Add the next event so your public site stays current.",
      priority: "medium",
      href: "/dashboard/events",
    }] : []),
  ];

  const upcoming = upcomingEvents.map((event) => ({
    label: event.name,
    detail: [
      formatDashboardTime(event.startTime),
      event.location,
      event.isTicketed ? "ticketed" : null,
      event.hasRegistration ? "registration enabled" : null,
    ].filter(Boolean).join(" · ") || "Event is on the calendar.",
    date: event.startDate,
    href: "/dashboard/events",
  }));

  res.json({
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      tier: org.tier,
    },
    metrics,
    activity,
    needsAttention,
    upcoming,
  });
});

export default router;
