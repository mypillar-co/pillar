import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const schedulerLocksTable = pgTable("scheduler_locks", {
  jobName: varchar("job_name").primaryKey(),
  lockedAt: timestamp("locked_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at").notNull(),
  instanceId: varchar("instance_id").notNull(),
});
