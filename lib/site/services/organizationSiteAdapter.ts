import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizationsTable } from "@workspace/db";
import type { OrgSiteProfile } from "../types/site-bindings.js";

export async function getOrgSiteProfile(orgId: string): Promise<OrgSiteProfile> {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error(`Organization not found: ${orgId}`);
  }

  const orgAny = org as Record<string, unknown>;

  return {
    name: org.name,
    mission: (orgAny.siteMissionOverride as string | null) ?? (orgAny.description as string | null) ?? "",
    tagline: orgAny.siteTagline as string | null ?? null,
    contactEmail: (orgAny.siteContactEmail as string | null) ?? (org as Record<string, unknown>).senderEmail as string | null ?? null,
    contactPhone: orgAny.siteContactPhone as string | null ?? null,
    address: orgAny.sitePublicAddress as string | null ?? null,
    hours: orgAny.sitePublicHours as string | null ?? null,
    description: orgAny.sitePublicDescription as string | null ?? null,
    logoUrl: (org as Record<string, unknown>).logoUrl as string | null ?? null,
    type: org.type,
    slug: org.slug,
  };
}
