import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { orgActivityStreamTable } from "@workspace/db";
import { sitesTable } from "@workspace/db";
import { enqueueJob } from "./jobQueueService.js";
import { logError } from "./siteLogService.js";

const SERVICE = "activityStreamService";

export async function recordActivity(
  orgId: string,
  activityType: string,
  referenceId: string,
): Promise<void> {
  try {
    await db.insert(orgActivityStreamTable).values({
      orgId,
      activityType,
      referenceId,
      processed: false,
    });
  } catch (err) {
    await logError(SERVICE, "recordActivity", "Failed to record activity", { orgId, activityType, referenceId }, err, orgId);
  }
}

export async function processUnprocessedActivities(orgId: string): Promise<void> {
  try {
    const activities = await db
      .select()
      .from(orgActivityStreamTable)
      .where(and(
        eq(orgActivityStreamTable.orgId, orgId),
        eq(orgActivityStreamTable.processed, false),
      ));

    if (activities.length === 0) return;

    const [site] = await db
      .select()
      .from(sitesTable)
      .where(eq(sitesTable.orgId, orgId))
      .limit(1);

    const siteId = site?.id;

    for (const activity of activities) {
      try {
        switch (activity.activityType) {
          case "event_created":
          case "event_updated":
          case "event_status_changed":
          case "sponsor_added":
          case "sponsor_approved":
          case "announcement_posted":
            if (siteId) {
              await enqueueJob("run_auto_update", orgId, { siteId });
            }
            break;
          case "ticket_sold":
            if (activity.referenceId) {
              await enqueueJob("recompute_metrics", orgId, { eventId: activity.referenceId });
            }
            break;
          case "site_generated":
          case "site_published":
            if (siteId) {
              await enqueueJob("compile_site", orgId, { siteId, mode: "full_compile" });
            }
            break;
        }

        await db.update(orgActivityStreamTable)
          .set({ processed: true, processedAt: new Date() })
          .where(eq(orgActivityStreamTable.id, activity.id));
      } catch (err) {
        await logError(SERVICE, "processUnprocessedActivities", `Failed to process activity ${activity.id}`, { activityId: activity.id, activityType: activity.activityType }, err, orgId);
      }
    }
  } catch (err) {
    await logError(SERVICE, "processUnprocessedActivities", "Failed to process activities", { orgId }, err, orgId);
  }
}
