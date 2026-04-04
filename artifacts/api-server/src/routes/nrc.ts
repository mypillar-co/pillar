/**
 * NRC — Norwin Rotary Club community website API
 * Mounted at /api/nrc/...
 *
 * Auth: lightweight session-based (bcrypt password, signed cookie).
 * Tables: nrc_events, nrc_blog_posts, nrc_sponsors, nrc_newsletter_subscribers,
 *         nrc_contact_messages, nrc_photo_albums, nrc_album_photos, nrc_site_content
 * Content hooks fire to Pillar's /api/hooks/site-event.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes } from "crypto";
import { logger } from "../lib/logger";

const router = Router();

// ── Config ────────────────────────────────────────────────────────────────────

const NRC_ORG_ID = "0780408d-967a-4071-991f-ce29a8ed2577";
const SESSION_COOKIE = "nrc_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function getSessionSecret(): string {
  return process.env.NRC_SESSION_SECRET ?? "nrc-dev-secret-change-in-prod";
}

function getAdminUser(): string {
  return process.env.NRC_ADMIN_USER ?? "admin";
}

async function getAdminHash(): Promise<string> {
  const raw = process.env.NRC_ADMIN_PASSWORD;
  if (!raw) {
    return bcrypt.hashSync("changeme", 10);
  }
  if (raw.startsWith("$2")) return raw;
  return bcrypt.hashSync(raw, 10);
}

// ── Session helpers ───────────────────────────────────────────────────────────

function signSession(payload: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifySession(signed: string, secret: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  // constant-time comparison
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return payload;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const cookie = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!cookie) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const payload = verifySession(cookie, getSessionSecret());
  if (!payload) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }
  const [user, exp] = payload.split(":");
  if (!user || !exp || Date.now() > Number(exp)) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  next();
}

// ── Content hook helper ───────────────────────────────────────────────────────

async function fireContentHook(eventType: string, data: Record<string, unknown>): Promise<void> {
  const url = process.env.PILLAR_WEBHOOK_URL ?? `http://localhost:${process.env.PORT ?? 3000}/api/hooks/site-event`;
  const payload = {
    orgId: NRC_ORG_ID,
    orgName: "Norwin Rotary Club",
    orgWebsite: "norwin-rotary-club.mypillar.co",
    eventType,
    data,
    priority: "normal",
    category: "community",
    cadenceKey: `nrc_${eventType}`,
    suggestedPlatforms: ["facebook"],
    suggestedTone: "professional",
    postImmediately: false,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    logger.warn({ err, eventType }, "NRC content hook fire-and-forget failed");
  } finally {
    clearTimeout(timeout);
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────

router.post("/nrc/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: "Missing credentials" });
      return;
    }
    if (username !== getAdminUser()) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const hash = await getAdminHash();
    const ok = await bcrypt.compare(password, hash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const exp = Date.now() + SESSION_DURATION_MS;
    const payload = `${username}:${exp}`;
    const signed = signSession(payload, getSessionSecret());
    res.cookie(SESSION_COOKIE, signed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
    });
    res.json({ ok: true, username });
  } catch (err) {
    logger.error({ err }, "NRC login error");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/nrc/auth/logout", (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/nrc/auth/me", (req: Request, res: Response) => {
  const cookie = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!cookie) {
    res.json({ authenticated: false });
    return;
  }
  const payload = verifySession(cookie, getSessionSecret());
  if (!payload) {
    res.json({ authenticated: false });
    return;
  }
  const [user, exp] = payload.split(":");
  if (!user || !exp || Date.now() > Number(exp)) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, username: user });
});

// ── Public: Events ────────────────────────────────────────────────────────────

router.get("/nrc/events", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, title, description, event_date, end_date, location, image_url,
             is_ticketed, ticket_price, ticket_capacity, tickets_sold, is_published,
             stripe_price_id, created_at
      FROM nrc_events
      WHERE is_published = true AND event_date >= now() - interval '1 day'
      ORDER BY event_date ASC
      LIMIT 50
    `);
    res.json(rows.rows);
  } catch (err) {
    logger.error({ err }, "NRC get events error");
    res.status(500).json({ error: "Failed to load events" });
  }
});

router.get("/nrc/events/:id", async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, title, description, event_date, end_date, location, image_url,
             is_ticketed, ticket_price, ticket_capacity, tickets_sold, is_published,
             stripe_price_id, created_at
      FROM nrc_events
      WHERE id = ${req.params.id} AND is_published = true
    `);
    if (!rows.rows[0]) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "NRC get event error");
    res.status(500).json({ error: "Failed to load event" });
  }
});

// ── Admin: Events ─────────────────────────────────────────────────────────────

router.get("/nrc/admin/events", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM nrc_events ORDER BY event_date DESC LIMIT 100
    `);
    res.json(rows.rows);
  } catch (err) {
    logger.error({ err }, "NRC admin get events error");
    res.status(500).json({ error: "Failed to load events" });
  }
});

router.post("/nrc/admin/events", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, event_date, end_date, location, image_url,
            is_ticketed, ticket_price, ticket_capacity, stripe_price_id } = req.body as Record<string, unknown>;
    const rows = await db.execute(sql`
      INSERT INTO nrc_events (title, description, event_date, end_date, location, image_url,
                              is_ticketed, ticket_price, ticket_capacity, stripe_price_id, is_published)
      VALUES (
        ${String(title ?? "")},
        ${description ? String(description) : null},
        ${String(event_date ?? "")},
        ${end_date ? String(end_date) : null},
        ${location ? String(location) : null},
        ${image_url ? String(image_url) : null},
        ${Boolean(is_ticketed)},
        ${ticket_price ? Number(ticket_price) : null},
        ${ticket_capacity ? Number(ticket_capacity) : null},
        ${stripe_price_id ? String(stripe_price_id) : null},
        false
      )
      RETURNING *
    `);
    res.status(201).json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "NRC create event error");
    res.status(500).json({ error: "Failed to create event" });
  }
});

router.put("/nrc/admin/events/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, event_date, end_date, location, image_url,
            is_ticketed, ticket_price, ticket_capacity, is_published, stripe_price_id } = req.body as Record<string, unknown>;
    const wasPublished = Boolean(is_published);
    const rows = await db.execute(sql`
      UPDATE nrc_events SET
        title = ${String(title ?? "")},
        description = ${description ? String(description) : null},
        event_date = ${String(event_date ?? "")},
        end_date = ${end_date ? String(end_date) : null},
        location = ${location ? String(location) : null},
        image_url = ${image_url ? String(image_url) : null},
        is_ticketed = ${Boolean(is_ticketed)},
        ticket_price = ${ticket_price ? Number(ticket_price) : null},
        ticket_capacity = ${ticket_capacity ? Number(ticket_capacity) : null},
        is_published = ${wasPublished},
        stripe_price_id = ${stripe_price_id ? String(stripe_price_id) : null},
        updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING *
    `);
    if (!rows.rows[0]) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (wasPublished) {
      fireContentHook("eventActivated", { title, event_date, location }).catch(() => {});
    }
    res.json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "NRC update event error");
    res.status(500).json({ error: "Failed to update event" });
  }
});

router.delete("/nrc/admin/events/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM nrc_events WHERE id = ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "NRC delete event error");
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// ── Public: Blog ──────────────────────────────────────────────────────────────

router.get("/nrc/blog", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, title, slug, excerpt, cover_image_url, author, published_at, tags
      FROM nrc_blog_posts
      WHERE is_published = true
      ORDER BY published_at DESC
      LIMIT 20
    `);
    res.json(rows.rows);
  } catch (err) {
    logger.error({ err }, "NRC get blog error");
    res.status(500).json({ error: "Failed to load blog posts" });
  }
});

router.get("/nrc/blog/:slug", async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM nrc_blog_posts
      WHERE slug = ${req.params.slug} AND is_published = true
    `);
    if (!rows.rows[0]) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "NRC get blog post error");
    res.status(500).json({ error: "Failed to load blog post" });
  }
});

// ── Admin: Blog ───────────────────────────────────────────────────────────────

router.get("/nrc/admin/blog", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM nrc_blog_posts ORDER BY created_at DESC LIMIT 100
    `);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load blog posts" });
  }
});

router.post("/nrc/admin/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, slug, excerpt, body, cover_image_url, author, tags, is_published } = req.body as Record<string, unknown>;
    const slugVal = slug ? String(slug) : String(title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const rows = await db.execute(sql`
      INSERT INTO nrc_blog_posts (title, slug, excerpt, body, cover_image_url, author, tags, is_published, published_at)
      VALUES (
        ${String(title ?? "")},
        ${slugVal},
        ${excerpt ? String(excerpt) : null},
        ${body ? String(body) : null},
        ${cover_image_url ? String(cover_image_url) : null},
        ${author ? String(author) : "Norwin Rotary Club"},
        ${tags ? String(tags) : null},
        ${Boolean(is_published)},
        ${is_published ? new Date().toISOString() : null}
      )
      RETURNING *
    `);
    if (is_published) {
      fireContentHook("blogPublished", { title, slug: slugVal }).catch(() => {});
    }
    res.status(201).json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "NRC create blog post error");
    res.status(500).json({ error: "Failed to create blog post" });
  }
});

router.put("/nrc/admin/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, slug, excerpt, body, cover_image_url, author, tags, is_published } = req.body as Record<string, unknown>;
    const slugVal = slug ? String(slug) : String(title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const rows = await db.execute(sql`
      UPDATE nrc_blog_posts SET
        title = ${String(title ?? "")},
        slug = ${slugVal},
        excerpt = ${excerpt ? String(excerpt) : null},
        body = ${body ? String(body) : null},
        cover_image_url = ${cover_image_url ? String(cover_image_url) : null},
        author = ${author ? String(author) : "Norwin Rotary Club"},
        tags = ${tags ? String(tags) : null},
        is_published = ${Boolean(is_published)},
        published_at = CASE WHEN ${Boolean(is_published)} = true AND published_at IS NULL THEN now() ELSE published_at END,
        updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING *
    `);
    if (!rows.rows[0]) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    if (is_published) {
      fireContentHook("blogPublished", { title, slug: slugVal }).catch(() => {});
    }
    res.json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "NRC update blog post error");
    res.status(500).json({ error: "Failed to update blog post" });
  }
});

router.delete("/nrc/admin/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM nrc_blog_posts WHERE id = ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete blog post" });
  }
});

// ── Public: Sponsors ──────────────────────────────────────────────────────────

router.get("/nrc/sponsors", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, name, logo_url, website_url, tier, description
      FROM nrc_sponsors
      WHERE is_active = true
      ORDER BY tier_rank ASC, name ASC
    `);
    res.json(rows.rows);
  } catch (err) {
    logger.error({ err }, "NRC get sponsors error");
    res.status(500).json({ error: "Failed to load sponsors" });
  }
});

// ── Admin: Sponsors ───────────────────────────────────────────────────────────

router.get("/nrc/admin/sponsors", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM nrc_sponsors ORDER BY tier_rank ASC, name ASC`);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load sponsors" });
  }
});

router.post("/nrc/admin/sponsors", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, logo_url, website_url, tier, description, tier_rank } = req.body as Record<string, unknown>;
    const rows = await db.execute(sql`
      INSERT INTO nrc_sponsors (name, logo_url, website_url, tier, description, tier_rank, is_active)
      VALUES (
        ${String(name ?? "")},
        ${logo_url ? String(logo_url) : null},
        ${website_url ? String(website_url) : null},
        ${tier ? String(tier) : "community"},
        ${description ? String(description) : null},
        ${tier_rank ? Number(tier_rank) : 99},
        true
      )
      RETURNING *
    `);
    fireContentHook("sponsorAdded", { name, tier }).catch(() => {});
    res.status(201).json(rows.rows[0]);
  } catch (err) {
    logger.error({ err }, "NRC create sponsor error");
    res.status(500).json({ error: "Failed to create sponsor" });
  }
});

router.put("/nrc/admin/sponsors/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, logo_url, website_url, tier, description, tier_rank, is_active } = req.body as Record<string, unknown>;
    const rows = await db.execute(sql`
      UPDATE nrc_sponsors SET
        name = ${String(name ?? "")},
        logo_url = ${logo_url ? String(logo_url) : null},
        website_url = ${website_url ? String(website_url) : null},
        tier = ${tier ? String(tier) : "community"},
        description = ${description ? String(description) : null},
        tier_rank = ${tier_rank ? Number(tier_rank) : 99},
        is_active = ${Boolean(is_active)},
        updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING *
    `);
    if (!rows.rows[0]) {
      res.status(404).json({ error: "Sponsor not found" });
      return;
    }
    res.json(rows.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update sponsor" });
  }
});

router.delete("/nrc/admin/sponsors/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM nrc_sponsors WHERE id = ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete sponsor" });
  }
});

// ── Public: Newsletter ────────────────────────────────────────────────────────

router.post("/nrc/newsletter/subscribe", async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body as { email?: string; name?: string };
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }
    await db.execute(sql`
      INSERT INTO nrc_newsletter_subscribers (email, name, org_id)
      VALUES (${email.toLowerCase().trim()}, ${name ? String(name) : null}, ${NRC_ORG_ID})
      ON CONFLICT (org_id, email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, nrc_newsletter_subscribers.name),
        unsubscribed_at = NULL
    `);
    res.json({ ok: true, message: "Thanks for subscribing!" });
  } catch (err) {
    logger.error({ err }, "NRC newsletter subscribe error");
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

router.get("/nrc/newsletter/unsubscribe", async (req: Request, res: Response) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email) {
      res.status(400).json({ error: "Email required" });
      return;
    }
    await db.execute(sql`
      UPDATE nrc_newsletter_subscribers
      SET unsubscribed_at = now()
      WHERE email = ${email.toLowerCase().trim()} AND org_id = ${NRC_ORG_ID}
    `);
    res.json({ ok: true, message: "You have been unsubscribed." });
  } catch (err) {
    res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

router.get("/nrc/admin/newsletter", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM nrc_newsletter_subscribers
      WHERE org_id = ${NRC_ORG_ID} AND unsubscribed_at IS NULL
      ORDER BY subscribed_at DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load subscribers" });
  }
});

// ── Public: Contact ───────────────────────────────────────────────────────────

router.post("/nrc/contact", async (req: Request, res: Response) => {
  try {
    const { name, email, message, subject } = req.body as Record<string, unknown>;
    if (!name || !email || !message) {
      res.status(400).json({ error: "Name, email, and message are required" });
      return;
    }
    await db.execute(sql`
      INSERT INTO nrc_contact_messages (name, email, message, subject)
      VALUES (
        ${String(name)},
        ${String(email)},
        ${String(message)},
        ${subject ? String(subject) : null}
      )
    `);
    res.json({ ok: true, message: "Message sent! We'll be in touch soon." });
  } catch (err) {
    logger.error({ err }, "NRC contact error");
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/nrc/admin/contact", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM nrc_contact_messages ORDER BY created_at DESC LIMIT 100
    `);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.put("/nrc/admin/contact/:id/read", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE nrc_contact_messages SET is_read = true WHERE id = ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// ── Public: Gallery ───────────────────────────────────────────────────────────

router.get("/nrc/gallery", async (_req: Request, res: Response) => {
  try {
    const albums = await db.execute(sql`
      SELECT pa.id, pa.title, pa.description, pa.event_slug, pa.created_at,
             ap.url AS cover_photo_url,
             (SELECT COUNT(*) FROM nrc_album_photos WHERE album_id = pa.id) AS photo_count
      FROM nrc_photo_albums pa
      LEFT JOIN nrc_album_photos ap ON ap.id = pa.cover_photo_id
      ORDER BY pa.created_at DESC
      LIMIT 30
    `);
    res.json(albums.rows);
  } catch (err) {
    logger.error({ err }, "NRC get gallery error");
    res.status(500).json({ error: "Failed to load gallery" });
  }
});

router.get("/nrc/gallery/:albumId", async (req: Request, res: Response) => {
  try {
    const [album] = (await db.execute(sql`
      SELECT * FROM nrc_photo_albums WHERE id = ${req.params.albumId}
    `)).rows;
    if (!album) {
      res.status(404).json({ error: "Album not found" });
      return;
    }
    const photos = await db.execute(sql`
      SELECT * FROM nrc_album_photos WHERE album_id = ${req.params.albumId} ORDER BY created_at ASC
    `);
    res.json({ album, photos: photos.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load album" });
  }
});

// ── Admin: Gallery ────────────────────────────────────────────────────────────

router.post("/nrc/admin/gallery/albums", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, event_slug } = req.body as Record<string, unknown>;
    const rows = await db.execute(sql`
      INSERT INTO nrc_photo_albums (title, description, event_slug)
      VALUES (
        ${String(title ?? "")},
        ${description ? String(description) : null},
        ${event_slug ? String(event_slug) : null}
      )
      RETURNING *
    `);
    res.status(201).json(rows.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create album" });
  }
});

router.post("/nrc/admin/gallery/photos", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { album_id, url, caption } = req.body as Record<string, unknown>;
    const rows = await db.execute(sql`
      INSERT INTO nrc_album_photos (album_id, url, caption)
      VALUES (
        ${String(album_id ?? "")},
        ${String(url ?? "")},
        ${caption ? String(caption) : null}
      )
      RETURNING *
    `);
    res.status(201).json(rows.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to add photo" });
  }
});

// ── Admin: Dashboard stats ────────────────────────────────────────────────────

router.get("/nrc/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [eventsCount] = (await db.execute(sql`SELECT COUNT(*) as count FROM nrc_events WHERE is_published = true`)).rows;
    const [blogCount] = (await db.execute(sql`SELECT COUNT(*) as count FROM nrc_blog_posts WHERE is_published = true`)).rows;
    const [subCount] = (await db.execute(sql`SELECT COUNT(*) as count FROM nrc_newsletter_subscribers WHERE org_id = ${NRC_ORG_ID} AND unsubscribed_at IS NULL`)).rows;
    const [msgCount] = (await db.execute(sql`SELECT COUNT(*) as count FROM nrc_contact_messages WHERE is_read = false`)).rows;
    const [sponsorCount] = (await db.execute(sql`SELECT COUNT(*) as count FROM nrc_sponsors WHERE is_active = true`)).rows;
    res.json({
      publishedEvents: Number((eventsCount as Record<string,unknown>)?.count ?? 0),
      publishedPosts: Number((blogCount as Record<string,unknown>)?.count ?? 0),
      subscribers: Number((subCount as Record<string,unknown>)?.count ?? 0),
      unreadMessages: Number((msgCount as Record<string,unknown>)?.count ?? 0),
      activeSponsors: Number((sponsorCount as Record<string,unknown>)?.count ?? 0),
    });
  } catch (err) {
    logger.error({ err }, "NRC admin stats error");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ── Public: Site content ──────────────────────────────────────────────────────

router.get("/nrc/content", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT key, value FROM nrc_site_content`);
    const content: Record<string, string> = {};
    for (const row of rows.rows as Array<{ key: string; value: string }>) {
      content[row.key] = row.value;
    }
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: "Failed to load content" });
  }
});

router.put("/nrc/admin/content", requireAdmin, async (req: Request, res: Response) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await db.execute(sql`
        INSERT INTO nrc_site_content (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update content" });
  }
});

// ── Ticket purchase (Stripe) ──────────────────────────────────────────────────

router.post("/nrc/tickets/checkout", async (req: Request, res: Response) => {
  try {
    const { event_id, quantity, buyer_email, buyer_name } = req.body as Record<string, unknown>;
    if (!event_id || !buyer_email) {
      res.status(400).json({ error: "event_id and buyer_email required" });
      return;
    }
    const [event] = (await db.execute(sql`
      SELECT * FROM nrc_events WHERE id = ${String(event_id)} AND is_published = true AND is_ticketed = true
    `)).rows;
    if (!event) {
      res.status(404).json({ error: "Event not found or not ticketed" });
      return;
    }
    const evt = event as Record<string, unknown>;
    const qty = Number(quantity ?? 1);
    const price = Number(evt.ticket_price ?? 0);
    if (price <= 0) {
      res.status(400).json({ error: "Event has no ticket price configured" });
      return;
    }

    // Import Stripe client
    const { getUncachableStripeClient } = await import("../stripeClient");
    const stripe = await getUncachableStripeClient();

    const devDomain = process.env.REPLIT_DEV_DOMAIN;
    const baseUrl = devDomain
      ? `https://${devDomain}/norwin-rotary`
      : `https://norwin-rotary-club.mypillar.co`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `${String(evt.title ?? "Event")} — Ticket`,
            description: `${qty} ticket(s) to ${String(evt.title ?? "")}`,
          },
        },
        quantity: qty,
      }],
      mode: "payment",
      customer_email: String(buyer_email),
      success_url: `${baseUrl}/payment-success?event_id=${String(event_id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/events/${String(event_id)}`,
      metadata: {
        nrc_event_id: String(event_id),
        buyer_name: String(buyer_name ?? ""),
        buyer_email: String(buyer_email),
        quantity: String(qty),
      },
    });

    // Record purchase intent
    await db.execute(sql`
      INSERT INTO nrc_ticket_purchases (event_id, buyer_email, buyer_name, quantity, amount_paid, stripe_session_id, status)
      VALUES (
        ${String(event_id)},
        ${String(buyer_email)},
        ${buyer_name ? String(buyer_name) : null},
        ${qty},
        ${price * qty},
        ${session.id},
        'pending'
      )
    `);

    fireContentHook("ticketPurchased", {
      eventTitle: evt.title,
      buyerEmail: buyer_email,
      quantity: qty,
    }).catch(() => {});

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "NRC ticket checkout error");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/nrc/tickets/verify", async (req: Request, res: Response) => {
  try {
    const { session_id } = req.query as { session_id?: string };
    if (!session_id) {
      res.status(400).json({ error: "session_id required" });
      return;
    }
    const { getUncachableStripeClient } = await import("../stripeClient");
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid") {
      await db.execute(sql`
        UPDATE nrc_ticket_purchases SET status = 'confirmed'
        WHERE stripe_session_id = ${session_id} AND status = 'pending'
      `);
      const eventId = session.metadata?.nrc_event_id;
      if (eventId) {
        const qty = Number(session.metadata?.quantity ?? 1);
        await db.execute(sql`
          UPDATE nrc_events SET tickets_sold = COALESCE(tickets_sold, 0) + ${qty}
          WHERE id = ${eventId}
        `);
      }
    }
    res.json({ status: session.payment_status, session });
  } catch (err) {
    logger.error({ err }, "NRC ticket verify error");
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

export default router;
