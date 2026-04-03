import { pgTable, text, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteBlockBindingsTable = pgTable("site_block_bindings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockId: varchar("block_id").notNull(),
  orgId: varchar("org_id").notNull(),
  siteId: varchar("site_id").notNull(),
  dataSourceId: varchar("data_source_id").notNull(),
  bindingType: text("binding_type").notNull(),
  queryConfigJson: jsonb("query_config_json").$type<Record<string, unknown>>().default({}),
  displayConfigJson: jsonb("display_config_json").$type<Record<string, unknown>>().default({}),
  updatePolicy: text("update_policy").default("auto_apply"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sbb_org_site_idx").on(table.orgId, table.siteId),
  index("sbb_block_idx").on(table.blockId),
]);

export type SiteBlockBinding = typeof siteBlockBindingsTable.$inferSelect;
export type InsertSiteBlockBinding = typeof siteBlockBindingsTable.$inferInsert;
