import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { siteModulesTable, type SiteModule } from "@workspace/db";
import { enqueueJob } from "./jobQueueService.js";

const DEFAULT_MODULES: { moduleType: string; enabled: boolean }[] = [
  { moduleType: "events", enabled: true },
  { moduleType: "sponsors", enabled: true },
  { moduleType: "announcements", enabled: true },
  { moduleType: "vendors", enabled: false },
  { moduleType: "contacts", enabled: false },
  { moduleType: "social", enabled: true },
  { moduleType: "payments", enabled: true },
  { moduleType: "gallery", enabled: false },
];

export async function getSiteModules(orgId: string, siteId: string): Promise<SiteModule[]> {
  return db
    .select()
    .from(siteModulesTable)
    .where(and(
      eq(siteModulesTable.orgId, orgId),
      eq(siteModulesTable.siteId, siteId),
    ));
}

export async function isModuleEnabled(orgId: string, siteId: string, moduleType: string): Promise<boolean> {
  const [module] = await db
    .select()
    .from(siteModulesTable)
    .where(and(
      eq(siteModulesTable.orgId, orgId),
      eq(siteModulesTable.siteId, siteId),
      eq(siteModulesTable.moduleType, moduleType),
    ))
    .limit(1);

  return module?.enabled ?? false;
}

export async function initializeModulesForSite(orgId: string, siteId: string): Promise<void> {
  const existing = await getSiteModules(orgId, siteId);
  const existingTypes = new Set(existing.map(m => m.moduleType));

  const toInsert = DEFAULT_MODULES.filter(m => !existingTypes.has(m.moduleType));

  if (toInsert.length > 0) {
    await db.insert(siteModulesTable).values(
      toInsert.map(m => ({
        siteId,
        orgId,
        moduleType: m.moduleType,
        enabled: m.enabled,
        settingsJson: {},
      }))
    );
  }
}

export async function toggleModule(
  orgId: string,
  siteId: string,
  moduleType: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(siteModulesTable)
    .set({ enabled })
    .where(and(
      eq(siteModulesTable.orgId, orgId),
      eq(siteModulesTable.siteId, siteId),
      eq(siteModulesTable.moduleType, moduleType),
    ));

  await enqueueJob("compile_site", orgId, { siteId, mode: "full_compile" });
}
