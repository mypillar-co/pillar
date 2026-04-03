import { eq, and, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { jobQueueTable, type JobQueueRow } from "@workspace/db";
import { logError, logInfo } from "./siteLogService.js";
import type { JobType, JobPayload } from "../types/job-types.js";

const SERVICE = "jobQueueService";

export async function enqueueJob(
  jobType: JobType,
  orgId: string,
  payload: JobPayload,
  scheduledAt?: Date,
): Promise<string> {
  const [row] = await db.insert(jobQueueTable).values({
    jobType,
    orgId,
    siteId: (payload as Record<string, string>).siteId,
    payloadJson: payload as Record<string, unknown>,
    status: "pending",
    scheduledAt: scheduledAt ?? new Date(),
  }).returning({ id: jobQueueTable.id });

  return row.id;
}

export async function dequeueNextJob(): Promise<JobQueueRow | null> {
  const result = await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobQueueTable)
      .where(and(
        eq(jobQueueTable.status, "pending"),
        eq(jobQueueTable.failedPermanently, false),
        lte(jobQueueTable.scheduledAt, new Date()),
      ))
      .limit(1);

    if (!job) return null;

    await tx
      .update(jobQueueTable)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(jobQueueTable.id, job.id));

    return job;
  });

  return result;
}

export async function completeJob(jobId: string): Promise<void> {
  await db.update(jobQueueTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(jobQueueTable.id, jobId));
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const [job] = await db.select().from(jobQueueTable).where(eq(jobQueueTable.id, jobId)).limit(1);
  if (!job) return;

  const newAttempts = job.attempts + 1;
  const failedPermanently = newAttempts >= job.maxAttempts;

  const backoffSeconds = Math.pow(2, newAttempts) * 30;
  const nextScheduled = new Date(Date.now() + backoffSeconds * 1000);

  await db.update(jobQueueTable)
    .set({
      attempts: newAttempts,
      status: failedPermanently ? "failed" : "pending",
      failedPermanently,
      errorMessage: error,
      lastErrorJson: { message: error, attempt: newAttempts, timestamp: new Date().toISOString() },
      scheduledAt: failedPermanently ? undefined : nextScheduled,
    })
    .where(eq(jobQueueTable.id, jobId));

  if (failedPermanently) {
    await logError(
      SERVICE,
      "failJob",
      `Job ${jobId} (${job.jobType}) failed permanently after ${newAttempts} attempts`,
      { jobId, jobType: job.jobType, orgId: job.orgId, siteId: job.siteId ?? undefined },
      new Error(error),
      job.orgId,
      job.siteId ?? undefined,
    );
  }
}

export async function processJobs(): Promise<void> {
  const job = await dequeueNextJob();
  if (!job) return;

  try {
    await dispatchJob(job);
    await completeJob(job.id);
    await logInfo(SERVICE, "processJobs", `Job ${job.id} (${job.jobType}) completed`, { jobId: job.id }, job.orgId, job.siteId ?? undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, message);
    await logError(SERVICE, "processJobs", `Job ${job.id} (${job.jobType}) failed`, { jobId: job.id }, err, job.orgId, job.siteId ?? undefined);
  }
}

async function dispatchJob(job: JobQueueRow): Promise<void> {
  const payload = job.payloadJson as Record<string, unknown>;

  switch (job.jobType) {
    case "compile_site": {
      const { compileSite } = await import("./siteCompiler.js");
      const mode = (payload.mode as "full_compile" | "block_compile" | "page_compile") ?? "full_compile";
      await compileSite(job.orgId, payload.siteId as string, mode);
      break;
    }
    case "update_block": {
      const { updateBlock } = await import("./siteAutoUpdateService.js");
      await updateBlock(job.orgId, payload.blockId as string);
      break;
    }
    case "recompute_metrics": {
      const { recomputeEventMetrics } = await import("./eventMetricsService.js");
      await recomputeEventMetrics(job.orgId, payload.eventId as string);
      break;
    }
    case "run_auto_update": {
      const { runAutoUpdate } = await import("./siteAutoUpdateService.js");
      await runAutoUpdate(job.orgId, payload.siteId as string);
      break;
    }
    case "import_site": {
      const { run: runImport } = await import("./siteImportService.js");
      await runImport(job.orgId, payload.url as string, payload.siteId as string | undefined);
      break;
    }
    case "generate_site": {
      await logInfo(SERVICE, "dispatchJob", "generate_site job dispatched — handled by route", { jobId: job.id }, job.orgId);
      break;
    }
    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}
