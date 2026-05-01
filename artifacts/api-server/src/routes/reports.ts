import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";

const router = Router();

function numberValue(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function moneyFromCents(value: unknown): string {
  const amount = numberValue(value) / 100;
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function listItems(items: Array<{ label: string; detail: string }>): string {
  if (!items.length) return "<li>No items for this period.</li>";
  return items
    .map((item) => `<li><strong>${escapeHtml(item.label)}</strong><br><span>${escapeHtml(item.detail)}</span></li>`)
    .join("");
}

router.get("/board-monthly", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!requireOperationsTier(org, res)) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.toISOString().slice(0, 10);
  const next60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    eventRows,
    registrationRows,
    sponsorRows,
    memberRows,
    contactRows,
    ticketRows,
    upcomingRows,
    attentionRows,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE start_date >= ${today})::int AS upcoming,
        COUNT(*) FILTER (WHERE created_at >= ${monthStart})::int AS created_this_month
      FROM events
      WHERE org_id = ${org.id}
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= ${monthStart})::int AS this_month,
        COUNT(*) FILTER (WHERE status IN ('pending_payment', 'pending_approval'))::int AS pending,
        COUNT(*) FILTER (WHERE stripe_payment_status = 'unpaid')::int AS unpaid,
        COALESCE(SUM(fee_amount) FILTER (WHERE stripe_payment_status = 'paid'), 0)::int AS paid_cents
      FROM registrations
      WHERE org_id = ${org.id}
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE created_at >= ${monthStart})::int AS created_this_month
      FROM sponsors
      WHERE org_id = ${org.id}
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE created_at >= ${monthStart})::int AS new_this_month
      FROM members
      WHERE org_id = ${org.id}
    `),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM org_contact_submissions WHERE org_id = ${org.id} AND created_at >= ${monthStart})::int AS contacts,
        (SELECT COUNT(*) FROM newsletter_subscribers WHERE org_id = ${org.id} AND subscribed_at >= ${monthStart})::int AS subscribers
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS ticket_sales,
        COALESCE(SUM(amount_paid), 0)::int AS ticket_cents,
        COUNT(*) FILTER (WHERE payment_status != 'paid')::int AS unpaid_sales
      FROM ticket_sales
      WHERE org_id = ${org.id}
    `),
    db.execute(sql`
      SELECT name, start_date, start_time, location
      FROM events
      WHERE org_id = ${org.id}
        AND is_active = true
        AND start_date >= ${today}
        AND start_date <= ${next60}
      ORDER BY start_date ASC
      LIMIT 5
    `),
    db.execute(sql`
      SELECT name, type, status, stripe_payment_status
      FROM registrations
      WHERE org_id = ${org.id}
        AND (status IN ('pending_payment', 'pending_approval') OR stripe_payment_status = 'unpaid')
      ORDER BY created_at DESC
      LIMIT 5
    `),
  ]);

  const events = eventRows.rows[0] as Record<string, unknown> | undefined;
  const registrations = registrationRows.rows[0] as Record<string, unknown> | undefined;
  const sponsors = sponsorRows.rows[0] as Record<string, unknown> | undefined;
  const members = memberRows.rows[0] as Record<string, unknown> | undefined;
  const contacts = contactRows.rows[0] as Record<string, unknown> | undefined;
  const tickets = ticketRows.rows[0] as Record<string, unknown> | undefined;

  const metrics = {
    totalEvents: numberValue(events?.total),
    upcomingEvents: numberValue(events?.upcoming),
    eventsCreatedThisMonth: numberValue(events?.created_this_month),
    registrationsThisMonth: numberValue(registrations?.this_month),
    pendingRegistrations: numberValue(registrations?.pending),
    unpaidRegistrations: numberValue(registrations?.unpaid),
    registrationRevenueCents: numberValue(registrations?.paid_cents),
    activeSponsors: numberValue(sponsors?.active),
    sponsorsCreatedThisMonth: numberValue(sponsors?.created_this_month),
    activeMembers: numberValue(members?.active),
    newMembersThisMonth: numberValue(members?.new_this_month),
    newContactsThisMonth: numberValue(contacts?.contacts) + numberValue(contacts?.subscribers),
    ticketSales: numberValue(tickets?.ticket_sales),
    ticketRevenueCents: numberValue(tickets?.ticket_cents),
    unpaidTicketSales: numberValue(tickets?.unpaid_sales),
  };

  const needsAttention = attentionRows.rows.map((row) => ({
    label: String((row as Record<string, unknown>).name ?? "Registration"),
    detail: `${String((row as Record<string, unknown>).type ?? "registration")} · ${String((row as Record<string, unknown>).status ?? "pending")} · payment ${String((row as Record<string, unknown>).stripe_payment_status ?? "unknown")}`,
  }));

  const upcoming = upcomingRows.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      label: String(r.name ?? "Event"),
      detail: [r.start_date, r.start_time, r.location].filter(Boolean).join(" · "),
    };
  });

  const sections = {
    executiveSummary: [
      `${org.name} has ${metrics.upcomingEvents} upcoming event${metrics.upcomingEvents === 1 ? "" : "s"} on the calendar.`,
      `${metrics.pendingRegistrations + metrics.unpaidTicketSales} item${metrics.pendingRegistrations + metrics.unpaidTicketSales === 1 ? "" : "s"} need payment or approval attention.`,
      `${metrics.newContactsThisMonth + metrics.newMembersThisMonth} new contact/member record${metrics.newContactsThisMonth + metrics.newMembersThisMonth === 1 ? "" : "s"} came in this month.`,
    ],
    events: upcoming,
    needsAttention,
    communications: [
      {
        label: "Audience growth",
        detail: `${metrics.newContactsThisMonth} new contact or subscriber record${metrics.newContactsThisMonth === 1 ? "" : "s"} this month.`,
      },
    ],
    revenue: [
      {
        label: "Registration revenue",
        detail: `${moneyFromCents(metrics.registrationRevenueCents)} recorded from paid registrations.`,
      },
      {
        label: "Ticket revenue",
        detail: `${moneyFromCents(metrics.ticketRevenueCents)} recorded from ticket sales.`,
      },
    ],
    members: [
      {
        label: "Membership",
        detail: `${metrics.activeMembers} active member${metrics.activeMembers === 1 ? "" : "s"}; ${metrics.newMembersThisMonth} added this month.`,
      },
    ],
  };

  const html = `<!doctype html>
<article class="pillar-board-report">
  <header>
    <p>${escapeHtml(now.toLocaleDateString())}</p>
    <h1>${escapeHtml(org.name)} Board Report</h1>
  </header>
  <section>
    <h2>Executive Summary</h2>
    <ul>${sections.executiveSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
  </section>
  <section>
    <h2>Events / Registrations</h2>
    <ul>${listItems(sections.events)}</ul>
  </section>
  <section>
    <h2>Sponsorships / Revenue</h2>
    <ul>${listItems(sections.revenue)}</ul>
  </section>
  <section>
    <h2>Members / Contacts</h2>
    <ul>${listItems([...sections.members, ...sections.communications])}</ul>
  </section>
  <section>
    <h2>Needs Attention</h2>
    <ul>${listItems(sections.needsAttention)}</ul>
  </section>
</article>`;

  res.json({
    org: { id: org.id, name: org.name, slug: org.slug, tier: org.tier },
    generatedAt: now.toISOString(),
    period: {
      month: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
      startsAt: monthStart.toISOString(),
    },
    metrics,
    sections,
    html,
  });
});

export default router;
