import { pgTable, text, varchar, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteModulesTable = pgTable("site_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  orgId: varchar("org_id").notNull(),
  moduleType: text("module_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("sm_site_module_idx").on(table.siteId, table.moduleType),
  index("sm_org_site_idx").on(table.orgId, table.siteId),
]);

export type SiteModule = typeof siteModulesTable.$inferSelect;
export type InsertSiteModule = typeof siteModulesTable.$inferInsert;
