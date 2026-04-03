import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { siteDataSourcesTable } from "@workspace/db";
import { siteBlockBindingsTable } from "@workspace/db";
import { isModuleEnabled } from "./siteModuleService.js";
import { getEventSiteData } from "./eventSiteAdapter.js";
import { getSponsorSiteData } from "./sponsorSiteAdapter.js";
import { getVendorSiteData } from "./vendorSiteAdapter.js";
import { getContactSiteData } from "./contactSiteAdapter.js";
import { getAnnouncementSiteData } from "./announcementSiteAdapter.js";
import { getSocialHandles } from "./socialSiteAdapter.js";
import { getOrgSiteProfile } from "./organizationSiteAdapter.js";
import { logError } from "./siteLogService.js";
import type { SiteDataMap, SiteBlockBinding } from "../types/site-bindings.js";

const SERVICE = "siteDataIntegrationService";

export async function getSiteData(
  orgId: string,
  siteId: string,
  blockBindings: SiteBlockBinding[],
): Promise<SiteDataMap> {
  const dataMap: SiteDataMap = {};

  for (const binding of blockBindings) {
    try {
      const [dataSource] = await db
        .select()
        .from(siteDataSourcesTable)
        .where(and(
          eq(siteDataSourcesTable.id, binding.dataSourceId),
          eq(siteDataSourcesTable.orgId, orgId),
        ))
        .limit(1);

      if (!dataSource) continue;

      const sourceType = dataSource.sourceType;

      const moduleEnabled = await isModuleEnabled(orgId, siteId, sourceType);
      if (!moduleEnabled) {
        dataMap[binding.blockId] = [];
        continue;
      }

      const queryConfig = (binding.queryConfigJson ?? {}) as Record<string, unknown>;

      let data: unknown;

      switch (sourceType) {
        case "events":
          data = await getEventSiteData(orgId, queryConfig as Parameters<typeof getEventSiteData>[1]);
          break;
        case "sponsors":
          data = await getSponsorSiteData(orgId, queryConfig as Parameters<typeof getSponsorSiteData>[1]);
          break;
        case "vendors":
          data = await getVendorSiteData(orgId, queryConfig as Parameters<typeof getVendorSiteData>[1]);
          break;
        case "contacts":
          data = await getContactSiteData(orgId, queryConfig as Parameters<typeof getContactSiteData>[1]);
          break;
        case "announcements":
          data = await getAnnouncementSiteData(orgId, queryConfig as Parameters<typeof getAnnouncementSiteData>[1]);
          break;
        case "social":
          data = await getSocialHandles(orgId);
          break;
        case "organization":
          data = await getOrgSiteProfile(orgId);
          break;
        default:
          data = [];
      }

      dataMap[binding.blockId] = data;
    } catch (err) {
      await logError(
        SERVICE,
        "getSiteData",
        `Adapter failed for block ${binding.blockId} (binding type: ${binding.bindingType})`,
        { blockId: binding.blockId, bindingType: binding.bindingType },
        err,
        orgId,
        siteId,
      );
      dataMap[binding.blockId] = [];
    }
  }

  return dataMap;
}

export async function refreshDataSource(orgId: string, dataSourceId: string): Promise<void> {
  const [dataSource] = await db
    .select()
    .from(siteDataSourcesTable)
    .where(and(
      eq(siteDataSourcesTable.id, dataSourceId),
      eq(siteDataSourcesTable.orgId, orgId),
    ))
    .limit(1);

  if (!dataSource) return;

  await db
    .update(siteDataSourcesTable)
    .set({ lastSyncedAt: new Date(), syncStatus: "idle" })
    .where(eq(siteDataSourcesTable.id, dataSourceId));
}
