/**
 * Admin endpoints for event registration management.
 * All routes require authentication and org membership.
 *
 * GET  /api/management/event-registrations?event=<slug>&type=vendor|sponsor|participant
 * POST /api/management/registrations/:id/approve
 * POST /api/management/registrations/:id/reject
 * PATCH /api/management/registrations/:id/documents
 * GET  /api/management/revenue?event=<slug>
 * GET  /api/management/payments?event=<slug>
 * POST /api/management/payments/manual
 * GET  /api/management/tickets?event=<slug>
 * GET  /api/management/contacts?event=<slug>&type=all|vendor|sponsor|ticket|participant
 * POST /api/management/emails/send
 * POST /api/management/emails/bulk
 */

import { Router, type Request, type Response } from "express";
import {
  db, organizationsTable, eventsTable, registrationsTable,
  sponsorsTable, eventSponsorsTable, vendorsTable, eventVendorsTable,
  ticketSalesTable, paymentsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";

const router = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function getOrgForUser(req: Request, res: Response): Promise<typeof organizationsTable.$inferSelect | null> {
  const org = await resolveFullOrg(req, res);
  return org ?? null;
}

async function getEventBySlug(eventSlug: string, orgId: string): Promise<typeof eventsTable.$inferSelect | null> {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.slug, eventSlug), eq(eventsTable.orgId, orgId)));
  return event ?? null;
}

// ─── GET /api/management/event-registrations ─────────────────────────────────

router.get("/event-registrations", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const eventSlug = req.query.event as string | undefined;
  const type = req.query.type as string | undefined;

  if (!eventSlug) { res.status(400).json({ error: "event param required" }); return; }

  const event = await getEventBySlug(eventSlug, org.id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const conditions = [
    eq(registrationsTable.orgId, org.id),
    eq(registrationsTable.eventId, event.id),
  ];
  if (type && type !== "all") {
    conditions.push(eq(registrationsTable.type, type));
  }

  const rows = await db
    .select()
    .from(registrationsTable)
    .where(and(...conditions))
    .orderBy(desc(registrationsTable.createdAt));

  res.json({ ok: true, event: eventSlug, registrations: rows });
});

// ─── POST /api/management/registrations/:id/approve ──────────────────────────

router.post("/registrations/:id/approve", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const { id } = req.params;
  const [reg] = await db
    .select()
    .from(registrationsTable)
    .where(and(eq(registrationsTable.id, id), eq(registrationsTable.orgId, org.id)));

  if (!reg) { res.status(404).json({ error: "Registration not found" }); return; }

  await db
    .update(registrationsTable)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(registrationsTable.id, id));

  // On sponsor approval: create a sponsor record + event_sponsors link
  if (reg.type === "sponsor" && reg.eventId) {
    try {
      const [newSponsor] = await db.insert(sponsorsTable).values({
        orgId: org.id,
        name: reg.name,
        email: reg.email ?? undefined,
        website: reg.website ?? undefined,
        logoUrl: reg.logoUrl ?? undefined,
        status: "active",
        siteVisible: true,
        tierRank: tierRankForTier(reg.tier),
      }).onConflictDoNothing().returning({ id: sponsorsTable.id });

      if (newSponsor) {
        await db.insert(eventSponsorsTable).values({
          orgId: org.id,
          eventId: reg.eventId,
          sponsorId: newSponsor.id,
          tier: reg.tier ?? "Supporting",
          status: "confirmed",
        }).onConflictDoNothing();

        await db.update(registrationsTable)
          .set({ sponsorId: newSponsor.id })
          .where(eq(registrationsTable.id, id));
      }
    } catch { /* sponsor already linked */ }
  }

  // On vendor approval: create a vendor record + event_vendors link
  if (reg.type === "vendor" && reg.eventId) {
    try {
      const [newVendor] = await db.insert(vendorsTable).values({
        orgId: org.id,
        name: reg.name,
        email: reg.email ?? undefined,
        phone: reg.phone ?? undefined,
        vendorType: reg.vendorType ?? undefined,
        notes: reg.products ?? undefined,
        status: "active",
      }).onConflictDoNothing().returning({ id: vendorsTable.id });

      if (newVendor) {
        await db.insert(eventVendorsTable).values({
          orgId: org.id,
          eventId: reg.eventId,
          vendorId: newVendor.id,
          status: "confirmed",
        }).onConflictDoNothing();

        await db.update(registrationsTable)
          .set({ vendorId: newVendor.id })
          .where(eq(registrationsTable.id, id));
      }
    } catch { /* vendor already linked */ }
  }

  res.json({ ok: true, id, status: "approved" });
});

