import { Router, type Request, type Response } from "express";
import {
  db, organizationsTable, registrationsTable, sponsorsTable, vendorsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10 MB

const router = Router();

// ─── Public: request presigned URL for a registration document ────────────────
// Unauthenticated — used during vendor/sponsor registration before any account exists.
// Strict limits: PDF/images only, 10 MB max.
router.post("/public/registration-docs/upload-url", async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body as {
    name?: string; size?: number; contentType?: string;
  };

  if (!name || !size || !contentType) {
    res.status(400).json({ error: "name, size, and contentType are required" });
    return;
  }
  if (!ALLOWED_DOC_TYPES.includes(contentType.toLowerCase())) {
    res.status(400).json({ error: "Only PDF and image files are accepted" });
    return;
  }
  if (size > MAX_DOC_SIZE) {
    res.status(400).json({ error: "File must be 10 MB or smaller" });
    return;
  }

  const uploadURL = await objectStorage.getObjectEntityUploadURL();
  const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

  res.json({ uploadURL, objectPath });
});

// ─── Public: serve a registration document (admin-gated in practice via the dashboard) ──
router.get("/public/registration-docs/objects/*path", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const raw = (req.params as Record<string, string>)["path"];
    const objectPath = `/objects/${raw}`;
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const response = await objectStorage.downloadObject(file, 60);
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    res.set(headers);
    if (response.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(res);
    } else {
      res.status(204).end();
    }
  } catch {
    res.status(404).json({ error: "Document not found" });
  }
});

// ─── Public: get org registration info ────────────────────────────────────────
router.get("/public/orgs/:slug/register-info", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const [org] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      type: organizationsTable.type,
      vendorFeeCents: organizationsTable.vendorFeeCents,
      sponsorFeeCents: organizationsTable.sponsorFeeCents,
      stripeConnectOnboarded: organizationsTable.stripeConnectOnboarded,
      stripeConnectAccountId: organizationsTable.stripeConnectAccountId,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug));

  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  res.json({
    orgId: org.id,
    orgName: org.name,
    orgType: org.type,
    vendorFeeCents: org.vendorFeeCents,
    sponsorFeeCents: org.sponsorFeeCents,
    acceptsPayments: !!org.stripeConnectOnboarded && !!org.stripeConnectAccountId,
  });
});

// ─── Public: submit registration ──────────────────────────────────────────────
router.post("/public/orgs/:slug/register", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const {
    type, name, email, phone, website, logoUrl, description, tier, vendorType,
    servSafeUrl, insuranceCertUrl,
  } = req.body as {
    type?: string; name?: string; email?: string; phone?: string;
    website?: string; logoUrl?: string; description?: string;
    tier?: string; vendorType?: string;
    servSafeUrl?: string; insuranceCertUrl?: string;
  };

  if (!type || !["vendor", "sponsor"].includes(type)) {
    res.status(400).json({ error: "type must be 'vendor' or 'sponsor'" }); return;
  }
  if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
  if (!email?.trim()) { res.status(400).json({ error: "Email is required" }); return; }

  const feeAmount = type === "vendor" ? (org.vendorFeeCents ?? 0) : (org.sponsorFeeCents ?? 0);
  const requiresPayment = feeAmount > 0 && !!org.stripeConnectOnboarded && !!org.stripeConnectAccountId;

  const [registration] = await db
    .insert(registrationsTable)
    .values({
      orgId: org.id,
      type,
      status: requiresPayment ? "pending_payment" : "pending_approval",
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() ?? null,
      website: website?.trim() ?? null,
      logoUrl: logoUrl?.trim() ?? null,
      description: description?.trim() ?? null,
      tier: type === "sponsor" ? (tier?.trim() ?? null) : null,
      vendorType: type === "vendor" ? (vendorType?.trim() ?? null) : null,
      feeAmount,
      stripePaymentStatus: requiresPayment ? "unpaid" : "waived",
      ...(servSafeUrl?.trim() ? { servSafeUrl: servSafeUrl.trim() } : {}),
      ...(insuranceCertUrl?.trim() ? { insuranceCertUrl: insuranceCertUrl.trim() } : {}),
    })
    .returning();

  if (!requiresPayment) {
    res.json({ registrationId: registration.id, checkoutUrl: null, free: true });
    return;
  }

  // Create Stripe Checkout session via Connect
  const appUrl = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers["host"]}`;
  const stripe = await getUncachableStripeClient();

  const platformFeeAmount = Math.round(feeAmount * 0.029) + 30;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${type === "sponsor" ? "Sponsor" : "Vendor"} Registration — ${org.name}`,
            description: `Application fee for ${name}`,
          },
          unit_amount: feeAmount,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeAmount,
      transfer_data: { destination: org.stripeConnectAccountId! },
      metadata: { registrationId: registration.id, type: "registration" },
    },
    metadata: { registrationId: registration.id, type: "registration" },
    customer_email: email.trim().toLowerCase(),
    success_url: `${appUrl}/apply/${slug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/apply/${slug}?cancelled=true`,
  }, { stripeAccount: org.stripeConnectAccountId! });

  await db
    .update(registrationsTable)
    .set({ stripeSessionId: session.id })
    .where(eq(registrationsTable.id, registration.id));

  res.json({ registrationId: registration.id, checkoutUrl: session.url, free: false });
});

