import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { contactsTable } from "@workspace/db";
import type { SiteContactItem } from "../types/site-bindings.js";

interface ContactQueryConfig {
  siteVisible?: boolean;
  limit?: number;
}

export async function getContactSiteData(orgId: string, queryConfig: ContactQueryConfig = {}): Promise<SiteContactItem[]> {
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.orgId, orgId));

  const contactAny = contacts as Array<Record<string, unknown>>;

  let filtered = contactAny;
  if (queryConfig.siteVisible !== false) {
    filtered = filtered.filter(c => c.siteVisible === true);
  }

  filtered.sort((a, b) => {
    const aPriority = (a.siteDisplayPriority as number) ?? 0;
    const bPriority = (b.siteDisplayPriority as number) ?? 0;
    return aPriority - bPriority;
  });

  return filtered.map(c => ({
    id: c.id as string,
    firstName: c.firstName as string,
    lastName: c.lastName as string | null,
    siteRole: c.siteRole as string | null,
    siteBio: c.siteBio as string | null,
    sitePhotoUrl: c.sitePhotoUrl as string | null,
  }));
}
