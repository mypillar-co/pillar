import { eq, and, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { sponsorsTable } from "@workspace/db";
import type { SiteSponsorItem } from "../types/site-bindings.js";

interface SponsorQueryConfig {
  siteVisible?: boolean;
  status?: string;
  limit?: number;
}

export async function getActiveSponsorCount(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: sponsorsTable.id })
    .from(sponsorsTable)
    .where(and(
      eq(sponsorsTable.orgId, orgId),
      eq(sponsorsTable.status, "active"),
      eq(sponsorsTable.siteVisible, true),
    ));
  return rows.length;
}

export async function getSponsorSiteData(orgId: string, queryConfig: SponsorQueryConfig = {}): Promise<SiteSponsorItem[]> {
  const hiddenOk = queryConfig.siteVisible === false;

  const sponsors = await db
    .select()
    .from(sponsorsTable)
    .where(and(
      eq(sponsorsTable.orgId, orgId),
      eq(sponsorsTable.status, queryConfig.status ?? "active"),
      hiddenOk ? undefined : eq(sponsorsTable.siteVisible, true),
    ))
    .orderBy(asc(sponsorsTable.tierRank), asc(sponsorsTable.siteDisplayPriority))
    .limit(queryConfig.limit ?? 50);

  return sponsors.map(s => ({
    id: s.id,
    name: s.name,
    logoUrl: s.logoUrl ?? null,
    website: s.website ?? null,
    tierRank: s.tierRank ?? 0,
  }));
}
