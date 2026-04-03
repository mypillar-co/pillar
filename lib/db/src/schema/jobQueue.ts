import { pgTable, text, varchar, boolean, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const jobQueueTable = pgTable("job_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull(),
  orgId: varchar("org_id").notNull(),
  siteId: varchar("site_id"),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  failedPermanently: boolean("failed_permanently").notNull().default(false),
  lastErrorJson: jsonb("last_error_json").$type<Record<string, unknown>>(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("jq_org_status_idx").on(table.orgId, table.status),
  index("jq_status_scheduled_idx").on(table.status, table.scheduledAt),
  index("jq_site_idx").on(table.siteId),
]);

export type JobQueueRow = typeof jobQueueTable.$inferSelect;
export type InsertJobQueueRow = typeof jobQueueTable.$inferInsert;
