/**
 * Public Org API — /api/public/:orgSlug/...
 *
 * Powers the universal React+Vite site template for every Pillar org.
 * All endpoints are unauthenticated (public-facing).
 *
 * Tables used:
 *   organizations (site_config), events, sponsors, newsletter_subscribers,
 *   org_contact_submissions, ticket_types, ticket_sales
 */

import { Router, type Request, type Response } from "express";
import { db, organizationsTable, eventsTable, sponsorsTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveOrg(orgSlug: string) {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, orgSlug));
  return org ?? null;
}

// ── Site Config ───────────────────────────────────────────────────────────────

/**
 * GET /api/public/:orgSlug/config
 * Returns the site_config JSON used by the React template to populate
 * all hardcoded content (hero, programs, stats, colors, contact info, etc.)
 */
router.get("/:orgSlug/config", async (req: Request, res: Response) => {
  try {
    const { orgSlug } = req.params as { orgSlug: string };
    const result = await db.execute(
      sql`SELECT name, slug, type, site_config FROM organizations WHERE slug = ${orgSlug} LIMIT 1`,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    let config = row.site_config as Record<string, unknown> | null;

    // Fall back to minimal default if org hasn't been configured yet
    // IMPORTANT: no filler text — blank fields are better than fake content
    if (!config) {
      const orgName = String(row.name ?? "");
      config = {
        name: orgName,
        shortName: orgName.split(" ").map((w: string) => w[0]).join("").slice(0, 3),
        tagline: "",
        type: String(row.type ?? "organization"),
        primaryColor: "#1e3a5f",
        accentColor: "#f59e0b",
        hero: {
          headline: orgName,
          subtext: "",
          ctaPrimary: "View Upcoming Events",
          ctaSecondary: "Get Involved",
        },
        stats: [],
        programs: [],
        about: {
          mission: "",
          description1: "",
        },
        contact: {},
      };
    }

    res.json({ ...config, name: row.name, slug: row.slug });
  } catch (err) {
    logger.error({ err }, "public config error");
    res.status(500).json({ error: "Failed to load site config" });
  }
});

// ── Events ────────────────────────────────────────────────────────────────────

router.get("/:orgSlug/events", async (req: Request, res: Response) => {
  try {
    const { orgSlug } = req.params as { orgSlug: string };
    const org = await resolveOrg(orgSlug);
    if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

    // Also pull ticket_sale_open and ticket_sale_close via raw sql since they
    // are added via ALTER TABLE and not in the generated drizzle schema yet.
    const result = await db.execute(sql`
      SELECT
        e.id, e.name AS title, e.slug, e.description, e.start_date AS event_date,
        e.end_date, e.start_time, e.end_time, e.location, e.image_url,
        e.is_ticketed, e.ticket_price, e.ticket_capacity,
        COALESCE(tt_agg.sold, 0) AS tickets_sold,
        e.status = 'published' AS is_published,
        e.created_at,
        e.ticket_sale_open, e.ticket_sale_close
      FROM events e
      LEFT JOIN (
        SELECT event_id, SUM(sold) AS sold
        FROM ticket_types
        WHERE is_active = true
        GROUP BY event_id
      ) tt_agg ON tt_agg.event_id = e.id
      WHERE e.org_id = ${org.id}
        AND e.status = 'published'
        AND e.is_active = true
        AND COALESCE(e.show_on_public_site, true) = true
      ORDER BY e.start_date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "public events error");
    res.status(500).json({ error: "Failed to load events" });
  }
});

router.get("/:orgSlug/events/:eventId", async (req: Request, res: Response) => {
  try {
    const { orgSlug, eventId } = req.params as { orgSlug: string; eventId: string };
    const org = await resolveOrg(orgSlug);
    if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

    const result = await db.execute(sql`
      SELECT
        e.id, e.name AS title, e.slug, e.description, e.start_date AS event_date,
        e.end_date, e.start_time, e.end_time, e.location, e.image_url,
        e.is_ticketed, e.ticket_price, e.ticket_capacity,
        COALESCE(tt_agg.sold, 0) AS tickets_sold,
        e.status = 'published' AS is_published,
        e.created_at,
        e.ticket_sale_open, e.ticket_sale_close
      FROM events e
      LEFT JOIN (
        SELECT event_id, SUM(sold) AS sold
        FROM ticket_types
        WHERE is_active = true
        GROUP BY event_id
      ) tt_agg ON tt_agg.event_id = e.id
      WHERE e.org_id = ${org.id}
        AND e.status = 'published'
        AND e.is_active = true
        AND (e.id = ${eventId} OR e.slug = ${eventId})
      LIMIT 1
    `);

    const event = result.rows[0];
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    res.json(event);
  } catch (err) {
    logger.error({ err }, "public event detail error");
    res.status(500).json({ error: "Failed to load event" });
  }
});

// ── Blog ──────────────────────────────────────────────────────────────────────

router.get("/:orgSlug/blog", async (_req: Request, res: Response) => {
  res.json([]);
});

router.get("/:orgSlug/blog/:slug", async (_req: Request, res: Response) => {
  res.status(404).json({ error: "Post not found" });
});

// ── Sponsors ──────────────────────────────────────────────────────────────────

router.get("/:orgSlug/sponsors", async (req: Request, res: Response) => {
  try {
    const { orgSlug } = req.params as { orgSlug: string };

    const org = await resolveOrg(orgSlug);
    if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

    const rows = await db
      .select()
      .from(sponsorsTable)
      .where(
        and(
          eq(sponsorsTable.orgId, org.id),
          eq(sponsorsTable.siteVisible, true),
          eq(sponsorsTable.status, "active"),
        ),
      )
      .orderBy(asc(sponsorsTable.tierRank), asc(sponsorsTable.name));

    res.json(
      rows.map((s) => ({
        id: s.id,
        name: s.name,
        logo_url: s.logoUrl,
        website_url: s.website,
        tier: s.tier,
        tier_rank: s.tierRank,
        is_active: s.status === "active",
      })),
    );
  } catch (err) {
    logger.error({ err }, "public sponsors error");
    res.status(500).json({ error: "Failed to load sponsors" });
  }
});

// ── Gallery ───────────────────────────────────────────────────────────────────

router.get("/:orgSlug/gallery", async (_req: Request, res: Response) => {
  res.json([]);
});

router.get("/:orgSlug/gallery/:albumId", async (_req: Request, res: Response) => {
  res.status(404).json({ error: "Album not found" });
});

// ── Contact ───────────────────────────────────────────────────────────────────

router.post("/:orgSlug/contact", async (req: Request, res: Response) => {
  try {
    const { orgSlug } = req.params as { orgSlug: string };
    const { name, email, subject, message, _hp, _t } = req.body as Record<string, unknown>;

    // Bot protection: honeypot field filled → silent drop
    if (_hp) {
      res.json({ ok: true, message: "Your message has been sent. We'll get back to you soon!" });
      return;
    }
    // Bot protection: submitted faster than any human can read + fill a form
    if (_t && Date.now() - Number(_t) < 3000) {
      res.json({ ok: true, message: "Your message has been sent. We'll get back to you soon!" });
      return;
    }

    if (!name || !email || !message) {
      res.status(400).json({ error: "name, email, and message are required" });
      return;
    }

    const org = await resolveOrg(orgSlug);
    if (!org) { res.status(404).json({ error: "Organization not found" }); return; }
    await db.execute(sql`
      INSERT INTO org_contact_submissions (org_id, name, email, message)
      VALUES (${org.id}, ${String(name)}, ${String(email)}, ${String(message)})
    `);

    res.json({ ok: true, message: "Your message has been sent. We'll get back to you soon!" });
  } catch (err) {
    logger.error({ err }, "public contact error");
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ── Newsletter ────────────────────────────────────────────────────────────────

router.post("/:orgSlug/newsletter/subscribe", async (req: Request, res: Response) => {
  try {
    const { orgSlug } = req.params as { orgSlug: string };
    const { email, name, _hp, _t } = req.body as Record<string, unknown>;

    // Bot protection: honeypot field filled → silent drop
    if (_hp) {
      res.json({ ok: true, message: "You've been subscribed! Welcome to the community." });
      return;
    }
    // Bot protection: submitted in under 3 seconds → silent drop
    if (_t && Date.now() - Number(_t) < 3000) {
      res.json({ ok: true, message: "You've been subscribed! Welcome to the community." });
      return;
    }

    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const org = await resolveOrg(orgSlug);
    if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

    await db.execute(sql`
      INSERT INTO newsletter_subscribers (org_id, email, name)
      VALUES (${org.id}, ${String(email)}, ${name ? String(name) : null})
      ON CONFLICT (org_id, email) DO UPDATE SET name = EXCLUDED.name
    `);

    res.json({ ok: true, message: "You've been subscribed! Welcome to the community." });
  } catch (err) {
    logger.error({ err }, "public newsletter subscribe error");
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// ── Stripe Checkout ───────────────────────────────────────────────────────────

router.post("/:orgSlug/checkout", async (req: Request, res: Response) => {
  try {
    const { orgSlug } = req.params as { orgSlug: string };
    const { event_id, quantity, buyer_email, buyer_name } = req.body as Record<string, unknown>;

    if (!event_id || !buyer_email) {
      res.status(400).json({ error: "event_id and buyer_email are required" });
      return;
    }

    // Resolve org and use events table
    const org = await resolveOrg(orgSlug);
    if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.orgId, org.id),
          eq(eventsTable.id, String(event_id)),
          eq(eventsTable.status, "published"),
          eq(eventsTable.isTicketed, true),
          eq(eventsTable.isActive, true),
        ),
      );

    if (!event) { res.status(404).json({ error: "Event not found or not ticketed" }); return; }

    const qty = Number(quantity ?? 1);
    const price = Number(event.ticketPrice ?? 0);
    if (price <= 0) { res.status(400).json({ error: "Event has no ticket price" }); return; }

    if (!org.stripeConnectAccountId || !org.stripeConnectOnboarded) {
      res.status(400).json({ error: "Organization does not have payments configured" });
      return;
    }

    const { getUncachableStripeClient } = await import("../stripeClient");
    const stripe = await getUncachableStripeClient();
    const devDomain = process.env.REPLIT_DEV_DOMAIN;
    const baseUrl = devDomain ? `https://${devDomain}/${orgSlug}` : `https://${orgSlug}.mypillar.co`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `${event.name} — Ticket`,
            description: `${qty} ticket(s) to ${event.name}`,
          },
        },
        quantity: qty,
      }],
      mode: "payment",
      customer_email: String(buyer_email),
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/events/${event.id}?cancelled=true`,
      metadata: {
        event_id: event.id,
        buyer_name: buyer_name ? String(buyer_name) : "",
        quantity: String(qty),
        org_slug: orgSlug,
      },
    }, { stripeAccount: org.stripeConnectAccountId });

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "public checkout error");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ── Ticket verify ─────────────────────────────────────────────────────────────

router.get("/:orgSlug/tickets/verify", async (req: Request, res: Response) => {
  try {
    const { session_id } = req.query as { session_id?: string };
    if (!session_id) { res.status(400).json({ error: "session_id required" }); return; }

    const { getUncachableStripeClient } = await import("../stripeClient");
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({ status: session.payment_status });
  } catch (err) {
    logger.error({ err }, "public ticket verify error");
    res.status(500).json({ error: "Failed to verify ticket" });
  }
});

export default router;
