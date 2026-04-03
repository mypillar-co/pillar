import { pgTable, text, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgActivityStreamTable = pgTable("org_activity_stream", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  activityType: text("activity_type").notNull(),
  referenceId: varchar("reference_id"),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("oas_org_processed_idx").on(table.orgId, table.processed),
  index("oas_activity_type_idx").on(table.activityType),
  index("oas_created_idx").on(table.createdAt),
]);

export type OrgActivityStream = typeof orgActivityStreamTable.$inferSelect;
export type InsertOrgActivityStream = typeof orgActivityStreamTable.$inferInsert;
