import { pgTable, text, varchar, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteVersionsTable = pgTable("site_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  orgId: varchar("org_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  specJson: jsonb("spec_json").$type<Record<string, unknown>>().notNull().default({}),
  themeJson: jsonb("theme_json").$type<Record<string, unknown>>().notNull().default({}),
  compiledHtml: text("compiled_html").notNull(),
  publishedByUserId: varchar("published_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sv_site_version_idx").on(table.siteId, table.versionNumber),
  index("sv_site_idx").on(table.siteId),
]);

export type SiteVersion = typeof siteVersionsTable.$inferSelect;
export type InsertSiteVersion = typeof siteVersionsTable.$inferInsert;
