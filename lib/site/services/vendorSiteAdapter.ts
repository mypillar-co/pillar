import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db";
import type { SiteVendorItem } from "../types/site-bindings.js";

interface VendorQueryConfig {
  siteVisible?: boolean;
  limit?: number;
}

export async function getVendorSiteData(orgId: string, queryConfig: VendorQueryConfig = {}): Promise<SiteVendorItem[]> {
  const vendors = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.orgId, orgId));

  const vendorAny = vendors as Array<Record<string, unknown>>;

  let filtered = vendorAny;
  if (queryConfig.siteVisible !== false) {
    filtered = filtered.filter(v => v.siteVisible === true);
  }

  filtered.sort((a, b) => {
    const aPriority = (a.siteDisplayPriority as number) ?? 0;
    const bPriority = (b.siteDisplayPriority as number) ?? 0;
    return aPriority - bPriority;
  });

  return filtered.map(v => ({
    id: v.id as string,
    name: v.name as string,
    siteCategory: v.siteCategory as string | null,
    siteDisplayPriority: (v.siteDisplayPriority as number) ?? 0,
  }));
}
