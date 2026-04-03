import { pgTable, text, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteImportRunsTable = pgTable("site_import_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id"),
  orgId: varchar("org_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  status: text("status").default("started"),
  detectedSiteType: text("detected_site_type"),
  rawSummaryJson: jsonb("raw_summary_json").$type<Record<string, unknown>>(),
  recommendedStructureJson: jsonb("recommended_structure_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("sir_site_idx").on(table.siteId),
  index("sir_org_idx").on(table.orgId),
]);

export type SiteImportRun = typeof siteImportRunsTable.$inferSelect;
export type InsertSiteImportRun = typeof siteImportRunsTable.$inferInsert;
