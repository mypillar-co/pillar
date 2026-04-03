import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { studioOutputsTable } from "@workspace/db";
import type { SiteAnnouncementItem } from "../types/site-bindings.js";

interface AnnouncementQueryConfig {
  siteStatus?: string;
  limit?: number;
  siteBlockTarget?: string;
}

export async function getAnnouncementSiteData(orgId: string, queryConfig: AnnouncementQueryConfig = {}): Promise<SiteAnnouncementItem[]> {
  const outputs = await db
    .select()
    .from(studioOutputsTable)
    .where(eq(studioOutputsTable.orgId, orgId))
    .orderBy(desc(studioOutputsTable.createdAt))
    .limit(queryConfig.limit ?? 10);

  const outputAny = outputs as Array<Record<string, unknown>>;

  let filtered = outputAny.filter(o => {
    if (o.siteEligible !== true) return false;
    const targetStatus = queryConfig.siteStatus ?? "approved";
    if (o.siteStatus !== targetStatus) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const aPriority = (a.sitePublishPriority as number) ?? 0;
    const bPriority = (b.sitePublishPriority as number) ?? 0;
    return bPriority - aPriority;
  });

  return filtered.slice(0, queryConfig.limit ?? 5).map(o => ({
    id: o.id as string,
    title: o.taskLabel as string,
    body: o.output as string | null,
    createdAt: o.createdAt as Date,
    siteBlockTarget: o.siteBlockTarget as string | null,
  }));
}
