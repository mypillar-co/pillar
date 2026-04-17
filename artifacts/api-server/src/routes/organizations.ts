import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  organizationsTable,
  contactsTable,
  vendorsTable,
  sponsorsTable,
  eventsTable,
  ticketTypesTable,
  ticketSalesTable,
  eventVendorsTable,
  eventSponsorsTable,
  eventApprovalsTable,
  eventCommunicationsTable,
  recurringEventTemplatesTable,
  paymentsTable,
  boardApprovalLinksTable,
  boardApprovalVotesTable,
  notificationsTable,
  siteUpdateSchedulesTable,
  sitesTable,
  sitePagesTable,
  siteBlocksTable,
  siteNavItemsTable,
  socialAccountsTable,
  socialPostsTable,
  automationRulesTable,
  contentStrategyTable,
  oauthStatesTable,
  domainsTable,
  studioOutputsTable,
  websiteSpecsTable,
  subscriptionsTable,
  sitesTable,
} from "@workspace/db";
import { eq, desc, asc, isNotNull, and, sql } from "drizzle-orm";
import { syncOrgConfigPatchToPillar } from "../lib/pillarOrgSync.js";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage.js";

const objectStorageService = new ObjectStorageService();

interface UnsplashPhoto {
  id: string;
  urls: { small: string; regular: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
}

async function getCurrentOrgForUser(userId: string) {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId))
    .orderBy(desc(isNotNull(organizationsTable.tier)), asc(organizationsTable.createdAt))
    .limit(1);
  return org ?? null;
}

