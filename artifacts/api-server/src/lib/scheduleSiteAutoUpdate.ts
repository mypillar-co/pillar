import { db, sitesTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { enqueueJob } from "@workspace/site/services";

/**
 * Fire-and-forget: enqueue a site auto-update job for the org's site.
 * Called after any event or sponsor change that may affect the public site.
 * Safe to call even if no site exists — silently no-ops.
 */
export async function scheduleSiteAutoUpdate(orgId: string): Promise<void> {
  try {
    const [site] = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(and(
        eq(sitesTable.orgId, orgId),
        isNull(sitesTable.deletedAt),
      ))
      .limit(1);

    if (!site) return;

    await enqueueJob("run_auto_update", orgId, { siteId: site.id });
  } catch {
    // Non-fatal — site update failure should never block the originating operation
  }
}
