import { pgTable, text, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteChangeLogTable = pgTable("site_change_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  orgId: varchar("org_id").notNull(),
  changeType: text("change_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  diffJson: jsonb("diff_json").$type<Record<string, unknown>>().default({}),
  triggeredBy: text("triggered_by").default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => ({
  orgSiteIdx: index("scl_org_site_idx").on(table.orgId, table.siteId),
}));

export type SiteChangeLog = typeof siteChangeLogTable.$inferSelect;
export type InsertSiteChangeLog = typeof siteChangeLogTable.$inferInsert;
