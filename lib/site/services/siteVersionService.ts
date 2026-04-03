import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { siteVersionsTable } from "@workspace/db";
import { sitesTable } from "@workspace/db";
import { siteThemesTable } from "@workspace/db";
import { sitePagesTable } from "@workspace/db";
import { siteBlocksTable } from "@workspace/db";
import { siteNavItemsTable } from "@workspace/db";
import { logInfo, logError } from "./siteLogService.js";
import type { SiteVersion } from "@workspace/db";

const SERVICE = "siteVersionService";

export async function createVersion(
  orgId: string,
  siteId: string,
  compiledHtml: string,
  publishedBy?: string,
): Promise<SiteVersion> {
  const existing = await db
    .select()
    .from(siteVersionsTable)
    .where(and(
      eq(siteVersionsTable.siteId, siteId),
      eq(siteVersionsTable.orgId, orgId),
    ))
    .orderBy(desc(siteVersionsTable.versionNumber))
    .limit(1);

  const nextVersion = (existing[0]?.versionNumber ?? 0) + 1;

  const [theme] = await db
    .select()
    .from(siteThemesTable)
    .where(eq(siteThemesTable.siteId, siteId))
    .limit(1)
    .catch(() => []);

  const pages = await db
    .select()
    .from(sitePagesTable)
    .where(and(eq(sitePagesTable.siteId, siteId), eq(sitePagesTable.orgId, orgId)))
    .catch(() => []);

  const blocks = await db
    .select()
    .from(siteBlocksTable)
    .where(and(eq(siteBlocksTable.siteId, siteId), eq(siteBlocksTable.orgId, orgId)))
    .catch(() => []);

  const navItems = await db
    .select()
    .from(siteNavItemsTable)
    .where(and(eq(siteNavItemsTable.siteId, siteId), eq(siteNavItemsTable.orgId, orgId)))
    .catch(() => []);

  const specJson = {
    pages: pages.map(p => ({ id: p.id, slug: p.slug, title: p.title, pageType: p.pageType, isHomepage: p.isHomepage })),
    blocks: blocks.map(b => ({ id: b.id, pageId: b.pageId, blockType: b.blockType, variantKey: b.variantKey, contentJson: b.contentJson, sortOrder: b.sortOrder })),
    navItems: navItems.map(n => ({ id: n.id, label: n.label, pageId: n.pageId, sortOrder: n.sortOrder })),
  };

  const themeJson = theme ? {
    presetKey: theme.themePresetKey,
    colorPrimary: theme.colorPrimary,
    colorSecondary: theme.colorSecondary,
    colorAccent: theme.colorAccent,
    colorSurface: theme.colorSurface,
    colorText: theme.colorText,
    fontHeadingKey: theme.fontHeadingKey,
    fontBodyKey: theme.fontBodyKey,
    radiusScale: theme.radiusScale,
    shadowStyle: theme.shadowStyle,
    heroStyleDefault: theme.heroStyleDefault,
    buttonStyle: theme.buttonStyle,
  } : {};

  const [version] = await db.insert(siteVersionsTable).values({
    siteId,
    orgId,
    versionNumber: nextVersion,
    compiledHtml,
    publishedByUserId: publishedBy,
    specJson,
    themeJson,
  }).returning();

  await logInfo(
    SERVICE,
    "createVersion",
    `Version ${nextVersion} created for site ${siteId}`,
    { siteId, versionNumber: nextVersion, publishedBy },
    orgId,
    siteId,
  );

  return version;
}

export async function listVersions(orgId: string, siteId: string): Promise<SiteVersion[]> {
  const site = await db.select().from(sitesTable).where(and(eq(sitesTable.id, siteId), eq(sitesTable.orgId, orgId))).limit(1);
  if (!site[0]) throw new Error(`Site not found or access denied: ${siteId}`);

  return db
    .select()
    .from(siteVersionsTable)
    .where(and(
      eq(siteVersionsTable.siteId, siteId),
      eq(siteVersionsTable.orgId, orgId),
    ))
    .orderBy(desc(siteVersionsTable.versionNumber));
}

export async function getVersion(orgId: string, siteId: string, versionNumber: number): Promise<SiteVersion | null> {
  const site = await db.select().from(sitesTable).where(and(eq(sitesTable.id, siteId), eq(sitesTable.orgId, orgId))).limit(1);
  if (!site[0]) throw new Error(`Site not found or access denied: ${siteId}`);

  const [version] = await db
    .select()
    .from(siteVersionsTable)
    .where(and(
      eq(siteVersionsTable.siteId, siteId),
      eq(siteVersionsTable.orgId, orgId),
      eq(siteVersionsTable.versionNumber, versionNumber),
    ))
    .limit(1);

  return version ?? null;
}

export async function rollbackToVersion(orgId: string, siteId: string, versionNumber: number): Promise<void> {
  const site = await db.select().from(sitesTable).where(and(eq(sitesTable.id, siteId), eq(sitesTable.orgId, orgId))).limit(1);
  if (!site[0]) throw new Error(`Site not found or access denied: ${siteId}`);

  const version = await getVersion(orgId, siteId, versionNumber);
  if (!version) throw new Error(`Version ${versionNumber} not found for site ${siteId}`);

  await db.update(sitesTable)
    .set({ generatedHtml: version.compiledHtml, compiledAt: new Date() })
    .where(and(eq(sitesTable.id, siteId), eq(sitesTable.orgId, orgId)));

  await logInfo(SERVICE, "rollbackToVersion", `Site ${siteId} rolled back to version ${versionNumber}`, { siteId, versionNumber }, orgId, siteId);
}