// ─── POST /api/management/registrations/:id/reject ───────────────────────────

router.post("/registrations/:id/reject", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  const [reg] = await db
    .select()
    .from(registrationsTable)
    .where(and(eq(registrationsTable.id, id), eq(registrationsTable.orgId, org.id)));

  if (!reg) { res.status(404).json({ error: "Registration not found" }); return; }

  await db
    .update(registrationsTable)
    .set({ status: "rejected", rejectedAt: new Date(), rejectionReason: reason ?? null })
    .where(eq(registrationsTable.id, id));

  res.json({ ok: true, id, status: "rejected" });
});

// ─── PATCH /api/management/registrations/:id/documents ───────────────────────

router.patch("/registrations/:id/documents", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const { id } = req.params;
  const { servSafeReceived, insuranceReceived } = req.body as Record<string, boolean | undefined>;

  const [reg] = await db
    .select()
    .from(registrationsTable)
    .where(and(eq(registrationsTable.id, id), eq(registrationsTable.orgId, org.id)));

  if (!reg) { res.status(404).json({ error: "Registration not found" }); return; }

  const updates: Record<string, unknown> = {};
  if (servSafeReceived === true && !reg.servSafeUrl) {
    updates.servSafeUrl = "received";
  }
  if (insuranceReceived === true && !reg.insuranceCertUrl) {
    updates.insuranceCertUrl = "received";
  }

  if (Object.keys(updates).length > 0) {
    await db.update(registrationsTable).set(updates).where(eq(registrationsTable.id, id));
  }

  res.json({ ok: true, id, updated: Object.keys(updates) });
});

// ─── GET /api/management/revenue?event=<slug> ─────────────────────────────────

router.get("/revenue", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const eventSlug = req.query.event as string | undefined;
  if (!eventSlug) { res.status(400).json({ error: "event param required" }); return; }

  const event = await getEventBySlug(eventSlug, org.id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  // Ticket revenue from ticket_sales
  const ticketSales = await db
    .select({ amount: ticketSalesTable.amountPaid, qty: ticketSalesTable.quantity })
    .from(ticketSalesTable)
    .where(and(
      eq(ticketSalesTable.eventId, event.id),
      eq(ticketSalesTable.paymentStatus, "completed"),
    ));

  const ticketRevCents = Math.round(ticketSales.reduce((s, r) => s + (r.amount ?? 0), 0) * 100);

  // Other payments from payments table
  const payments = await db
    .select({ type: paymentsTable.paymentType, amount: paymentsTable.amount, status: paymentsTable.status })
    .from(paymentsTable)
    .where(and(
      eq(paymentsTable.orgId, org.id),
      eq(paymentsTable.eventId, event.id),
      eq(paymentsTable.status, "succeeded"),
    ));

  const byCategory: Record<string, number> = { participants: 0, vendors: 0, sponsors: 0, tickets: ticketRevCents };
  for (const p of payments) {
    const cat = p.type ?? "other";
    const cents = Math.round((p.amount ?? 0) * 100);
    if (cat === "participant") byCategory.participants = (byCategory.participants ?? 0) + cents;
    else if (cat === "vendor") byCategory.vendors = (byCategory.vendors ?? 0) + cents;
    else if (cat === "sponsor") byCategory.sponsors = (byCategory.sponsors ?? 0) + cents;
    else if (cat === "ticket") byCategory.tickets = (byCategory.tickets ?? 0) + cents;
  }

  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);

  res.json({
    ok: true,
    event: eventSlug,
    participants: byCategory.participants,
    vendors: byCategory.vendors,
    sponsors: byCategory.sponsors,
    tickets: byCategory.tickets,
    total,
    currency: "cents",
  });
});

