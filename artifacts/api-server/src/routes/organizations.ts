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

const router: IRouter = Router();

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

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
      res.json({
        organization: {
          ...overrideOrg,
          createdAt: overrideOrg.createdAt.toISOString(),
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

  res.json({
    organization: org
      ? { ...org, createdAt: org.createdAt.toISOString() }
      : null,
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
      const baseSlug = generateSlug(name);
      slug = baseSlug;
      let suffix = 2;
      while (true) {
        const [taken] = await db
          .select({ id: organizationsTable.id })
          .from(organizationsTable)
          .where(eq(organizationsTable.slug, slug))
          .limit(1);
        if (!taken) break;
        slug = `${baseSlug}-${suffix}`;
        suffix++;
      }
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

export default router;
