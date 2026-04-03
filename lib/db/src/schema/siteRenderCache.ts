import { pgTable, text, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteRenderCacheTable = pgTable("site_render_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  orgId: varchar("org_id").notNull(),
  blockId: varchar("block_id").notNull(),
  renderedHtml: text("rendered_html").notNull(),
  dataHash: varchar("data_hash").notNull(),
  renderedAt: timestamp("rendered_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("src_block_idx").on(table.blockId),
  index("src_org_site_idx").on(table.orgId, table.siteId),
]);

export type SiteRenderCache = typeof siteRenderCacheTable.$inferSelect;
export type InsertSiteRenderCache = typeof siteRenderCacheTable.$inferInsert;