// ─── GET /api/management/payments?event=<slug> ────────────────────────────────

router.get("/payments", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const eventSlug = req.query.event as string | undefined;
  if (!eventSlug) { res.status(400).json({ error: "event param required" }); return; }

  const event = await getEventBySlug(eventSlug, org.id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const [ticketSales, manualPayments] = await Promise.all([
    db.select().from(ticketSalesTable)
      .where(eq(ticketSalesTable.eventId, event.id))
      .orderBy(desc(ticketSalesTable.createdAt)),
    db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.orgId, org.id), eq(paymentsTable.eventId, event.id)))
      .orderBy(desc(paymentsTable.createdAt)),
  ]);

  res.json({
    ok: true,
    event: eventSlug,
    ticketSales: ticketSales.map(t => ({
      id: t.id,
      type: "ticket",
      name: t.attendeeName,
      email: t.attendeeEmail,
      amount: t.amountPaid,
      quantity: t.quantity,
      status: t.paymentStatus,
      method: t.paymentMethod,
      createdAt: t.createdAt,
    })),
    payments: manualPayments.map(p => ({
      id: p.id,
      type: p.paymentType,
      amount: p.amount,
      status: p.status,
      source: p.source,
      description: p.description,
      createdAt: p.createdAt,
    })),
  });
});

// ─── POST /api/management/payments/manual ─────────────────────────────────────

router.post("/payments/manual", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const { eventSlug, amountCents, category, payerName, payerEmail, notes } = req.body as {
    eventSlug?: string; amountCents?: number; category?: string;
    payerName?: string; payerEmail?: string; notes?: string;
  };

  if (!eventSlug) { res.status(400).json({ error: "eventSlug required" }); return; }
  if (!amountCents || amountCents <= 0) { res.status(400).json({ error: "amountCents must be positive" }); return; }
  if (!category) { res.status(400).json({ error: "category required" }); return; }

  const event = await getEventBySlug(eventSlug, org.id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const [payment] = await db.insert(paymentsTable).values({
    orgId: org.id,
    eventId: event.id,
    paymentType: category,
    amount: amountCents / 100,
    currency: "USD",
    status: "succeeded",
    source: "check",
    description: notes ?? `Manual ${category} payment${payerName ? ` from ${payerName}` : ""}`,
    paidAt: new Date(),
  }).returning({ id: paymentsTable.id });

  res.status(201).json({ ok: true, id: payment.id });
});

// ─── GET /api/management/tickets?event=<slug> ─────────────────────────────────

router.get("/tickets", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const eventSlug = req.query.event as string | undefined;
  const format = req.query.format as string | undefined;
  if (!eventSlug) { res.status(400).json({ error: "event param required" }); return; }

  const event = await getEventBySlug(eventSlug, org.id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const sales = await db
    .select()
    .from(ticketSalesTable)
    .where(eq(ticketSalesTable.eventId, event.id))
    .orderBy(desc(ticketSalesTable.createdAt));

  if (format === "print") {
    res.json({
      ok: true,
      event: eventSlug,
      checkinList: sales
        .filter(s => s.paymentStatus === "completed")
        .map(s => ({
          name: s.attendeeName,
          email: s.attendeeEmail,
          quantity: s.quantity,
          confirmation: s.stripeCheckoutSessionId?.slice(-8).toUpperCase() ?? s.id.slice(-8).toUpperCase(),
        })),
    });
    return;
  }

  res.json({
    ok: true,
    event: eventSlug,
    tickets: sales.map(s => ({
      id: s.id,
      name: s.attendeeName,
      email: s.attendeeEmail,
      phone: s.attendeePhone,
      quantity: s.quantity,
      amount: s.amountPaid,
      status: s.paymentStatus,
      method: s.paymentMethod,
      confirmation: s.stripeCheckoutSessionId?.slice(-8).toUpperCase() ?? s.id.slice(-8).toUpperCase(),
      createdAt: s.createdAt,
    })),
  });
});

