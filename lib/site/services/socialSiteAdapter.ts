import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { socialAccountsTable } from "@workspace/db";
import type { SiteSocialHandle } from "../types/site-bindings.js";

export async function getSocialHandles(orgId: string): Promise<SiteSocialHandle[]> {
  const accounts = await db
    .select()
    .from(socialAccountsTable)
    .where(and(
      eq(socialAccountsTable.orgId, orgId),
      eq(socialAccountsTable.isConnected, true),
    ));

  const accountAny = accounts as Array<Record<string, unknown>>;

  const filtered = accountAny.filter(a => a.siteVisible !== false);

  filtered.sort((a, b) => {
    const aOrder = (a.siteDisplayOrder as number) ?? 0;
    const bOrder = (b.siteDisplayOrder as number) ?? 0;
    return aOrder - bOrder;
  });

  return filtered.map(a => ({
    platform: a.platform as string,
    accountName: a.accountName as string,
    siteLabelOverride: a.siteLabelOverride as string | null,
  }));
}
