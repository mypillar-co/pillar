/**
 * Public API endpoints for event form submissions.
 * No authentication required — these are used by the public-facing event pages.
 *
 * POST /api/public/events/:slug/vendor-apply
 * POST /api/public/events/:slug/sponsor-signup
 * POST /api/public/events/:slug/register
 * GET  /api/event-sponsors.json?event=<slug>
 * GET  /api/ticket-stats?event=<slug>
 */

import { Router, type Request, type Response } from "express";
import { db, organizationsTable, eventsTable, registrationsTable, eventSponsorsTable, sponsorsTable, ticketSalesTable, ticketTypesTable } from "@workspace/db";
import { eq, and, or, sql, inArray } from "drizzle-orm";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveEventAndOrg(eventSlug: string): Promise<{
  event: typeof eventsTable.$inferSelect;
  org: typeof organizationsTable.$inferSelect;
} | null> {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.slug, eventSlug), eq(eventsTable.isActive, true)));
  if (!event) return null;

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, event.orgId));
  if (!org) return null;

  return { event, org };
}

// ─── POST /api/public/events/:slug/vendor-apply ───────────────────────────────

router.post("/events/:slug/vendor-apply", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const ctx = await resolveEventAndOrg(slug);
  if (!ctx) { res.status(404).json({ error: "Event not found" }); return; }

  const { event, org } = ctx;

  if (event.registrationClosed) {
    res.status(400).json({ error: "Vendor registration is closed for this event." });
    return;
  }

  const {
    businessName, contactName, email, phone,
    vendorType, products, needsElectricity,
    servSafeUrl, insuranceCertUrl,
  } = req.body as Record<string, unknown>;

  if (!businessName || typeof businessName !== "string") { res.status(400).json({ error: "businessName is required" }); return; }
  if (!contactName || typeof contactName !== "string") { res.status(400).json({ error: "contactName is required" }); return; }
  if (!email || typeof email !== "string" || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }
  if (!phone || typeof phone !== "string") { res.status(400).json({ error: "phone is required" }); return; }
  if (!vendorType || typeof vendorType !== "string") { res.status(400).json({ error: "vendorType is required" }); return; }
  if (!products || typeof products !== "string") { res.status(400).json({ error: "products description is required" }); return; }

  const [reg] = await db.insert(registrationsTable).values({
    orgId: org.id,
    type: "vendor",
    status: "pending_approval",
    name: String(businessName),
    contactName: String(contactName),
    email: String(email),
    phone: String(phone),
    vendorType: String(vendorType),
    products: String(products),
    needsElectricity: needsElectricity === true || needsElectricity === "true",
    eventId: event.id,
    servSafeUrl: servSafeUrl ? String(servSafeUrl) : undefined,
    insuranceCertUrl: insuranceCertUrl ? String(insuranceCertUrl) : undefined,
    feeAmount: 0,
    stripePaymentStatus: "waived",
  }).returning({ id: registrationsTable.id });

  res.status(201).json({ ok: true, id: reg.id, message: "Application received — pending review" });
});

// ─── POST /api/public/events/:slug/sponsor-signup ────────────────────────────

router.post("/events/:slug/sponsor-signup", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const ctx = await resolveEventAndOrg(slug);
  if (!ctx) { res.status(404).json({ error: "Event not found" }); return; }

  const { event, org } = ctx;

  const {
    companyName, contactName, email, website, tier, logoUrl,
  } = req.body as Record<string, unknown>;

  if (!companyName || typeof companyName !== "string") { res.status(400).json({ error: "companyName is required" }); return; }
  if (!contactName || typeof contactName !== "string") { res.status(400).json({ error: "contactName is required" }); return; }
  if (!email || typeof email !== "string" || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }
  if (!tier || typeof tier !== "string") { res.status(400).json({ error: "tier is required" }); return; }
  if (!logoUrl || typeof logoUrl !== "string") { res.status(400).json({ error: "logo is required" }); return; }

  const validTiers = ["Presenting", "Gold", "Silver", "Supporting", "Trophy"];
  if (!validTiers.includes(tier)) { res.status(400).json({ error: "Invalid tier" }); return; }

  const [reg] = await db.insert(registrationsTable).values({
    orgId: org.id,
    type: "sponsor",
    status: "pending_approval",
    name: String(companyName),
    contactName: String(contactName),
    email: String(email),
    website: website ? String(website) : undefined,
    tier: String(tier),
    logoUrl: String(logoUrl),
    eventId: event.id,
    feeAmount: 0,
    stripePaymentStatus: "waived",
  }).returning({ id: registrationsTable.id });

  res.status(201).json({ ok: true, id: reg.id, message: "Sponsorship application received — pending review" });
});