// ─── GET /api/management/contacts?event=<slug>&type=all|vendor|sponsor|ticket|participant ──

router.get("/contacts", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const eventSlug = req.query.event as string | undefined;
  const type = (req.query.type as string | undefined) ?? "all";
  if (!eventSlug) { res.status(400).json({ error: "event param required" }); return; }

  const event = await getEventBySlug(eventSlug, org.id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const contacts: Array<{ name: string; email: string; type: string; event: string }> = [];
  const seen = new Set<string>();

  const add = (name: string | null, email: string | null, contactType: string) => {
    if (!email || seen.has(email.toLowerCase())) return;
    seen.add(email.toLowerCase());
    contacts.push({ name: name ?? email, email, type: contactType, event: eventSlug! });
  };

  if (type === "all" || type === "vendor") {
    const vendors = await db
      .select({ name: registrationsTable.name, email: registrationsTable.email })
      .from(registrationsTable)
      .where(and(
        eq(registrationsTable.orgId, org.id),
        eq(registrationsTable.eventId, event.id),
        eq(registrationsTable.type, "vendor"),
        eq(registrationsTable.status, "approved"),
      ));
    for (const v of vendors) add(v.name, v.email, "Vendor");
  }

  if (type === "all" || type === "sponsor") {
    const sponsors = await db
      .select({ name: registrationsTable.name, email: registrationsTable.email })
      .from(registrationsTable)
      .where(and(
        eq(registrationsTable.orgId, org.id),
        eq(registrationsTable.eventId, event.id),
        eq(registrationsTable.type, "sponsor"),
        eq(registrationsTable.status, "approved"),
      ));
    for (const s of sponsors) add(s.name, s.email, "Sponsor");
  }

  if (type === "all" || type === "participant") {
    const participants = await db
      .select({ name: registrationsTable.name, email: registrationsTable.email })
      .from(registrationsTable)
      .where(and(
        eq(registrationsTable.orgId, org.id),
        eq(registrationsTable.eventId, event.id),
        eq(registrationsTable.type, "participant"),
      ));
    for (const p of participants) add(p.name, p.email, "Participant");
  }

  if (type === "all" || type === "ticket") {
    const tickets = await db
      .select({ name: ticketSalesTable.attendeeName, email: ticketSalesTable.attendeeEmail })
      .from(ticketSalesTable)
      .where(and(
        eq(ticketSalesTable.eventId, event.id),
        inArray(ticketSalesTable.paymentStatus, ["completed", "pending"]),
      ));
    for (const t of tickets) add(t.name, t.email, "Ticket");
  }

  res.json({ ok: true, event: eventSlug, count: contacts.length, contacts });
});

// ─── POST /api/management/emails/send ────────────────────────────────────────

router.post("/emails/send", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const { toEmail, toName, subject, body } = req.body as {
    toEmail?: string; toName?: string; subject?: string; body?: string;
  };

  if (!toEmail) { res.status(400).json({ error: "toEmail required" }); return; }
  if (!subject) { res.status(400).json({ error: "subject required" }); return; }
  if (!body) { res.status(400).json({ error: "body required" }); return; }

  const result = await sendEmail({
    org,
    toEmail: String(toEmail),
    toName: toName ? String(toName) : undefined,
    subject: String(subject),
    body: String(body),
  });

  if (!result.ok) {
    res.status(500).json({ error: result.error ?? "Email send failed" });
    return;
  }

  res.json({ ok: true, message: "Email sent" });
});

// ─── POST /api/management/emails/bulk ────────────────────────────────────────

