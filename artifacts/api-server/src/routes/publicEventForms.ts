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

import express, { Router, type Request, type Response } from "express";
import { db, organizationsTable, eventsTable, registrationsTable, eventSponsorsTable, sponsorsTable, ticketSalesTable, ticketTypesTable, eventWaitlistTable } from "@workspace/db";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import { isAllowedRegistrationDocType, writeLocalRegistrationDoc } from "../lib/localRegistrationDocs";

const router = Router();

const publicEventAttempts = new Map<string, { count: number; windowStart: number }>();
const PUBLIC_EVENT_WINDOW_MS = 60 * 60 * 1000;
const PUBLIC_EVENT_MAX = 12;
const MAX_REGISTRATION_DOC_SIZE = 10 * 1024 * 1024;

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

function clientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function botSubmission(req: Request): boolean {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body._hp === "string" && body._hp.trim()) return true;
  const startedAt = Number(body._ts);
  if (Number.isFinite(startedAt) && Date.now() - startedAt < 3000) return true;
  const ip = clientIp(req);
  const now = Date.now();
  const entry = publicEventAttempts.get(ip);
  if (!entry || now - entry.windowStart > PUBLIC_EVENT_WINDOW_MS) {
    publicEventAttempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= PUBLIC_EVENT_MAX) return true;
  entry.count += 1;
  return false;
}

// ─── POST /api/public/events/:slug/vendor-apply ───────────────────────────────

router.post(
  "/events/:slug/registration-docs/upload",
  express.raw({ type: ["application/pdf", "image/*"], limit: "10mb" }),
  async (req: Request, res: Response) => {
    const { slug } = req.params;
    const ctx = await resolveEventAndOrg(slug);
    if (!ctx) { res.status(404).json({ error: "Event not found" }); return; }

    const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!isAllowedRegistrationDocType(contentType)) {
      res.status(400).json({ error: "Only PDF and image files are accepted" });
      return;
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "File body is required" });
      return;
    }
    if (body.length > MAX_REGISTRATION_DOC_SIZE) {
      res.status(413).json({ error: "File must be 10 MB or smaller" });
      return;
    }

    try {
      const objectPath = await writeLocalRegistrationDoc(ctx.org.id, body, contentType);
      res.json({ ok: true, objectPath });
    } catch {
      res.status(500).json({ error: "Failed to store registration document" });
    }
  },
);

