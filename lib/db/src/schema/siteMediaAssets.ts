import { pgTable, text, varchar, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteMediaAssetsTable = pgTable("site_media_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  orgId: varchar("org_id").notNull(),
  assetType: text("asset_type").notNull(),
  storageUrl: text("storage_url").notNull(),
  originalUrl: text("original_url"),
  altText: text("alt_text"),
  role: text("role"),
  width: integer("width"),
  height: integer("height"),
  fileSizeBytes: integer("file_size_bytes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => ({
  orgSiteIdx: index("sma_org_site_idx").on(table.orgId, table.siteId),
}));

export type SiteMediaAsset = typeof siteMediaAssetsTable.$inferSelect;
export type InsertSiteMediaAsset = typeof siteMediaAssetsTable.$inferInsert;