router.post("/emails/bulk", async (req: Request, res: Response) => {
  const org = await getOrgForUser(req, res);
  if (!org) return;

  const { eventSlug, contactType, subject, body } = req.body as {
    eventSlug?: string; contactType?: string; subject?: string; body?: string;
  };

  if (!eventSlug) { res.status(400).json({ error: "eventSlug required" }); return; }
  if (!subject) { res.status(400).json({ error: "subject required" }); return; }
  if (!body) { res.status(400).json({ error: "body required" }); return; }

  const event = await getEventBySlug(eventSlug, org.id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const contacts: Array<{ name: string; email: string }> = [];
  const seen = new Set<string>();

  const add = (name: string | null, email: string | null) => {
    if (!email || seen.has(email.toLowerCase())) return;
    seen.add(email.toLowerCase());
    contacts.push({ name: name ?? email, email });
  };

  if (!contactType || contactType === "all" || contactType === "vendor") {
    const rows = await db.select({ name: registrationsTable.name, email: registrationsTable.email }).from(registrationsTable).where(and(eq(registrationsTable.orgId, org.id), eq(registrationsTable.eventId, event.id), eq(registrationsTable.type, "vendor"), eq(registrationsTable.status, "approved")));
    for (const r of rows) add(r.name, r.email);
  }
  if (!contactType || contactType === "all" || contactType === "sponsor") {
    const rows = await db.select({ name: registrationsTable.name, email: registrationsTable.email }).from(registrationsTable).where(and(eq(registrationsTable.orgId, org.id), eq(registrationsTable.eventId, event.id), eq(registrationsTable.type, "sponsor"), eq(registrationsTable.status, "approved")));
    for (const r of rows) add(r.name, r.email);
  }
  if (!contactType || contactType === "all" || contactType === "participant") {
    const rows = await db.select({ name: registrationsTable.name, email: registrationsTable.email }).from(registrationsTable).where(and(eq(registrationsTable.orgId, org.id), eq(registrationsTable.eventId, event.id), eq(registrationsTable.type, "participant")));
    for (const r of rows) add(r.name, r.email);
  }
  if (!contactType || contactType === "all" || contactType === "ticket") {
    const rows = await db.select({ name: ticketSalesTable.attendeeName, email: ticketSalesTable.attendeeEmail }).from(ticketSalesTable).where(and(eq(ticketSalesTable.eventId, event.id), inArray(ticketSalesTable.paymentStatus, ["completed", "pending"])));
    for (const r of rows) add(r.name, r.email);
  }

  if (contacts.length === 0) {
    res.json({ ok: true, sent: 0, message: "No contacts found for this filter" });
    return;
  }

  let sent = 0;
  const errors: string[] = [];

  for (const contact of contacts) {
    const personalizedBody = body.replace(/\{\{name\}\}/gi, contact.name);
    const result = await sendEmail({ org, toEmail: contact.email, toName: contact.name, subject, body: personalizedBody });
    if (result.ok) sent++;
    else errors.push(`${contact.email}: ${result.error}`);
  }

  res.json({ ok: true, sent, total: contacts.length, errors: errors.length > 0 ? errors : undefined });
});

// ─── Email helper ─────────────────────────────────────────────────────────────

async function sendEmail(opts: {
  org: typeof organizationsTable.$inferSelect;
  toEmail: string;
  toName?: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { org, toEmail, toName, subject, body } = opts;

  const fromEmail = org.senderEmail ?? "noreply@mypillar.co";
  const fromName = org.name ?? "Pillar";

  // Use SendGrid if SENDGRID_API_KEY is set
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    try {
      const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail, name: toName }] }],
          from: { email: fromEmail, name: fromName },
          subject,
          content: [{ type: "text/plain", value: body }],
        }),
      });
      if (!sgRes.ok) {
        const err = await sgRes.text();
        return { ok: false, error: `SendGrid error: ${err.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // Fallback: log to console in dev
  console.info(`[email] To: ${toEmail} | Subject: ${subject}\n${body.slice(0, 200)}`);
  return { ok: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tierRankForTier(tier: string | null | undefined): number {
  switch ((tier ?? "").toLowerCase()) {
    case "presenting": return 0;
    case "gold": return 1;
    case "silver": return 2;
    case "supporting": return 3;
    case "trophy": return 4;
    default: return 3;
  }
}

export default router;