async function saveHeroImageUrl(orgSlug: string, imageUrl: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO cs_org_configs (org_id, hero_image_url)
    VALUES (${orgSlug}, ${imageUrl})
    ON CONFLICT (org_id) DO UPDATE SET hero_image_url = EXCLUDED.hero_image_url
  `);
}

const router: IRouter = Router();

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

// generateCleanOrgSlug now lives in ../lib/slugUtils so unit tests can
// import it without pulling in this whole route file.
import { generateCleanOrgSlug } from "../lib/slugUtils";

function isAdminUser(req: Request): boolean {
  if (!req.isAuthenticated()) return false;
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const adminIds = new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return (
    adminEmails.has((req.user.email ?? "").toLowerCase()) ||
    adminIds.has(req.user.id)
  );
}

// GET /api/organizations
router.get("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const devOrgId = req.headers["x-dev-org-id"] as string | undefined;
  if (devOrgId && isAdminUser(req)) {
    const [overrideOrg] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, devOrgId))
      .limit(1);
    if (overrideOrg) {
      const overrideExtra = await db.execute(
        sql`SELECT community_site_url FROM organizations WHERE id = ${overrideOrg.id} LIMIT 1`
      );
      const overrideCommunitySiteUrl = (overrideExtra.rows[0] as { community_site_url?: string | null } | undefined)?.community_site_url ?? null;
      res.json({
        organization: {
          ...overrideOrg,
          createdAt: overrideOrg.createdAt.toISOString(),
          communitySiteUrl: overrideCommunitySiteUrl,
        },
      });
      return;
    }
  }

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id))
    .orderBy(
      desc(isNotNull(organizationsTable.tier)),
      asc(organizationsTable.createdAt),
    )
    .limit(1);

  if (!org) {
    res.json({ organization: null });
    return;
  }

  const extraResult = await db.execute(
    sql`SELECT community_site_url FROM organizations WHERE id = ${org.id} LIMIT 1`
  );
  const communitySiteUrl = (extraResult.rows[0] as { community_site_url?: string | null } | undefined)?.community_site_url ?? null;

  res.json({
    organization: {
      ...org,
      createdAt: org.createdAt.toISOString(),
      communitySiteUrl,
    },
  });
});

// GET /api/organizations/check-slug — check if a slug is available
router.get("/organizations/check-slug", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const slug = (req.query.slug as string ?? "").toLowerCase().trim();
  if (!slug) {
    res.status(400).json({ error: "slug is required" });
    return;
  }

  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
  if (!SLUG_RE.test(slug)) {
    res.json({ available: false, reason: "invalid_format" });
    return;
  }

  const RESERVED = new Set(["api", "www", "admin", "pillar", "app", "mail", "smtp", "ftp", "cdn", "static", "assets", "dashboard", "login", "register", "onboard", "sites"]);
  if (RESERVED.has(slug)) {
    res.json({ available: false, reason: "reserved" });
    return;
  }

  const [taken] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug))
    .limit(1);

  res.json({ available: !taken });
});

// POST /api/organizations
router.post("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, type, category, slug: requestedSlug } = req.body as {
    name?: string;
    type?: string;
    category?: string;
    slug?: string;
  };
  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }

  const userId = req.user.id;
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId))
    .orderBy(
      desc(isNotNull(organizationsTable.tier)),
      asc(organizationsTable.createdAt),
    )
    .limit(1);

  let org;
  if (existing) {
    [org] = await db
      .update(organizationsTable)
      .set({ name, type, category: category ?? null })
      .where(eq(organizationsTable.userId, userId))
      .returning();
  } else {
    let slug: string;

    if (requestedSlug) {
      const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
      if (!SLUG_RE.test(requestedSlug)) {
        res.status(400).json({ error: "Invalid slug format" });
        return;
      }
      const [taken] = await db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, requestedSlug))
        .limit(1);
      if (taken) {
        res.status(409).json({ error: "That URL is already taken. Please choose a different one." });
        return;
      }
      slug = requestedSlug;
    } else {
      slug = await generateCleanOrgSlug(name);
    }

    [org] = await db
      .insert(organizationsTable)
      .values({
        id: crypto.randomUUID(),
        userId,
        name,
        type,
        category: category ?? null,
        slug,
      })
      .returning();
  }

  res.json({
    organization: { ...org, createdAt: org.createdAt.toISOString() },
  });
});

// PUT /api/organizations — update name, type, slug, and branding fields
router.put("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    name,
    type,
    slug,
    primaryColor,
    accentColor,
    tagline,
    mission,
    logoUrl,
    contactEmail,
    contactPhone,
    contactAddress,
    meetingDay,
    meetingTime,
    meetingLocation,
  } = req.body as Record<string, string | undefined>;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const userId = req.user.id;
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (!existing) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  // Validate slug if provided and changed
  if (slug && slug !== existing.slug) {
    if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(slug)) {
      res
        .status(400)
        .json({
          error:
            "URL must be 3-50 characters, lowercase letters, numbers, and hyphens only",
        });
      return;
    }
    const [taken] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(
        and(
          eq(organizationsTable.slug, slug),
          sql`${organizationsTable.id} != ${existing.id}`,
        ),
      )
      .limit(1);
    if (taken) {
      res
        .status(409)
        .json({ error: "That URL is already taken. Please choose another." });
      return;
    }
  }

  const updates: Record<string, unknown> = { name };
  if (type) updates.type = type;
  if (slug && slug !== existing.slug) updates.slug = slug;

  const [org] = await db
    .update(organizationsTable)
    .set(updates)
    .where(eq(organizationsTable.userId, userId))
    .returning();

  // If slug changed, update community_site_url and all cs_* references
  const slugChanged = !!(slug && slug !== existing.slug);
  if (slugChanged) {
    const newUrl = `https://${slug}.mypillar.co`;
    await db.execute(
      sql`UPDATE organizations SET community_site_url = ${newUrl} WHERE id = ${existing.id}`,
    );
    await db.execute(
      sql`UPDATE cs_org_configs SET org_id = ${slug} WHERE org_id = ${existing.slug}`,
    );
    await db.execute(
      sql`UPDATE cs_events SET org_id = ${slug} WHERE org_id = ${existing.slug}`,
    );
    await db.execute(
      sql`UPDATE cs_admin_users SET org_id = ${slug} WHERE org_id = ${existing.slug}`,
    );
    await db.execute(
      sql`UPDATE sites SET org_slug = ${slug} WHERE org_slug = ${existing.slug}`,
    );
  }

  // Sync branding to live community tenant if published
  const effectiveSlug = slugChanged ? slug! : org.slug;
  if (effectiveSlug) {
    const [publishedSite] = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(
        and(
          eq(sitesTable.orgId, existing.id),
          eq(sitesTable.status, "published"),
        ),
      )
      .limit(1);
    if (publishedSite) {
      const patch: Record<string, string | undefined> = { orgName: name };
      if (primaryColor) patch.primaryColor = primaryColor;
      if (accentColor) patch.accentColor = accentColor;
      if (tagline) patch.tagline = tagline;
      if (mission) patch.mission = mission;
      if (logoUrl) patch.logoUrl = logoUrl;
      if (contactEmail) patch.contactEmail = contactEmail;
      if (contactPhone) patch.contactPhone = contactPhone;
      if (contactAddress) patch.contactAddress = contactAddress;
      if (meetingDay) patch.meetingDay = meetingDay;
      if (meetingTime) patch.meetingTime = meetingTime;
      if (meetingLocation) patch.meetingLocation = meetingLocation;
      try {
        await syncOrgConfigPatchToPillar({ orgId: effectiveSlug, ...patch });
      } catch (syncErr: any) {
        console.error("[organizations] sync failed", syncErr);
        return res
          .status(502)
          .json({
            error: "Settings saved but failed to sync to live site",
            localOnly: true,
          });
      }
    }
  }

  res.json({
    organization: { ...org, createdAt: org.createdAt.toISOString() },
  });
});

