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

function getOrgId(req: Request): string {
  const host = (req.headers["x-forwarded-host"] as string || req.headers.host || "").replace(/:\d+$/, "");
  const parts = host.split(".");
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (subdomain && subdomain !== "www") return subdomain;
  }
  return req.headers["x-org-id"] as string || "default";
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

  app.get("/api/events", async (req, res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    const orgId = getOrgId(req);
    const events = await storage.getEvents(orgId);
    const includeAll = req.query.all === "true";
    res.json(includeAll ? events : events.filter(e => e.isActive !== false));
  });

  app.get("/api/events/slug/:slug", async (req, res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    const orgId = getOrgId(req);
    const event = await storage.getEventBySlug(orgId, req.params.slug);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  });

  app.get("/api/events/:slug/ticket-availability", async (req, res) => {
    const orgId = getOrgId(req);
    const event = await storage.getEventBySlug(orgId, req.params.slug);
    if (!event || !event.isTicketed) return res.status(404).json({ error: "Not a ticketed event" });
    const sold = await storage.getTicketsSoldForEvent(orgId, event.id);
    const remaining = event.ticketCapacity ? event.ticketCapacity - sold : null;
    res.json({ ticketPrice: event.ticketPrice || "0", capacity: event.ticketCapacity, sold, remaining, available: remaining === null || remaining > 0 });
  });

  app.post("/api/events/:slug/ticket-checkout", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const event = await storage.getEventBySlug(orgId, req.params.slug);
      if (!event || !event.isTicketed) return res.status(404).json({ error: "Not a ticketed event" });
      const { buyerName, buyerEmail, quantity } = req.body;
      if (!buyerName || !buyerEmail || !quantity || quantity < 1 || quantity > 10) return res.status(400).json({ error: "Invalid purchase data" });
      const price = parseFloat(event.ticketPrice || "0");
      const amountCents = Math.round(price * quantity * 100);
      if (event.ticketCapacity) {
        const sold = await storage.getTicketsSoldForEvent(orgId, event.id);
        if (sold + quantity > event.ticketCapacity) return res.status(400).json({ error: "Not enough tickets available" });
      }
      const confirmationNumber = `TIX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const purchase = await storage.createTicketPurchase(orgId, { eventId: event.id, buyerName, buyerEmail, quantity, totalAmount: amountCents, confirmationNumber, status: "pending" });
      res.json({ checkoutUrl: "/payment-success?confirmation=" + confirmationNumber, purchaseId: purchase.id });
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
}