// ─── POST /api/public/events/:slug/register ───────────────────────────────────

router.post("/events/:slug/register", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const ctx = await resolveEventAndOrg(slug);
  if (!ctx) { res.status(404).json({ error: "Event not found" }); return; }

  const { event, org } = ctx;

  const { name, email, phone, vehicleInfo } = req.body as Record<string, unknown>;

  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  if (!email || typeof email !== "string" || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }

  const [reg] = await db.insert(registrationsTable).values({
    orgId: org.id,
    type: "participant",
    status: "approved",
    name: String(name),
    contactName: String(name),
    email: String(email),
    phone: phone ? String(phone) : undefined,
    description: vehicleInfo ? String(vehicleInfo) : undefined,
    eventId: event.id,
    feeAmount: 0,
    stripePaymentStatus: "waived",
  }).returning({ id: registrationsTable.id });

  res.status(201).json({ ok: true, id: reg.id, message: "Registration confirmed" });
});

// ─── Public query router (mounted at /api root) ───────────────────────────────
export const publicQueryRouter = Router();

// ─── GET /api/event-sponsors.json?event=<slug> ────────────────────────────────
// Public, no auth, CORS enabled — for website to render sponsor logos

publicQueryRouter.get("/event-sponsors.json", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");

  const eventSlug = req.query.event as string | undefined;
  if (!eventSlug) { res.status(400).json({ ok: false, error: "event param required" }); return; }

  const [event] = await db
    .select({ id: eventsTable.id, name: eventsTable.name, slug: eventsTable.slug })
    .from(eventsTable)
    .where(eq(eventsTable.slug, eventSlug));

  if (!event) { res.status(404).json({ ok: false, error: "Event not found" }); return; }

  const tierOrder: Record<string, number> = {
    presenting: 0, gold: 1, silver: 2, supporting: 3, trophy: 4,
  };

  const rows = await db
    .select({
      name: sponsorsTable.name,
      tier: eventSponsorsTable.tier,
      tierRank: sponsorsTable.tierRank,
      logoUrl: sponsorsTable.logoUrl,
      website: sponsorsTable.website,
    })
    .from(eventSponsorsTable)
    .innerJoin(sponsorsTable, eq(eventSponsorsTable.sponsorId, sponsorsTable.id))
    .where(and(
      eq(eventSponsorsTable.eventId, event.id),
      eq(sponsorsTable.status, "active"),
      eq(sponsorsTable.siteVisible, true),
    ));

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://api.mypillar.co";

  const sponsors = rows
    .sort((a, b) => {
      const ra = tierOrder[(a.tier ?? "").toLowerCase()] ?? 99;
      const rb = tierOrder[(b.tier ?? "").toLowerCase()] ?? 99;
      return ra - rb;
    })
    .map(s => {
      const logoUrl = s.logoUrl
        ? (s.logoUrl.startsWith("http") ? s.logoUrl : `${baseUrl}/api/storage${s.logoUrl}`)
        : null;
      return {
        name: s.name,
        companyName: s.name,
        tier: s.tier ?? null,
        level: (s.tier ?? "").toLowerCase(),
        logoUrl,
        sponsorImageUrl: logoUrl,
        website: s.website ?? null,
      };
    });

  res.json({
    ok: true,
    event: event.slug,
    eventName: event.name,
    sponsors,
    updatedAt: new Date().toISOString(),
  });
});

// ─── GET /api/ticket-stats?event=<slug> ───────────────────────────────────────
// Public, no auth — shows sold vs capacity

publicQueryRouter.get("/ticket-stats", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=30");

  const eventSlug = req.query.event as string | undefined;
  if (!eventSlug) { res.status(400).json({ ok: false, error: "event param required" }); return; }

  const [event] = await db
    .select({ id: eventsTable.id, ticketCapacity: eventsTable.ticketCapacity })
    .from(eventsTable)
    .where(eq(eventsTable.slug, eventSlug));

  if (!event) { res.status(404).json({ ok: false, error: "Event not found" }); return; }

  const sales = await db
    .select({ quantity: ticketSalesTable.quantity, amountPaid: ticketSalesTable.amountPaid })
    .from(ticketSalesTable)
    .where(and(
      eq(ticketSalesTable.eventId, event.id),
      inArray(ticketSalesTable.paymentStatus, ["completed", "pending"]),
    ));

  const sold = sales.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
  const revenueCents = Math.round(
    sales.reduce((sum, s) => sum + (s.amountPaid ?? 0), 0) * 100
  );

  res.json({
    ok: true,
    sold,
    capacity: event.ticketCapacity ?? null,
    revenue_cents: revenueCents,
  });
});

export default router;
