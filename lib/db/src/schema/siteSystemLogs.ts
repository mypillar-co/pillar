import { pgTable, text, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteSystemLogsTable = pgTable("site_system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id"),
  siteId: varchar("site_id"),
  service: text("service").notNull(),
  operation: text("operation").notNull(),
  severity: text("severity").notNull().default("info"),
  message: text("message").notNull(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ssl_org_idx").on(table.orgId),
  index("ssl_site_idx").on(table.siteId),
  index("ssl_severity_created_idx").on(table.severity, table.createdAt),
]);

export type SiteSystemLog = typeof siteSystemLogsTable.$inferSelect;
export type InsertSiteSystemLog = typeof siteSystemLogsTable.$inferInsert;