// DELETE /api/organizations
router.delete("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user.id;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const orgId = org.id;
  const linkIds = await db
    .select({ id: boardApprovalLinksTable.id })
    .from(boardApprovalLinksTable)
    .where(eq(boardApprovalLinksTable.orgId, orgId));

  await db.transaction(async (tx) => {
    for (const { id: lid } of linkIds) {
      await tx
        .delete(boardApprovalVotesTable)
        .where(eq(boardApprovalVotesTable.linkId, lid));
    }
    await tx
      .delete(boardApprovalLinksTable)
      .where(eq(boardApprovalLinksTable.orgId, orgId));
    await tx.delete(ticketSalesTable).where(eq(ticketSalesTable.orgId, orgId));
    await tx.delete(ticketTypesTable).where(eq(ticketTypesTable.orgId, orgId));
    await tx
      .delete(eventVendorsTable)
      .where(eq(eventVendorsTable.orgId, orgId));
    await tx
      .delete(eventSponsorsTable)
      .where(eq(eventSponsorsTable.orgId, orgId));
    await tx
      .delete(eventApprovalsTable)
      .where(eq(eventApprovalsTable.orgId, orgId));
    await tx
      .delete(eventCommunicationsTable)
      .where(eq(eventCommunicationsTable.orgId, orgId));
    await tx.delete(paymentsTable).where(eq(paymentsTable.orgId, orgId));
    await tx
      .delete(recurringEventTemplatesTable)
      .where(eq(recurringEventTemplatesTable.orgId, orgId));
    await tx.delete(eventsTable).where(eq(eventsTable.orgId, orgId));
    await tx.delete(socialPostsTable).where(eq(socialPostsTable.orgId, orgId));
    await tx
      .delete(automationRulesTable)
      .where(eq(automationRulesTable.orgId, orgId));
    await tx
      .delete(contentStrategyTable)
      .where(eq(contentStrategyTable.orgId, orgId));
    await tx.delete(oauthStatesTable).where(eq(oauthStatesTable.orgId, orgId));
    await tx
      .delete(socialAccountsTable)
      .where(eq(socialAccountsTable.orgId, orgId));
    await tx
      .delete(siteNavItemsTable)
      .where(eq(siteNavItemsTable.orgId, orgId));
    await tx.delete(siteBlocksTable).where(eq(siteBlocksTable.orgId, orgId));
    await tx.delete(sitePagesTable).where(eq(sitePagesTable.orgId, orgId));
    await tx.delete(sitesTable).where(eq(sitesTable.orgId, orgId));
    await tx
      .delete(siteUpdateSchedulesTable)
      .where(eq(siteUpdateSchedulesTable.orgId, orgId));
    await tx
      .delete(websiteSpecsTable)
      .where(eq(websiteSpecsTable.orgId, orgId));
    await tx
      .delete(studioOutputsTable)
      .where(eq(studioOutputsTable.orgId, orgId));
    await tx
      .delete(notificationsTable)
      .where(eq(notificationsTable.orgId, orgId));
    await tx.delete(contactsTable).where(eq(contactsTable.orgId, orgId));
    await tx.delete(vendorsTable).where(eq(vendorsTable.orgId, orgId));
    await tx.delete(sponsorsTable).where(eq(sponsorsTable.orgId, orgId));
    await tx.delete(domainsTable).where(eq(domainsTable.orgId, orgId));
    await tx
      .delete(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    await tx
      .delete(organizationsTable)
      .where(eq(organizationsTable.userId, userId));
  });

  res.json({ success: true });
});

