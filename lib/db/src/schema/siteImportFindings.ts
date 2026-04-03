import { pgTable, text, varchar, boolean, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteImportFindingsTable = pgTable("site_import_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importRunId: varchar("import_run_id").notNull(),
  findingType: text("finding_type").notNull(),
  sourceUrl: text("source_url"),
  pageClassification: text("page_classification"),
  title: text("title"),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>().default({}),
  qualityScore: integer("quality_score").default(0),
  preserveVerbatim: boolean("preserve_verbatim").default(false),
  isSelected: boolean("is_selected").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sif_run_idx").on(table.importRunId),
  index("sif_run_type_idx").on(table.importRunId, table.findingType),
]);

export type SiteImportFinding = typeof siteImportFindingsTable.$inferSelect;
export type InsertSiteImportFinding = typeof siteImportFindingsTable.$inferInsert;