router.post("/events/:slug/vendor-apply", async (req: Request, res: Response) => {
  if (botSubmission(req)) { res.json({ ok: true }); return; }
  const { slug } = req.params;
  const ctx = await resolveEventAndOrg(slug);
  if (!ctx) { res.status(404).json({ error: "Event not found" }); return; }

  const { event, org } = ctx;

  if (event.registrationClosed) {
    res.status(400).json({ error: "Vendor registration is closed for this event." });
    return;
  }

  const {
    businessName, name, contactName, email, phone,
    vendorType, products, needsElectricity,
    servSafeUrl, insuranceCertUrl, description,
    isFoodVendor, foodVendorType, serveSide, truckTrailerSize,
  } = req.body as Record<string, unknown>;

  const nextBusinessName = typeof businessName === "string" ? businessName : typeof name === "string" ? name : "";
  if (!nextBusinessName) { res.status(400).json({ error: "businessName is required" }); return; }
  if (!contactName || typeof contactName !== "string") { res.status(400).json({ error: "contactName is required" }); return; }
  if (!email || typeof email !== "string" || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }
  if (!phone || typeof phone !== "string") { res.status(400).json({ error: "phone is required" }); return; }
  if (!vendorType || typeof vendorType !== "string") { res.status(400).json({ error: "vendorType is required" }); return; }
  if (!products || typeof products !== "string") { res.status(400).json({ error: "products description is required" }); return; }

  const logistics = [
    `Food vendor: ${isFoodVendor === true || isFoodVendor === "true" || isFoodVendor === "Yes" ? "Yes" : "No"}`,
    foodVendorType ? `Food vendor type: ${String(foodVendorType)}` : null,
    serveSide ? `Serving side: ${String(serveSide)}` : null,
    truckTrailerSize ? `Truck/trailer size: ${String(truckTrailerSize)}` : null,
    description ? String(description) : null,
  ].filter(Boolean).join("\n");

  const [reg] = await db.insert(registrationsTable).values({
    orgId: org.id,
    type: "vendor",
    status: "pending_approval",
    name: String(nextBusinessName),
    contactName: String(contactName),
    email: String(email),
    phone: String(phone),
    vendorType: String(vendorType),
    products: String(products),
    description: logistics || undefined,
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
  if (botSubmission(req)) { res.json({ ok: true }); return; }
  const { slug } = req.params;
  const ctx = await resolveEventAndOrg(slug);
  if (!ctx) { res.status(404).json({ error: "Event not found" }); return; }

  const { event, org } = ctx;

  if (!event.hasRegistration || event.registrationClosed) {
    res.status(400).json({ error: "Sponsor registration is closed for this event." });
    return;
  }

  const {
    companyName, name, contactName, email, website, tier, logoUrl, description,
  } = req.body as Record<string, unknown>;

  const nextCompanyName = typeof companyName === "string" ? companyName : typeof name === "string" ? name : "";
  if (!nextCompanyName) { res.status(400).json({ error: "companyName is required" }); return; }
  if (!contactName || typeof contactName !== "string") { res.status(400).json({ error: "contactName is required" }); return; }
  if (!email || typeof email !== "string" || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }
  const nextTier = typeof tier === "string" && tier.trim() ? tier : "Supporting";

  const validTiers = ["Presenting", "Gold", "Silver", "Supporting", "Trophy"];
  if (!validTiers.map(t => t.toLowerCase()).includes(nextTier.toLowerCase())) { res.status(400).json({ error: "Invalid tier" }); return; }

  const [reg] = await db.insert(registrationsTable).values({
    orgId: org.id,
    type: "sponsor",
    status: "pending_approval",
    name: String(nextCompanyName),
    contactName: String(contactName),
    email: String(email),
    website: website ? String(website) : undefined,
    tier: String(nextTier),
    logoUrl: typeof logoUrl === "string" && logoUrl.trim() ? logoUrl : undefined,
    description: typeof description === "string" && description.trim() ? description : undefined,
    eventId: event.id,
    feeAmount: 0,
    stripePaymentStatus: "waived",
  }).returning({ id: registrationsTable.id });

  res.status(201).json({ ok: true, id: reg.id, message: "Sponsorship application received — pending review" });
});

// ─── POST /api/public/events/:slug/register ───────────────────────────────────

router.post("/events/:slug/register", async (req: Request, res: Response) => {
  if (botSubmission(req)) { res.json({ ok: true }); return; }
  const { slug } = req.params;
  const ctx = await resolveEventAndOrg(slug);
  if (!ctx) { res.status(404).json({ error: "Event not found" }); return; }

  const { event, org } = ctx;

  if (!event.hasRegistration || event.registrationClosed) {
    res.status(400).json({ error: "Registration is closed for this event." });
    return;
  }

  const { name, email, phone, vehicleInfo, quantity } = req.body as Record<string, unknown>;

  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  if (!email || typeof email !== "string" || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }

  const [reg] = await db.insert(ticketSalesTable).values({
    orgId: org.id,
    eventId: event.id,
    attendeeName: String(name),
    attendeeEmail: String(email).trim().toLowerCase(),
    attendeePhone: phone ? String(phone) : undefined,
    quantity: Math.max(1, Math.min(10, Number(quantity) || 1)),
    amountPaid: 0,
    platformFee: 0,
    paymentMethod: "rsvp",
    paymentStatus: "rsvp",
    notes: vehicleInfo ? String(vehicleInfo) : "Public RSVP",
  }).returning({ id: ticketSalesTable.id });

  res.status(201).json({ ok: true, id: reg.id, message: "Registration confirmed" });
});

// ─── Public query router (mounted at /api root) ───────────────────────────────
// POST /api/public/events/:eventId/waitlist — join waitlist for a sold-out event
router.post("/events/:eventId/waitlist", async (req: Request, res: Response) => {
  try {
    const { name, email, phone, quantity, ticketTypeId } = req.body as {
      name?: string; email?: string; phone?: string;
      quantity?: number; ticketTypeId?: string;
    };

    if (!name || !email) {
      res.status(400).json({ error: "name and email are required" });
      return;
    }

    // Tenant-safe lookup: event slugs are only unique per org, so we MUST
    // scope by org. The CP proxy injects x-org-id with the org slug
    // (see artifacts/api-server/src/app.ts) for any request originating from
    // a community site. Without that context we cannot safely resolve a slug.
    const orgSlugHeader = req.header("x-org-id");
    if (!orgSlugHeader) {
      res.status(400).json({ error: "Missing tenant context" });
      return;
    }

    const [tenantOrg] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, orgSlugHeader));
    if (!tenantOrg) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // Accept either an event id or slug, but always scoped to this org
    const eventIdOrSlug = String(req.params.eventId);
    const [event] = await db
      .select({ id: eventsTable.id, orgId: eventsTable.orgId, name: eventsTable.name })
      .from(eventsTable)
      .where(and(
        eq(eventsTable.orgId, tenantOrg.id),
        or(eq(eventsTable.id, eventIdOrSlug), eq(eventsTable.slug, eventIdOrSlug)),
        eq(eventsTable.status, "published"),
        eq(eventsTable.isActive, true),
      ));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await db
      .select({ id: eventWaitlistTable.id })
      .from(eventWaitlistTable)
      .where(and(
        eq(eventWaitlistTable.eventId, event.id),
        eq(eventWaitlistTable.email, normalizedEmail),
        eq(eventWaitlistTable.status, "waiting"),
      ));

    if (existing.length > 0) {
      res.json({ ok: true, message: "You are already on the waitlist." });
      return;
    }

    await db.insert(eventWaitlistTable).values({
      orgId: event.orgId,
      eventId: event.id,
      ticketTypeId: ticketTypeId ?? null,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ?? null,
      quantity: quantity ?? 1,
      status: "waiting",
    });

    res.json({ ok: true, message: "You have been added to the waitlist." });
  } catch (err) {
    console.error("[waitlist] join error:", err);
    res.status(500).json({ error: "Failed to join waitlist" });
  }
});

