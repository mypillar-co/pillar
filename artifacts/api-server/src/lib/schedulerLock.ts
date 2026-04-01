import { db, schedulerLocksTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logger } from "./logger";

const INSTANCE_ID = randomBytes(8).toString("hex");

export async function withSchedulerLock<T>(
  jobName: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  await db
    .delete(schedulerLocksTable)
    .where(lt(schedulerLocksTable.expiresAt, now));

  try {
    await db
      .insert(schedulerLocksTable)
      .values({ jobName, expiresAt, instanceId: INSTANCE_ID })
      .onConflictDoNothing();
  } catch {
    logger.debug({ jobName }, "[scheduler-lock] Insert failed (conflict)");
    return null;
  }

  const [acquired] = await db
    .select()
    .from(schedulerLocksTable)
    .where(eq(schedulerLocksTable.jobName, jobName));

  if (!acquired || acquired.instanceId !== INSTANCE_ID) {
    logger.debug({ jobName }, "[scheduler-lock] Lock held by another instance — skipping");
    return null;
  }

  try {
    const result = await fn();
    return result;
  } finally {
    await db
      .delete(schedulerLocksTable)
      .where(eq(schedulerLocksTable.jobName, jobName))
      .catch(() => {});
  }
}
