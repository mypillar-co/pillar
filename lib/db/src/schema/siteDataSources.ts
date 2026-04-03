import { pgTable, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteDataSourcesTable = pgTable("site_data_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  orgId: varchar("org_id").notNull(),
  sourceType: text("source_type").notNull(),
  refreshStrategy: text("refresh_strategy").default("realtime"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncStatus: text("sync_status").default("idle"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sds_org_site_idx").on(table.orgId, table.siteId),
]);

export type SiteDataSource = typeof siteDataSourcesTable.$inferSelect;
export type InsertSiteDataSource = typeof siteDataSourcesTable.$inferInsert;
