import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { sql as neonSql } from "drizzle-orm";
import * as storage from "./storage.js";
import { db } from "./db.js";
import { computeRegistrationWindow } from "./registration-window-engine.js";
import { createContentHook } from "./content-hooks.js";

function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any).adminId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function requirePillarServiceKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PILLAR_SERVICE_KEY;
  const provided = req.headers["x-pillar-service-key"] as string | undefined;
  if (!expected) {
    return res.status(500).json({ ok: false, error: "PILLAR_SERVICE_KEY not configured on server" });
  }
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

function getOrgId(req: Request): string {
  // x-org-id header takes priority (dev overrides and reverse-proxy setups)
  const headerOrgId = req.headers["x-org-id"] as string;
  if (headerOrgId) return headerOrgId;

  // In production: extract subdomain only if it looks like a real mypillar.co slug
  const host = (req.headers["x-forwarded-host"] as string || req.headers.host || "").replace(/:\d+$/, "");
  const parts = host.split(".");
  if (parts.length >= 3) {
    const subdomain = parts[0];
    // Skip UUID-like identifiers (Replit dev domains) — only accept short slugs
    if (subdomain && subdomain !== "www" && subdomain.length <= 64 && !subdomain.includes("replit")) {
      return subdomain;
    }
  }
  return "default";
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function registerRoutes(app: Express) {
  app.get("/api/org-config", async (req, res) => {
    const orgId = getOrgId(req);
    const config = await storage.getOrgConfig(orgId);
    if (!config) return res.json({ _empty: true, orgId });
    res.json(config);
  });

  // Fetch events from the Pillar events table (shared DB) as a fallback
  // when cs_events has no entries for this org.
  async function getPillarEvents(orgSlug: string) {
    try {
      const result = await db.execute(neonSql`
        SELECT e.id, e.name, e.slug, e.description, e.event_type,
               e.start_date, e.start_time, e.location,
               e.is_ticketed, e.ticket_price::text, e.ticket_capacity,
               e.is_active, e.featured, e.image_url,
               e.has_registration, e.show_on_public_site
        FROM events e
        JOIN organizations o ON e.org_id = o.id
        WHERE o.slug = ${orgSlug}
          AND (e.show_on_public_site = true OR e.show_on_public_site IS NULL)
          AND e.is_active IS NOT FALSE
        ORDER BY e.start_date ASC
      `);
      return (result.rows as Record<string, unknown>[]).map((row, idx) => ({
        id: idx + 1,
        orgId: orgSlug,
        title: (row.name as string) || "",
        slug: (row.slug as string) || null,
        description: (row.description as string) || "",
        date: (row.start_date as string) || "",
        time: (row.start_time as string) || "",
        location: (row.location as string) || "",
        category: (row.event_type as string) || "General",
        imageUrl: (row.image_url as string) || null,
        posterImageUrl: null,
        featured: Boolean(row.featured),
        isActive: row.is_active !== false,
        isTicketed: Boolean(row.is_ticketed),
        ticketPrice: (row.ticket_price as string) || null,
        ticketCapacity: (row.ticket_capacity as number) || null,
        hasRegistration: Boolean(row.has_registration),
        showInNav: false,
        externalLink: null,
      }));
    } catch {
      return [];
    }
  }

  async function getPillarEventBySlug(orgSlug: string, slug: string) {
    try {
      const result = await db.execute(neonSql`
        SELECT e.id, e.name, e.slug, e.description, e.event_type,
               e.start_date, e.start_time, e.location,
               e.is_ticketed, e.ticket_price::text, e.ticket_capacity,
               e.is_active, e.featured, e.image_url, e.has_registration
        FROM events e
        JOIN organizations o ON e.org_id = o.id
        WHERE o.slug = ${orgSlug}
          AND e.slug = ${slug}
        LIMIT 1
      `);
      const row = (result.rows as Record<string, unknown>[])[0];
      if (!row) return null;
      return {
        id: 1,
        orgId: orgSlug,
        title: (row.name as string) || "",
        slug: (row.slug as string) || null,
        description: (row.description as string) || "",
        date: (row.start_date as string) || "",
        time: (row.start_time as string) || "",
        location: (row.location as string) || "",
        category: (row.event_type as string) || "General",
        imageUrl: (row.image_url as string) || null,
        posterImageUrl: null,
        featured: Boolean(row.featured),
        isActive: row.is_active !== false,
        isTicketed: Boolean(row.is_ticketed),
        ticketPrice: (row.ticket_price as string) || null,
        ticketCapacity: (row.ticket_capacity as number) || null,
        hasRegistration: Boolean(row.has_registration),
        showInNav: false,
        externalLink: null,
      };
    } catch {
      return null;
    }
  }

  async function getPillarTicketTypes(eventSlug: string, orgSlug: string) {
    try {
      const result = await db.execute(neonSql`
        SELECT tt.id, tt.name, tt.price::float AS price, tt.quantity, tt.sold, tt.is_active
        FROM ticket_types tt
        JOIN events e ON tt.event_id = e.id
        JOIN organizations o ON e.org_id = o.id
        WHERE e.slug = ${eventSlug}
          AND o.slug = ${orgSlug}
          AND tt.is_active = true
        ORDER BY tt.price ASC
      `);
      return (result.rows as Record<string, unknown>[]).map(row => ({
        id: row.id as string,
        name: (row.name as string) || "General Admission",
        price: Number(row.price) || 0,
        quantity: row.quantity as number | null,
        sold: (row.sold as number) || 0,
        available: row.quantity === null || (row.quantity as number) - ((row.sold as number) || 0) > 0,
      }));
    } catch {
      return [];
    }
  }

  async function ensurePillarTicketType(eventSlug: string, orgSlug: string, price: number): Promise<string | null> {
    try {
      const existing = await getPillarTicketTypes(eventSlug, orgSlug);
      if (existing.length > 0) return existing[0].id;
      const result = await db.execute(neonSql`
        INSERT INTO ticket_types (id, event_id, org_id, name, price, sold, is_active, created_at)
        SELECT
          gen_random_uuid(),
          e.id,
          e.org_id,
          'General Admission',
          ${price},
          0,
          true,
          NOW()
        FROM events e
        JOIN organizations o ON e.org_id = o.id
        WHERE e.slug = ${eventSlug}
          AND o.slug = ${orgSlug}
        RETURNING id
      `);
      return (result.rows[0] as Record<string, unknown>)?.id as string ?? null;
    } catch {
      return null;
    }
  }

  app.get("/api/events", async (req, res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    const orgId = getOrgId(req);
    const includeAll = req.query.all === "true";
    let events = await storage.getEvents(orgId);
    // Fall back to Pillar events table if cs_events has nothing for this org
    if (events.length === 0) {
      events = await getPillarEvents(orgId) as typeof events;
    }
    res.json(includeAll ? events : events.filter(e => e.isActive !== false));
  });

  app.get("/api/events/slug/:slug", async (req, res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    const orgId = getOrgId(req);
    let event = await storage.getEventBySlug(orgId, req.params.slug);
    // Fall back to Pillar events table if not found in cs_events
    if (!event) {
      event = await getPillarEventBySlug(orgId, req.params.slug) as typeof event;
    }
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  });

  app.get("/api/events/:slug/ticket-availability", async (req, res) => {
    const orgId = getOrgId(req);
    const { slug } = req.params;
    let event = await storage.getEventBySlug(orgId, slug);
    if (!event) event = await getPillarEventBySlug(orgId, slug) as typeof event;
    if (!event || !event.isTicketed) return res.status(404).json({ error: "Not a ticketed event" });
    const ticketTypes = await getPillarTicketTypes(slug, orgId);
    const sold = await storage.getTicketsSoldForEvent(orgId, event.id);
    const remaining = event.ticketCapacity ? event.ticketCapacity - sold : null;
    res.json({
      ticketPrice: event.ticketPrice || "0",
      capacity: event.ticketCapacity,
      sold,
      remaining,
      available: remaining === null || remaining > 0,
      ticketTypes,
    });
  });

  app.post("/api/events/:slug/ticket-checkout", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { slug } = req.params;
      const { buyerName, buyerEmail, quantity, ticketTypeId: requestedTypeId } = req.body as {
        buyerName?: string; buyerEmail?: string; quantity?: number; ticketTypeId?: string;
      };
      if (!buyerName || !buyerEmail || !quantity || quantity < 1 || quantity > 10) {
        return res.status(400).json({ error: "Invalid purchase data" });
      }

      // Find the event — cs_events first, then Pillar events
      let event = await storage.getEventBySlug(orgId, slug);
      if (!event) event = await getPillarEventBySlug(orgId, slug) as typeof event;
      if (!event || !event.isTicketed) return res.status(404).json({ error: "Not a ticketed event" });

      // Resolve ticket type — use provided ID or auto-create a General Admission type
      let ticketTypeId = requestedTypeId;
      if (!ticketTypeId) {
        const price = parseFloat(event.ticketPrice || "0");
        ticketTypeId = await ensurePillarTicketType(slug, orgId, price) ?? undefined;
        if (!ticketTypeId) {
          return res.status(500).json({ error: "Could not resolve ticket type for this event" });
        }
      }

      // Forward to Pillar API's Stripe Connect checkout endpoint
      const apiPort = process.env.API_PORT || "8080";
      const apiRes = await fetch(`http://localhost:${apiPort}/api/public/events/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-proto": String(req.headers["x-forwarded-proto"] ?? "https"),
          "x-forwarded-host": String(req.headers["x-forwarded-host"] ?? req.headers.host ?? ""),
        },
        body: JSON.stringify({
          ticketTypeId,
          quantity,
          attendeeName: buyerName,
          attendeeEmail: buyerEmail,
          _ts: Date.now() - 5000,
        }),
      });

      const data = await apiRes.json() as Record<string, unknown>;
      if (!apiRes.ok) return res.status(apiRes.status).json(data);
      res.json({ checkoutUrl: data.checkoutUrl, saleId: data.saleId });
    } catch (err) {
      console.error("Ticket checkout error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/sponsors", async (req, res) => {
    const orgId = getOrgId(req);
    res.json(await storage.getSponsors(orgId));
  });

  app.get("/api/sponsors/event/:eventType", async (req, res) => {
    const orgId = getOrgId(req);
    res.json(await storage.getSponsorsByEvent(orgId, req.params.eventType));
  });

  app.get("/api/businesses", async (req, res) => {
    const orgId = getOrgId(req);
    res.json(await storage.getBusinesses(orgId));
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { website, formTiming, ...formData } = req.body;
      if (website) return res.json({ success: true });
      if (typeof formTiming === "number" && formTiming < 3000) return res.json({ success: true });
      if (!formData.name || !formData.email || !formData.subject || !formData.message) return res.status(400).json({ error: "All fields required" });
      const msg = await storage.createContactMessage(orgId, formData);
      res.status(201).json(msg);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/photo-albums", async (req, res) => {
    const orgId = getOrgId(req);
    res.json(await storage.getPhotoAlbums(orgId));
  });

  app.get("/api/photo-albums/:id", async (req, res) => {
    const orgId = getOrgId(req);
    const album = await storage.getPhotoAlbum(orgId, parseInt(req.params.id));
    if (!album) return res.status(404).json({ error: "Album not found" });
    res.json(album);
  });

  app.get("/api/photo-albums/:id/photos", async (req, res) => {
    const orgId = getOrgId(req);
    res.json(await storage.getAlbumPhotos(orgId, parseInt(req.params.id)));
  });

  app.get("/api/site-content", async (req, res) => {
    const orgId = getOrgId(req);
    const rows = await storage.getAllSiteContent(orgId);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    res.json(map);
  });

  app.get("/api/registration-status/:eventType", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const settings = await storage.getRegistrationSettings(orgId, req.params.eventType);
      const event = await storage.getEventBySlug(orgId, req.params.eventType);
      const status = computeRegistrationWindow(settings || null, event?.isTicketed || false);
      res.json(status);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/vendor-registrations", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { website, formTiming, ...data } = req.body;
      if (website) return res.json({ success: true });
      if (typeof formTiming === "number" && formTiming < 3000) return res.json({ success: true });
      if (!data.eventType || !data.businessName || !data.contactName || !data.email || !data.phone || !data.vendorCategory) {
        return res.status(400).json({ error: "Required fields missing" });
      }
      const reg = await storage.createVendorRegistration(orgId, data);
      res.status(201).json(reg);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/sponsorship-inquiries", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { website, formTiming, ...data } = req.body;
      if (website) return res.json({ success: true });
      if (!data.businessName || !data.contactName || !data.email || !data.phone || !data.level) return res.status(400).json({ error: "Required fields missing" });
      const inquiry = await storage.createSponsorshipInquiry(orgId, data);
      res.status(201).json(inquiry);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/blog", async (req, res) => {
    const orgId = getOrgId(req);
    res.json(await storage.getBlogPosts(orgId, true));
  });

  app.get("/api/blog/:slug", async (req, res) => {
    const orgId = getOrgId(req);
    const post = await storage.getBlogPostBySlug(orgId, req.params.slug);
    if (!post || !post.published) return res.status(404).json({ error: "Post not found" });
    res.json(post);
  });

  app.post("/api/newsletter/subscribe", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { email, firstName, website, formTiming } = req.body;
      if (website) return res.json({ message: "Subscribed!" });
      if (typeof formTiming === "number" && formTiming < 2000) return res.json({ message: "Subscribed!" });
      if (!email || typeof email !== "string") return res.status(400).json({ error: "Valid email required" });
      const existing = await storage.getSubscriberByEmail(orgId, email.toLowerCase().trim());
      if (existing) {
        if (existing.status === "active") return res.json({ message: "You're already subscribed!" });
        await storage.updateSubscriber(orgId, existing.id, { status: "active", unsubscribedAt: null });
        return res.json({ message: "Welcome back! You've been re-subscribed." });
      }
      const unsubscribeToken = crypto.randomBytes(32).toString("hex");
      await storage.createSubscriber(orgId, { email: email.toLowerCase().trim(), firstName: firstName?.trim() || null, status: "active", unsubscribeToken });
      res.json({ message: "Thanks for subscribing!" });
    } catch { res.status(500).json({ error: "Failed to subscribe" }); }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const user = await storage.getAdminUser(orgId, username);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      (req.session as any).adminId = user.id;
      (req.session as any).orgId = orgId;
      res.json({ id: user.id, username: user.username });
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!(req.session as any).adminId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getAdminUserById((req.session as any).adminId);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ id: user.id, username: user.username });
  });

  app.post("/api/admin/events", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const config = await storage.getOrgConfig(orgId);
      const hooks = createContentHook({ orgName: config?.orgName || "", pillarWebhookUrl: undefined });
      const body = { ...req.body };
      if (!body.slug && body.title) body.slug = generateSlug(body.title);
      if (body.ticketCapacity === "" || body.ticketCapacity === null) delete body.ticketCapacity;
      if (body.ticketPrice === "") body.ticketPrice = null;
      const event = await storage.createEvent(orgId, body);
      if (event.isActive !== false) {
        hooks.eventActivated({ title: event.title, slug: event.slug || "", date: event.date, time: event.time, location: event.location, category: event.category, description: event.description, isTicketed: event.isTicketed || false, ticketPrice: event.ticketPrice });
      }
      res.status(201).json(event);
    } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  });

  app.patch("/api/admin/events/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const id = parseInt(req.params.id);
      const before = await storage.getEvent(orgId, id);
      const body = { ...req.body };
      if (!body.slug && body.title) body.slug = generateSlug(body.title);
      const updated = await storage.updateEvent(orgId, id, body);
      if (!updated) return res.status(404).json({ error: "Event not found" });
      res.json(updated);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/admin/events/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const deleted = await storage.deleteEvent(orgId, parseInt(req.params.id));
      if (!deleted) return res.status(404).json({ error: "Event not found" });
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/admin/sponsors", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const sponsor = await storage.createSponsor(orgId, req.body);
      res.status(201).json(sponsor);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.patch("/api/admin/sponsors/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const updated = await storage.updateSponsor(orgId, parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Sponsor not found" });
      res.json(updated);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/admin/sponsors/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      await storage.deleteSponsor(orgId, parseInt(req.params.id));
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/admin/businesses", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      res.status(201).json(await storage.createBusiness(orgId, req.body));
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.patch("/api/admin/businesses/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const updated = await storage.updateBusiness(orgId, parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: "Business not found" });
      res.json(updated);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/admin/businesses/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      await storage.deleteBusiness(orgId, parseInt(req.params.id));
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.put("/api/admin/site-content", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const { key, value } = req.body;
      if (!key || typeof key !== "string" || typeof value !== "string") return res.status(400).json({ error: "Key and value required" });
      res.json(await storage.upsertSiteContent(orgId, key, value));
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/admin/contact-messages", requireAuth, async (req, res) => {
    const orgId = (req.session as any).orgId || getOrgId(req);
    res.json(await storage.getContactMessages(orgId));
  });

  app.get("/api/admin/vendor-registrations", requireAuth, async (req, res) => {
    const orgId = (req.session as any).orgId || getOrgId(req);
    res.json(await storage.getVendorRegistrations(orgId, req.query.eventType as string | undefined));
  });

  app.get("/api/admin/sponsorship-inquiries", requireAuth, async (req, res) => {
    const orgId = (req.session as any).orgId || getOrgId(req);
    res.json(await storage.getSponsorshipInquiries(orgId));
  });

  app.get("/api/admin/newsletter-subscribers", requireAuth, async (req, res) => {
    const orgId = (req.session as any).orgId || getOrgId(req);
    res.json(await storage.getNewsletterSubscribers(orgId));
  });

  app.get("/api/admin/blog", requireAuth, async (req, res) => {
    const orgId = (req.session as any).orgId || getOrgId(req);
    res.json(await storage.getBlogPosts(orgId, false));
  });

  app.post("/api/admin/blog", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const body = { ...req.body };
      if (!body.slug && body.title) body.slug = generateSlug(body.title);
      if (body.published && !body.publishedAt) body.publishedAt = new Date();
      const post = await storage.createBlogPost(orgId, body);
      res.status(201).json(post);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.patch("/api/admin/blog/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      const id = parseInt(req.params.id);
      const body = { ...req.body };
      if (body.title && !body.slug) body.slug = generateSlug(body.title);
      if (body.published === true) body.publishedAt = new Date();
      const updated = await storage.updateBlogPost(orgId, id, body);
      if (!updated) return res.status(404).json({ error: "Post not found" });
      res.json(updated);
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/admin/blog/:id", requireAuth, async (req, res) => {
    try {
      const orgId = (req.session as any).orgId || getOrgId(req);
      await storage.deleteBlogPost(orgId, parseInt(req.params.id));
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/admin/ticket-purchases/:eventId", requireAuth, async (req, res) => {
    const orgId = (req.session as any).orgId || getOrgId(req);
    res.json(await storage.getTicketPurchasesByEvent(orgId, parseInt(req.params.eventId)));
  });

  app.post("/api/pillar/setup", async (req, res) => {
    try {
      const orgId = req.body?.orgId || getOrgId(req);
      const serviceKey = (req.headers["x-pillar-service-key"] || req.headers["x-pillar-key"]) as string;

      const envKey = process.env.PILLAR_SERVICE_KEY;
      if (!envKey || serviceKey !== envKey) {
        try {
          const result = await db.execute(neonSql`SELECT community_site_key FROM organizations WHERE slug = ${orgId} LIMIT 1`);
          const row = (result as any).rows?.[0] || (result as any)[0];
          if (!row) return res.status(401).json({ error: "Organization not found" });
          if (row.community_site_key && row.community_site_key !== serviceKey) {
            return res.status(401).json({ error: "Invalid service key" });
          }
        } catch {
          if (!serviceKey) return res.status(401).json({ error: "Service key required" });
        }
      }

      if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Request body must be a JSON object" });

      const payload = req.body;
      if (!payload.orgName) return res.status(400).json({ error: "orgName is required" });

      const shortName = payload.shortName || payload.orgName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 4);

      const configData: any = {
        orgName: payload.orgName,
        shortName,
        orgType: payload.orgType || "community",
        tagline: payload.tagline || null,
        mission: payload.mission || null,
        location: payload.location || null,
        primaryColor: payload.primaryColor || "#c25038",
        accentColor: payload.accentColor || "#2563eb",
        logoUrl: payload.logoUrl || null,
        heroImageUrl: payload.heroImageUrl || null,
        contactEmail: payload.contactEmail || null,
        contactPhone: payload.contactPhone || null,
        contactAddress: payload.contactAddress || null,
        mailingAddress: payload.mailingAddress || null,
        website: payload.website || null,
        socialFacebook: payload.socialFacebook || null,
        socialInstagram: payload.socialInstagram || null,
        socialTwitter: payload.socialTwitter || null,
        socialLinkedin: payload.socialLinkedin || null,
        meetingDay: payload.meetingDay || null,
        meetingTime: payload.meetingTime || null,
        meetingLocation: payload.meetingLocation || null,
        footerText: payload.footerText || null,
        metaDescription: payload.metaDescription || null,
        stats: Array.isArray(payload.stats) ? payload.stats : [],
        programs: Array.isArray(payload.programs) ? payload.programs : [],
        partners: Array.isArray(payload.partners) ? payload.partners : [],
        sponsorshipLevels: Array.isArray(payload.sponsorshipLevels) ? payload.sponsorshipLevels : [],
        features: payload.features || {},
      };

      await storage.upsertOrgConfig(orgId, configData);

      let eventsSeeded = 0, sponsorsSeeded = 0, businessesSeeded = 0, siteContentSeeded = 0;

      if (Array.isArray(payload.events)) {
        for (const ev of payload.events) {
          if (!ev.title || !ev.description || !ev.date || !ev.time || !ev.location || !ev.category) continue;
          const slug = ev.slug || generateSlug(ev.title);
          await storage.createEvent(orgId, { ...ev, slug });
          eventsSeeded++;
        }
      }

      if (Array.isArray(payload.sponsors)) {
        for (const sp of payload.sponsors) {
          if (!sp.name || !sp.level) continue;
          await storage.createSponsor(orgId, sp);
          sponsorsSeeded++;
        }
      }

      if (Array.isArray(payload.businesses)) {
        for (const biz of payload.businesses) {
          if (!biz.name || !biz.description || !biz.address || !biz.category) continue;
          await storage.createBusiness(orgId, biz);
          businessesSeeded++;
        }
      }

      if (payload.siteContent && typeof payload.siteContent === "object") {
        for (const [key, value] of Object.entries(payload.siteContent)) {
          if (typeof value === "string") {
            await storage.upsertSiteContent(orgId, key, value);
            siteContentSeeded++;
          }
        }
      }

      if (payload.adminPassword) {
        const existing = await storage.getAdminUser(orgId, "admin");
        if (!existing) {
          const hashedPassword = await bcrypt.hash(payload.adminPassword, 10);
          await storage.createAdminUser(orgId, "admin", hashedPassword);
        }
      }

      res.json({
        ok: true,
        orgConfig: { id: orgId, orgName: payload.orgName, shortName },
        seeded: { siteContent: siteContentSeeded, events: eventsSeeded, sponsors: sponsorsSeeded, businesses: businessesSeeded },
      });
    } catch (err) {
      console.error("Pillar setup error:", err);
      res.status(500).json({ error: "Setup failed" });
    }
  });

  app.get("/api/healthz", (_req, res) => res.json({ ok: true }));

  // ─── Internal service-to-service sync routes (Pillar dashboard → live tenant) ─

  app.post("/api/internal/events", requirePillarServiceKey, async (req: Request, res: Response) => {
    try {
      const { orgId, title, description, date, time, location, category, slug, imageUrl,
              isTicketed, ticketPrice, ticketCapacity, isActive } = req.body ?? {};
      if (!orgId || !title) {
        return res.status(400).json({ ok: false, error: "orgId and title are required" });
      }
      const eventSlug = slug || generateSlug(title);
      const created = await storage.createEvent(orgId, {
        title,
        description: description ?? "",
        date: date ?? "",
        time: time ?? "",
        location: location ?? "",
        category: category ?? "general",
        slug: eventSlug,
        imageUrl: imageUrl ?? null,
        isTicketed: isTicketed ?? false,
        ticketPrice: ticketPrice ?? null,
        ticketCapacity: ticketCapacity ?? null,
        isActive: isActive !== false,
      });
      console.log(`[internal-events] created for org=${orgId} slug=${eventSlug}`);
      return res.status(201).json({ ok: true, event: created });
    } catch (error: any) {
      console.error("[internal-events] create failed", error);
      return res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
    }
  });

  app.patch("/api/internal/events/slug/:slug", requirePillarServiceKey, async (req: Request, res: Response) => {
    try {
      const { orgId, title, description, date, time, location, category, imageUrl,
              isTicketed, ticketPrice, ticketCapacity, isActive } = req.body ?? {};
      if (!orgId) {
        return res.status(400).json({ ok: false, error: "orgId is required" });
      }
      const updated = await storage.updateEventBySlug(orgId, req.params.slug, {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(date !== undefined && { date }),
        ...(time !== undefined && { time }),
        ...(location !== undefined && { location }),
        ...(category !== undefined && { category }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isTicketed !== undefined && { isTicketed }),
        ...(ticketPrice !== undefined && { ticketPrice }),
        ...(ticketCapacity !== undefined && { ticketCapacity }),
        ...(isActive !== undefined && { isActive }),
      });
      if (!updated) {
        return res.status(404).json({ ok: false, error: "Event not found" });
      }
      console.log(`[internal-events] updated org=${orgId} slug=${req.params.slug}`);
      return res.json({ ok: true, event: updated });
    } catch (error: any) {
      console.error("[internal-events] update failed", error);
      return res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
    }
  });

  app.delete("/api/internal/events/slug/:slug", requirePillarServiceKey, async (req: Request, res: Response) => {
    try {
      const { orgId } = req.body ?? {};
      if (!orgId) {
        return res.status(400).json({ ok: false, error: "orgId is required" });
      }
      const deleted = await storage.deleteEventBySlug(orgId, req.params.slug);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: "Event not found" });
      }
      console.log(`[internal-events] deleted org=${orgId} slug=${req.params.slug}`);
      return res.json({ ok: true });
    } catch (error: any) {
      console.error("[internal-events] delete failed", error);
      return res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
    }
  });

  app.patch("/api/internal/org-config", requirePillarServiceKey, async (req: Request, res: Response) => {
    try {
      const { orgId, ...patch } = req.body ?? {};
      if (!orgId) {
        return res.status(400).json({ ok: false, error: "orgId is required" });
      }
      const updated = await storage.patchOrgConfig(orgId, patch);
      if (!updated) {
        return res.status(404).json({ ok: false, error: "Org config not found — site may not be provisioned yet" });
      }
      console.log(`[internal-org-config] patched org=${orgId}`);
      return res.json({ ok: true, config: updated });
    } catch (error: any) {
      console.error("[internal-org-config] patch failed", error);
      return res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
    }
  });
}