// ─── Admin: list registrations ────────────────────────────────────────────────
router.get("/registrations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const { status } = req.query as { status?: string };
  const conditions = [eq(registrationsTable.orgId, org.id)];
  if (status) conditions.push(eq(registrationsTable.status, status));

  const rows = await db
    .select()
    .from(registrationsTable)
    .where(and(...conditions))
    .orderBy(desc(registrationsTable.createdAt));

  res.json(rows);
});

// ─── Admin: approve ───────────────────────────────────────────────────────────
router.post("/registrations/:id/approve", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const [reg] = await db
    .select()
    .from(registrationsTable)
    .where(and(eq(registrationsTable.id, req.params.id), eq(registrationsTable.orgId, org.id)));
  if (!reg) { res.status(404).json({ error: "Registration not found" }); return; }
  if (reg.status === "approved") { res.status(400).json({ error: "Already approved" }); return; }
  if (reg.status === "pending_payment") {
    res.status(400).json({ error: "Payment has not been received yet" }); return;
  }

  let sponsorId: string | null = null;
  let vendorId: string | null = null;

  if (reg.type === "sponsor") {
    const [sponsor] = await db
      .insert(sponsorsTable)
      .values({
        orgId: org.id,
        name: reg.name,
        ...(reg.email ? { email: reg.email } : {}),
        ...(reg.phone ? { phone: reg.phone } : {}),
        ...(reg.website ? { website: reg.website } : {}),
        ...(reg.logoUrl ? { logoUrl: reg.logoUrl } : {}),
        ...(reg.description ? { notes: reg.description } : {}),
        status: "active",
      })
      .returning();
    sponsorId = sponsor.id;
  } else {
    const [vendor] = await db
      .insert(vendorsTable)
      .values({
        orgId: org.id,
        name: reg.name,
        ...(reg.email ? { email: reg.email } : {}),
        ...(reg.phone ? { phone: reg.phone } : {}),
        ...(reg.vendorType ? { vendorType: reg.vendorType } : {}),
        ...(reg.description ? { notes: reg.description } : {}),
        status: "active",
      })
      .returning();
    vendorId = vendor.id;
  }

  const [updated] = await db
    .update(registrationsTable)
    .set({
      status: "approved",
      approvedAt: new Date(),
      sponsorId,
      vendorId,
    })
    .where(eq(registrationsTable.id, reg.id))
    .returning();

  res.json(updated);
});

// ─── Admin: reject ────────────────────────────────────────────────────────────
router.post("/registrations/:id/reject", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const [reg] = await db
    .select()
    .from(registrationsTable)
    .where(and(eq(registrationsTable.id, req.params.id), eq(registrationsTable.orgId, org.id)));
  if (!reg) { res.status(404).json({ error: "Registration not found" }); return; }

  const { reason } = req.body as { reason?: string };

  const [updated] = await db
    .update(registrationsTable)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectionReason: reason?.trim() ?? null,
    })
    .where(eq(registrationsTable.id, reg.id))
    .returning();

  res.json(updated);
});

// ─── Admin: update fee config ─────────────────────────────────────────────────
router.patch("/registrations/fee-config", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  const { vendorFeeCents, sponsorFeeCents } = req.body as {
    vendorFeeCents?: number; sponsorFeeCents?: number;
  };

  await db
    .update(organizationsTable)
    .set({
      ...(vendorFeeCents !== undefined && { vendorFeeCents: Math.max(0, Math.round(vendorFeeCents)) }),
      ...(sponsorFeeCents !== undefined && { sponsorFeeCents: Math.max(0, Math.round(sponsorFeeCents)) }),
    })
    .where(eq(organizationsTable.id, org.id));

  res.json({ success: true });
});

export default router;
