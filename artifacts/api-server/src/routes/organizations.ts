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
} from "@workspace/db";
import { eq, desc, asc, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

// GET /api/organizations — get current user's org
router.get("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id))
    .orderBy(desc(isNotNull(organizationsTable.tier)), asc(organizationsTable.createdAt))
    .limit(1);

  res.json({
    organization: org
      ? {
          ...org,
          createdAt: org.createdAt.toISOString(),
        }
      : null,
  });
});

// POST /api/organizations — create or update current user's org
router.post("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, type, category } = req.body as { name?: string; type?: string; category?: string };

  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }

  const userId = req.user.id;

  // Check for existing org (prefer one with a tier set)
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId))
    .orderBy(desc(isNotNull(organizationsTable.tier)), asc(organizationsTable.createdAt))
    .limit(1);

  let org;

  if (existing) {
    [org] = await db
      .update(organizationsTable)
      .set({ name, type, category: category ?? null })
      .where(eq(organizationsTable.userId, userId))
      .returning();
  } else {
    // Generate a unique slug
    const baseSlug = generateSlug(name);
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

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
    organization: {
      ...org,
      createdAt: org.createdAt.toISOString(),
    },
  });
});

// PUT /api/organizations — update current user's org
router.put("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, type } = req.body as { name?: string; type?: string };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const userId = req.user.id;
  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, userId));

  if (!existing) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const updates: Record<string, unknown> = { name };
  if (type) updates.type = type;

  const [org] = await db
    .update(organizationsTable)
    .set(updates)
    .where(eq(organizationsTable.userId, userId))
    .returning();

  res.json({ organization: { ...org, createdAt: org.createdAt.toISOString() } });
});

// DELETE /api/organizations — permanently delete the organization and all its data
router.delete("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user.id;
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, userId));

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const orgId = org.id;

  // Board approval votes require the link IDs first (no orgId on votes table)
  const linkIds = await db
    .select({ id: boardApprovalLinksTable.id })
    .from(boardApprovalLinksTable)
    .where(eq(boardApprovalLinksTable.orgId, orgId));

  // Delete everything in dependency order (children before parents) in a transaction
  await db.transaction(async (tx) => {
    // Board approval votes (only linkId, no orgId) → then the links
    for (const { id: lid } of linkIds) {
      await tx.delete(boardApprovalVotesTable).where(eq(boardApprovalVotesTable.linkId, lid));
    }
    await tx.delete(boardApprovalLinksTable).where(eq(boardApprovalLinksTable.orgId, orgId));

    // Events and all child tables (all have orgId)
    await tx.delete(ticketSalesTable).where(eq(ticketSalesTable.orgId, orgId));
    await tx.delete(ticketTypesTable).where(eq(ticketTypesTable.orgId, orgId));
    await tx.delete(eventVendorsTable).where(eq(eventVendorsTable.orgId, orgId));
    await tx.delete(eventSponsorsTable).where(eq(eventSponsorsTable.orgId, orgId));
    await tx.delete(eventApprovalsTable).where(eq(eventApprovalsTable.orgId, orgId));
    await tx.delete(eventCommunicationsTable).where(eq(eventCommunicationsTable.orgId, orgId));
    await tx.delete(paymentsTable).where(eq(paymentsTable.orgId, orgId));
    await tx.delete(recurringEventTemplatesTable).where(eq(recurringEventTemplatesTable.orgId, orgId));
    await tx.delete(eventsTable).where(eq(eventsTable.orgId, orgId));

    // Social
    await tx.delete(socialPostsTable).where(eq(socialPostsTable.orgId, orgId));
    await tx.delete(automationRulesTable).where(eq(automationRulesTable.orgId, orgId));
    await tx.delete(contentStrategyTable).where(eq(contentStrategyTable.orgId, orgId));
    await tx.delete(oauthStatesTable).where(eq(oauthStatesTable.orgId, orgId));
    await tx.delete(socialAccountsTable).where(eq(socialAccountsTable.orgId, orgId));

    // Site content
    await tx.delete(siteNavItemsTable).where(eq(siteNavItemsTable.orgId, orgId));
    await tx.delete(siteBlocksTable).where(eq(siteBlocksTable.orgId, orgId));
    await tx.delete(sitePagesTable).where(eq(sitePagesTable.orgId, orgId));
    await tx.delete(sitesTable).where(eq(sitesTable.orgId, orgId));
    await tx.delete(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, orgId));
    await tx.delete(websiteSpecsTable).where(eq(websiteSpecsTable.orgId, orgId));

    // Studio, notifications, contacts, vendors, sponsors, domains
    await tx.delete(studioOutputsTable).where(eq(studioOutputsTable.orgId, orgId));
    await tx.delete(notificationsTable).where(eq(notificationsTable.orgId, orgId));
    await tx.delete(contactsTable).where(eq(contactsTable.orgId, orgId));
    await tx.delete(vendorsTable).where(eq(vendorsTable.orgId, orgId));
    await tx.delete(sponsorsTable).where(eq(sponsorsTable.orgId, orgId));
    await tx.delete(domainsTable).where(eq(domainsTable.orgId, orgId));

    // Subscriptions (linked by userId)
    await tx.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));

    // Finally, the organization itself
    await tx.delete(organizationsTable).where(eq(organizationsTable.userId, userId));
  });

  res.json({ success: true });
});

export default router;
