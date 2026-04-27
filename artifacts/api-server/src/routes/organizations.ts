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

async function saveHeroImageUrl(
  org: { slug: string; name: string; type?: string | null },
  imageUrl: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO cs_org_configs (org_id, org_name, org_type, hero_image_url)
    VALUES (${org.slug}, ${org.name}, ${org.type ?? "community"}, ${imageUrl})
    ON CONFLICT (org_id) DO UPDATE SET
      hero_image_url = EXCLUDED.hero_image_url,
      org_name = EXCLUDED.org_name,
      org_type = EXCLUDED.org_type,
      updated_at = NOW()
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

type HeroPhotoCategory =
  | "masonic/lodge/tradition"
  | "civic leadership/community"
  | "rotary/chamber networking"
  | "volunteers/nonprofit"
  | "outdoor town events/festivals"
  | "patriotic/community landmarks"
  | "elegant fellowship/interior gatherings";

type HeroPhotoLibraryItem = {
  id: string;
  category: HeroPhotoCategory;
  description: string;
  tags: string[];
  businessOnly?: boolean;
};

// Curated civic/community Unsplash photo IDs — pre-approved, accessible without an API key.
// Keep metadata internal; the endpoint response shape remains unchanged.
const HERO_PHOTO_GROUPS: Record<HeroPhotoCategory, HeroPhotoLibraryItem[]> = {
  "masonic/lodge/tradition": [
    { id: "1518895949257-7621c3c786d7", category: "masonic/lodge/tradition", description: "Historic stone architecture with a formal, traditional civic feel", tags: ["historic", "stone", "tradition", "lodge", "heritage"] },
    { id: "1518005020951-eccb494ad742", category: "masonic/lodge/tradition", description: "Grand interior hall with warm light and ceremonial atmosphere", tags: ["interior", "hall", "tradition", "formal", "heritage"] },
    { id: "1494526585095-c41746248156", category: "masonic/lodge/tradition", description: "Elegant architectural detail suggesting history and institution", tags: ["architecture", "detail", "classic", "institution"] },
    { id: "1500530855697-b586d89ba3ee", category: "masonic/lodge/tradition", description: "Distinguished public building exterior with timeless civic presence", tags: ["building", "civic", "formal", "heritage"] },
    { id: "1511818966892-d7d671e672a2", category: "masonic/lodge/tradition", description: "Warm wood interior suited to a lodge or long-standing fellowship", tags: ["wood", "interior", "lodge", "warm", "traditional"] },
    { id: "1516455590571-18256e5bb9ff", category: "masonic/lodge/tradition", description: "Classic columns and formal architecture for heritage organizations", tags: ["columns", "classic", "architecture", "tradition"] },
  ],
  "civic leadership/community": [
    { id: "1521791136064-7986c2920216", category: "civic leadership/community", description: "Civic leaders addressing a community audience", tags: ["leadership", "audience", "civic", "public"] },
    { id: "1552664730-d307ca884978", category: "civic leadership/community", description: "Diverse group united around a common purpose", tags: ["community", "purpose", "people", "team"] },
    { id: "1523240795612-9a054b0db644", category: "civic leadership/community", description: "Vibrant town square with everyday community life", tags: ["town", "square", "community", "local"] },
    { id: "1517048676732-d65bc937f952", category: "civic leadership/community", description: "Collaborative community group in an active discussion", tags: ["discussion", "community", "collaboration"] },
    { id: "1522202176988-66273c2fd55f", category: "civic leadership/community", description: "People gathered around a community planning table", tags: ["planning", "meeting", "community", "table"] },
    { id: "1529156069898-49953e39b3ac", category: "civic leadership/community", description: "Speaker presenting to an engaged local audience", tags: ["speaker", "audience", "presentation", "leadership"] },
    { id: "1517245386807-bb43f82c33c4", category: "civic leadership/community", description: "Workshop-style civic planning session with notes and discussion", tags: ["workshop", "planning", "notes", "civic"] },
  ],
  "rotary/chamber networking": [
    { id: "1497366216548-37526070297c", category: "rotary/chamber networking", description: "Networking event with engaged professionals", tags: ["networking", "professionals", "chamber", "event"] },
    { id: "1454165804606-c3d57bc86b40", category: "rotary/chamber networking", description: "Professional group discussion at a bright table", tags: ["business", "professional", "meeting", "table"], businessOnly: true },
    { id: "1557804506-669a67965ba0", category: "rotary/chamber networking", description: "Engaged professionals in a bright office meeting", tags: ["office", "business", "professional", "meeting"], businessOnly: true },
    { id: "1573496359142-b8d87734a5a2", category: "rotary/chamber networking", description: "Collaborative team session with whiteboards", tags: ["whiteboard", "team", "strategy", "professional"], businessOnly: true },
    { id: "1504384308090-c894fdcc538d", category: "rotary/chamber networking", description: "Business and civic leaders gathered for a focused discussion", tags: ["business", "leaders", "discussion", "professional"], businessOnly: true },
    { id: "1515169067865-5387ec356754", category: "rotary/chamber networking", description: "Handshake and introductions at a professional gathering", tags: ["handshake", "networking", "chamber", "professional"] },
    { id: "1527529482837-4698179dc6ce", category: "rotary/chamber networking", description: "Close-up of people connecting in a business networking setting", tags: ["networking", "connection", "business", "people"] },
  ],
  "volunteers/nonprofit": [
    { id: "1543269865-cbf427effbad", category: "volunteers/nonprofit", description: "People volunteering together in the community", tags: ["volunteer", "service", "community", "nonprofit"] },
    { id: "1531206715517-5c0ba140b2b8", category: "volunteers/nonprofit", description: "Volunteer hands joined together around a shared mission", tags: ["volunteer", "hands", "mission", "service"] },
    { id: "1488521787991-ed7bbaae773c", category: "volunteers/nonprofit", description: "Community service and food support in action", tags: ["service", "food", "nonprofit", "helping"] },
    { id: "1521737604893-d14cc237f11d", category: "volunteers/nonprofit", description: "Outdoor volunteers working side by side", tags: ["volunteer", "outdoor", "service", "team"] },
    { id: "1559027615-cd4628902d4a", category: "volunteers/nonprofit", description: "Hands-on service project with people working together", tags: ["service", "project", "hands", "community"] },
    { id: "1469571486292-0ba58a3f068b", category: "volunteers/nonprofit", description: "Community service moment with a hopeful, human focus", tags: ["service", "human", "helping", "community"] },
    { id: "1556761175-b413da4baf72", category: "volunteers/nonprofit", description: "Volunteers sharing supplies and support", tags: ["volunteer", "supplies", "support", "nonprofit"] },
  ],
  "outdoor town events/festivals": [
    { id: "1491438590914-bc09fcaaf77a", category: "outdoor town events/festivals", description: "Energetic crowd at an outdoor community event", tags: ["festival", "crowd", "outdoor", "event"] },
    { id: "1509099836639-18ba1795216d", category: "outdoor town events/festivals", description: "Community gathering with people connecting outdoors", tags: ["outdoor", "gathering", "community", "people"] },
    { id: "1472653431158-6364773b2a56", category: "outdoor town events/festivals", description: "Lively street event with local neighborhood energy", tags: ["street", "event", "festival", "local"] },
    { id: "1505373877841-8d25f7d46678", category: "outdoor town events/festivals", description: "Outdoor market or fair with a welcoming town atmosphere", tags: ["market", "fair", "outdoor", "town"] },
    { id: "1517457373958-b7bdd4587205", category: "outdoor town events/festivals", description: "Public celebration with lights, people, and local activity", tags: ["celebration", "lights", "festival", "public"] },
    { id: "1500534314209-a25ddb2bd429", category: "outdoor town events/festivals", description: "Community event scene with open space and public activity", tags: ["event", "public", "outdoor", "community"] },
    { id: "1528605248644-14dd04022da1", category: "outdoor town events/festivals", description: "People enjoying an outdoor gathering in warm natural light", tags: ["outdoor", "gathering", "warm", "people"] },
  ],
  "patriotic/community landmarks": [
    { id: "1523731407965-2430cd12f5e4", category: "patriotic/community landmarks", description: "Main street architecture and local landmark character", tags: ["main street", "landmark", "town", "architecture"] },
    { id: "1505238680356-667803448bb6", category: "patriotic/community landmarks", description: "Public square and civic landmark setting", tags: ["public", "square", "landmark", "civic"] },
    { id: "1477959858617-67f85cf4f1df", category: "patriotic/community landmarks", description: "City skyline and local pride atmosphere", tags: ["skyline", "city", "pride", "local"] },
    { id: "1494522855154-9297ac14b55f", category: "patriotic/community landmarks", description: "Iconic building exterior for a civic-minded organization", tags: ["building", "landmark", "civic", "iconic"] },
    { id: "1493246507139-91e8fad9978e", category: "patriotic/community landmarks", description: "Formal public interior with institutional gravitas", tags: ["formal", "interior", "institution", "public"] },
    { id: "1519302959554-a75be0afc82a", category: "patriotic/community landmarks", description: "Historic architectural detail for legacy and tradition", tags: ["historic", "architecture", "legacy", "tradition"] },
  ],
  "elegant fellowship/interior gatherings": [
    { id: "1511795409834-ef04bbd61622", category: "elegant fellowship/interior gatherings", description: "Warm dinner table atmosphere for fellowship and connection", tags: ["dinner", "fellowship", "warm", "gathering"] },
    { id: "1414235077428-338989a2e8c0", category: "elegant fellowship/interior gatherings", description: "Elegant banquet setting suited to ceremonies and galas", tags: ["banquet", "elegant", "ceremony", "gala"] },
    { id: "1519671482749-fd09be7ccebf", category: "elegant fellowship/interior gatherings", description: "Refined table setting with a polished event feel", tags: ["table", "event", "polished", "fellowship"] },
    { id: "1519671282429-b44660ead0a7", category: "elegant fellowship/interior gatherings", description: "Friendly gathering with warm interpersonal energy", tags: ["gathering", "people", "warm", "fellowship"] },
    { id: "1540575467063-178a50c2df87", category: "elegant fellowship/interior gatherings", description: "Roundtable conversation in a welcoming indoor setting", tags: ["roundtable", "conversation", "indoor", "welcoming"] },
    { id: "1503428593586-e225b39bddfe", category: "elegant fellowship/interior gatherings", description: "Close community conversation around a shared table", tags: ["table", "community", "conversation", "fellowship"] },
  ],
};

const HERO_PHOTO_LIBRARY = Object.values(HERO_PHOTO_GROUPS).flat();

function scoreHeroPhotoForOrg(photo: HeroPhotoLibraryItem, org: { name: string; type?: string | null; category?: string | null }): number {
  const cues = `${org.name} ${org.type ?? ""} ${org.category ?? ""}`.toLowerCase();
  let score = 0;

  if (/(mason|masonic|lodge|temple|shrine|fraternal|order|chapter)/.test(cues)) {
    if (photo.category === "masonic/lodge/tradition") score += 10;
    if (photo.category === "elegant fellowship/interior gatherings") score += 5;
  }
  if (/(rotary|kiwanis|lions|optimist|club|fellowship)/.test(cues)) {
    if (photo.category === "elegant fellowship/interior gatherings") score += 8;
    if (photo.category === "volunteers/nonprofit") score += 6;
    if (photo.category === "civic leadership/community") score += 4;
  }
  if (/(chamber|business|commerce|professional|merchant|downtown|main street|association)/.test(cues)) {
    if (photo.category === "rotary/chamber networking") score += 9;
    if (photo.category === "civic leadership/community") score += 4;
  }
  if (/(volunteer|nonprofit|foundation|service|charity|pta|pto|youth|arts|council)/.test(cues)) {
    if (photo.category === "volunteers/nonprofit") score += 10;
    if (photo.category === "outdoor town events/festivals") score += 5;
  }
  if (/(festival|fair|market|event|parade|community day|celebration)/.test(cues)) {
    if (photo.category === "outdoor town events/festivals") score += 10;
  }
  if (/(vfw|american legion|veteran|patriot|memorial|historical|heritage)/.test(cues)) {
    if (photo.category === "patriotic/community landmarks") score += 10;
    if (photo.category === "masonic/lodge/tradition") score += 4;
  }
  if (photo.businessOnly && !/(chamber|business|commerce|professional|merchant|network|networking)/.test(cues)) {
    score -= 8;
  }

  return score;
}

// GET /api/organizations/hero-image/suggest
// Uses AI to rank the curated photo library for this org, then returns options.
// No Unsplash API key required.
router.get("/organizations/hero-image/suggest", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    // Library photos are hardcoded, curated Unsplash CDN URLs — no runtime
    // verification needed. Outbound HEAD checks were unreliable in this
    // environment and caused the route to return zero photos.
    const livePhotos = HERO_PHOTO_LIBRARY;

    // AI evaluates ALL photos and ranks them best-to-worst for this org.
    // All indices are returned so the UI can display every available option.
    const libraryJson = livePhotos
      .map((p, i) => `${i}: [${p.category}] ${p.description}; tags: ${p.tags.join(", ")}`)
      .join("\n");
    const orgCues = [
      `name: ${org.name}`,
      `type: ${org.type || "unknown"}`,
      `category: ${org.category || "unknown"}`,
    ].join("\n");
    const prompt = `You are selecting website hero background photos for a local organization.

Organization cues:
${orgCues}

Choose images that visibly match the organization's identity:
- Masonic, lodge, fraternal, shrine, temple, order, or chapter cues should strongly prefer tradition, historic architecture, formal interiors, or elegant fellowship.
- Rotary, Lions, Kiwanis, service club, nonprofit, PTA/PTO, foundation, and volunteer cues should prefer community service, fellowship, civic leadership, and warm gatherings.
- Chamber, commerce, business, professional, merchant, downtown, and Main Street cues can use networking or professional meeting photos.
- Festivals, markets, parades, fairs, and community events should prefer outdoor town event photos.
- Veteran, patriotic, memorial, historic, heritage, and civic-pride cues should prefer landmarks and formal civic imagery.
- Bias AGAINST generic office meeting photos unless the org is clearly business/professional/chamber/commerce.
- Avoid bland corporate stock imagery when a more specific community, tradition, volunteer, landmark, or fellowship image fits.

Available photos (by index):
${libraryJson}

Return ALL ${livePhotos.length} indices (0-${livePhotos.length - 1}), comma-separated, ordered best-to-worst fit. Include every index exactly once. Return ONLY numbers.`;

    let raw = "";
    // Try Replit OpenAI integration
    if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
      try {
        const openaiForSuggest = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        const completion = await openaiForSuggest.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 260,
        });
        raw = completion.choices[0]?.message?.content?.trim() ?? "";
      } catch (_openaiErr) {
        // fall through to Anthropic
      }
    }
    // Anthropic fallback
    if (!raw && process.env.ANTHROPIC_API_KEY) {
      try {
        const { default: AnthropicSdk } = await import("@anthropic-ai/sdk");
        const anthropicForSuggest = new AnthropicSdk({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await anthropicForSuggest.messages.create({
          model: "claude-3-5-haiku-latest",
          max_tokens: 260,
          messages: [{ role: "user", content: prompt }],
        });
        const tb = msg.content.find((b) => b.type === "text");
        raw = tb?.type === "text" ? (tb.text?.trim() ?? "") : "";
      } catch (_anthropicErr) {
        // fall through to natural order
      }
    }
    const aiIndices: number[] = raw
      .split(",")
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n < livePhotos.length);

    const fallbackOrder = livePhotos
      .map((_, index) => index)
      .sort((a, b) => scoreHeroPhotoForOrg(livePhotos[b], org) - scoreHeroPhotoForOrg(livePhotos[a], org));

    // Deduplicate AI ranking and append any photos the AI omitted at the end.
    // Fallback order is semantic, not natural array order, so no-AI local dev
    // still avoids generic office photos for service/lodge/community orgs.
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const idx of aiIndices) { if (!seen.has(idx)) { seen.add(idx); ordered.push(idx); } }
    for (const idx of fallbackOrder) {
      if (!seen.has(idx)) { seen.add(idx); ordered.push(idx); }
    }

    // Return ALL photos ranked — no artificial cap
    const photos = ordered.map(idx => {
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
    await saveHeroImageUrl(org, heroImageUrl);

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
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { photoUrl, previewUrl } = req.body as {
    photoUrl?: string;
    previewUrl?: string;
    credit?: string;
  };

  const imageSourceUrl = photoUrl ?? previewUrl;

  if (!imageSourceUrl) {
    res.status(400).json({ error: "photoUrl is required" });
    return;
  }

  const org = await getCurrentOrgForUser(req.user.id);

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  try {
    // For AI-picked Unsplash images, save the external URL directly.
    // This avoids local object-storage failures and makes the manual UI reliable.
    await saveHeroImageUrl(org, imageSourceUrl);

    res.json({ heroImageUrl: imageSourceUrl });
    return;
  } catch (err) {
    console.error("Hero image direct save error:", err);
    res.status(500).json({ error: "Failed to save hero image" });
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
    await saveHeroImageUrl(org, heroImageUrl ?? null);
    res.json({ heroImageUrl: heroImageUrl ?? null });
  } catch (err) {
    console.error("Hero image save error:", err);
    res.status(500).json({ error: "Failed to save hero image" });
  }
});

export default router;
