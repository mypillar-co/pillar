// schema-only: intentionally not written to by the active compile pipeline.
// Compile output lives in site_versions (compiledHtml) and site_render_cache
// (per-block). This table is reserved for a future "latest published snapshot"
// pointer. Do not add to health-check adapter probes until it is wired up.
import { pgTable, text, varchar, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteCompiledSnapshotsTable = pgTable("site_compiled_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  orgId: varchar("org_id").notNull(),
  snapshotHtml: text("snapshot_html").notNull(),
  snapshotCss: text("snapshot_css"),
  specJson: jsonb("spec_json").$type<Record<string, unknown>>().notNull().default({}),
  compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => ({
  siteIdx: uniqueIndex("scs_site_idx").on(table.siteId),
}));

export type SiteCompiledSnapshot = typeof siteCompiledSnapshotsTable.$inferSelect;
export type InsertSiteCompiledSnapshot = typeof siteCompiledSnapshotsTable.$inferInsert;