// ── Hero image routes ─────────────────────────────────────────────────────────

// Curated civic/community Unsplash photo IDs — pre-approved, accessible without an API key
const HERO_PHOTO_LIBRARY = [
  { id: "1522202176988-66273c2fd55f", description: "People gathered around a community meeting table" },
  { id: "1517048676732-d65bc937f952", description: "Diverse team collaborating and smiling" },
  { id: "1454165804606-c3d57bc86b40", description: "Professional group discussion at a bright table" },
  { id: "1557804506-669a67965ba0", description: "Engaged professionals in a bright office meeting" },
  { id: "1491438590914-bc09fcaaf77a", description: "Energetic crowd at an outdoor community event" },
  { id: "1497366216548-37526070297c", description: "Networking event with engaged professionals" },
  { id: "1509099836639-18ba1795216d", description: "Community gathering — people connecting outdoors" },
  { id: "1543269865-cbf427effbad", description: "People volunteering together in the community" },
  { id: "1521791136064-7986c2920216", description: "Civic leaders addressing a community audience" },
  { id: "1573496359142-b8d87734a5a2", description: "Collaborative team session with whiteboards" },
  { id: "1552664730-d307ca884978", description: "Diverse group united around a common purpose" },
  { id: "1523240795612-9a054b0db644", description: "Vibrant town square with community life" },
];

// GET /api/organizations/hero-image/suggest
// Uses AI to rank the curated photo library for this org, then returns options.
// No Unsplash API key required.
router.get("/organizations/hero-image/suggest", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      throw new Error("AI service not configured");
    }
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    // Library photos are hardcoded, curated Unsplash CDN URLs — no runtime
    // verification needed. Outbound HEAD checks were unreliable in this
    // environment and caused the route to return zero photos.
    const livePhotos = HERO_PHOTO_LIBRARY;

    // Step 2: AI ranks only the live photos — guarantees top-6 are all reachable
    const libraryJson = livePhotos.map((p, i) => `${i}: ${p.description}`).join("\n");
    const prompt = `You are picking hero background photos for a community website. The organization is "${org.name}" (type: ${org.type || "civic"})${org.category ? `, tagline: "${org.category}"` : ""}.\n\nAvailable photos (by index):\n${libraryJson}\n\nReturn exactly ${Math.min(6, livePhotos.length)} indices (0–${livePhotos.length - 1}), comma-separated, ordered best-to-worst fit. Return ONLY numbers, e.g.: 2,0,5,3,7,1`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const aiIndices: number[] = raw
      .split(",")
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n < livePhotos.length);

    // Deduplicate AI picks and pad with remaining live photos
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const idx of aiIndices) { if (!seen.has(idx)) { seen.add(idx); ordered.push(idx); } }
    for (let i = 0; i < livePhotos.length && ordered.length < 6; i++) {
      if (!seen.has(i)) { seen.add(i); ordered.push(i); }
    }

    const photos = ordered.slice(0, 6).map(idx => {
      const p = livePhotos[idx];
      return {
        id: p.id,
        thumb: `https://images.unsplash.com/photo-${p.id}?auto=format&fit=crop&w=400&q=70`,
        full:  `https://images.unsplash.com/photo-${p.id}?auto=format&fit=crop&w=1920&q=80`,
        description: p.description,
        credit: "Unsplash",
      };
    });

    res.json({ query: `${org.type || "community"} background`, photos });
  } catch (err) {
    console.error("Hero image suggest error:", err);
    res.status(500).json({ error: "Failed to generate image suggestions" });
  }
});