export const publicQueryRouter = Router();

// ─── GET /api/event-sponsors.json?event=<slug> ────────────────────────────────
// Public, no auth, CORS enabled — for website to render sponsor logos

publicQueryRouter.get("/event-sponsors.json", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");

  const eventSlug = req.query.event as string | undefined;
  if (!eventSlug) { res.status(400).json({ ok: false, error: "event param required" }); return; }

  const orgSlug = req.header("x-org-id");
  const [event] = await db
    .select({
      id: eventsTable.id,
      orgId: eventsTable.orgId,
      name: eventsTable.name,
      slug: eventsTable.slug,
      hasSponsorSection: eventsTable.hasSponsorSection,
    })
    .from(eventsTable)
    .innerJoin(organizationsTable, eq(eventsTable.orgId, organizationsTable.id))
    .where(and(
      eq(eventsTable.slug, eventSlug),
      orgSlug ? eq(organizationsTable.slug, orgSlug) : sql`true`,
    ));

  if (!event) { res.status(404).json({ ok: false, error: "Event not found" }); return; }

  const tierOrder: Record<string, number> = {
    presenting: 0, gold: 1, silver: 2, supporting: 3, trophy: 4,
  };

  let rows = await db
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

  if (rows.length === 0 && event.hasSponsorSection) {
    rows = await db
      .select({
        name: sponsorsTable.name,
        tier: sql<string | null>`NULL`,
        tierRank: sponsorsTable.tierRank,
        logoUrl: sponsorsTable.logoUrl,
        website: sponsorsTable.website,
      })
      .from(sponsorsTable)
      .where(and(
        eq(sponsorsTable.orgId, event.orgId),
        eq(sponsorsTable.status, "active"),
        eq(sponsorsTable.siteVisible, true),
      ));
  }

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
