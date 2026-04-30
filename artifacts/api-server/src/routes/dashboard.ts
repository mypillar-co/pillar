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
import { and, count, desc, eq, gte, lte, ne, or } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";

const router = Router();

function numberValue(value: unknown): number {
  return Number(value ?? 0) || 0;
}

router.get("/briefing", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sixtyDaysOut = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [
    [upcomingEventsRow],
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
    db.select({ n: count() }).from(eventsTable).where(and(
      eq(eventsTable.orgId, org.id),
      eq(eventsTable.isActive, true),
      gte(eventsTable.startDate, today),
      lte(eventsTable.startDate, sixtyDaysOut),
    )),
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
    db.select({
      id: eventsTable.id,
      name: eventsTable.name,
      startDate: eventsTable.startDate,
      startTime: eventsTable.startTime,
      location: eventsTable.location,
      isTicketed: eventsTable.isTicketed,
      hasRegistration: eventsTable.hasRegistration,
    }).from(eventsTable).where(and(
      eq(eventsTable.orgId, org.id),
      eq(eventsTable.isActive, true),
      gte(eventsTable.startDate, today),
    )).orderBy(eventsTable.startDate).limit(5),
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
    upcomingEvents: numberValue(upcomingEventsRow?.n),
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
      event.startTime,
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