// POST /api/organizations/hero-image/upload
// Accepts a raw image body (Content-Type: image/*) and saves it to object storage.
router.post("/organizations/hero-image/upload", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) {
    res.status(400).json({ error: "Image content-type required" });
    return;
  }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
    const imageBuffer = Buffer.concat(chunks);
    if (imageBuffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const privateDir = objectStorageService.getPrivateObjectDir().replace(/\/$/, "");
    const objectId = randomUUID();
    const objectPath = `${privateDir}/uploads/${objectId}.${ext}`;
    const parts = objectPath.startsWith("/") ? objectPath.slice(1).split("/") : objectPath.split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).save(imageBuffer, { contentType, resumable: false });

    const heroImageUrl = `/api/storage/objects/uploads/${objectId}.${ext}`;
    await saveHeroImageUrl(org.slug, heroImageUrl);

    res.json({ heroImageUrl });
  } catch (err) {
    console.error("Hero image upload error:", err);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// POST /api/organizations/hero-image/apply-unsplash
// Downloads chosen photo into object storage and saves the URL to cs_org_configs.
// Accepts: { photoUrl, credit } — photoUrl is the full-resolution image URL.
router.post("/organizations/hero-image/apply-unsplash", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Accept both old (previewUrl) and new (photoUrl) key names for compatibility
  const { photoUrl, previewUrl } = req.body as { photoUrl?: string; previewUrl?: string; credit?: string };
  const imageSourceUrl = photoUrl ?? previewUrl;
  if (!imageSourceUrl) { res.status(400).json({ error: "photoUrl is required" }); return; }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    // Download the image with a browser-like User-Agent (some CDNs require it)
    const imageRes = await fetch(imageSourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Pillar/1.0)" },
      signal: AbortSignal.timeout(15000),
    });

    if (!imageRes.ok) {
      // If download fails, persist the external URL directly as a fallback
      console.warn(`Hero image download returned ${imageRes.status} — saving URL directly`);
      await saveHeroImageUrl(org.slug, imageSourceUrl);
      res.json({ heroImageUrl: imageSourceUrl });
      return;
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";

    // Upload to object storage
    const privateDir = objectStorageService.getPrivateObjectDir().replace(/\/$/, "");
    const objectId = randomUUID();
    const objectPath = `${privateDir}/uploads/${objectId}.${ext}`;
    const parts = objectPath.startsWith("/") ? objectPath.slice(1).split("/") : objectPath.split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).save(imageBuffer, { contentType, resumable: false });

    const heroImageUrl = `/api/storage/objects/uploads/${objectId}.${ext}`;
    await saveHeroImageUrl(org.slug, heroImageUrl);

    res.json({ heroImageUrl });
  } catch (err) {
    console.error("Hero image apply error:", err);
    // Last-resort fallback: save the URL directly so the user isn't blocked
    try {
      await saveHeroImageUrl(org.slug, imageSourceUrl);
      res.json({ heroImageUrl: imageSourceUrl });
    } catch {
      res.status(500).json({ error: "Failed to save hero image" });
    }
  }
});

// POST /api/organizations/hero-image
// Saves (or clears) the hero image URL. Accepts { heroImageUrl } — null to remove.
router.post("/organizations/hero-image", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Accept both heroImageUrl (frontend) and imageUrl (legacy) keys
  const body = req.body as { heroImageUrl?: string | null; imageUrl?: string | null };
  const heroImageUrl = "heroImageUrl" in body ? body.heroImageUrl : body.imageUrl;

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    // Save null as empty string to clear; the DB stores it and CP treats "" as no image
    await db.execute(sql`
      INSERT INTO cs_org_configs (org_id, hero_image_url)
      VALUES (${org.slug}, ${heroImageUrl ?? null})
      ON CONFLICT (org_id) DO UPDATE SET hero_image_url = EXCLUDED.hero_image_url
    `);
    res.json({ heroImageUrl: heroImageUrl ?? null });
  } catch (err) {
    console.error("Hero image save error:", err);
    res.status(500).json({ error: "Failed to save hero image" });
  }
});

export default router;
