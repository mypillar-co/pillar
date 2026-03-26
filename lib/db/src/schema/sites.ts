import { pgTable, text, varchar, boolean, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sitesTable = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique(),
  orgSlug: varchar("org_slug").unique(),
  subdomain: varchar("subdomain").unique(),
  websiteSpec: jsonb("website_spec").$type<Record<string, unknown>>(),
  generatedHtml: text("generated_html"),
  theme: jsonb("theme").$type<{
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontHeading?: string;
    fontBody?: string;
  }>(),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  status: varchar("status").default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sitePagesTable = pgTable("site_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  siteId: varchar("site_id").notNull(),
  title: text("title").notNull(),
  slug: varchar("slug").notNull(),
  pageType: varchar("page_type").notNull(),
  isPublished: boolean("is_published").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  siteSlugIdx: uniqueIndex("site_page_slug_idx").on(table.siteId, table.slug),
  siteIdx: index("site_page_site_idx").on(table.siteId),
}));

export const siteBlocksTable = pgTable("site_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  pageId: varchar("page_id").notNull(),
  blockType: varchar("block_type").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().default({}),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  isVisible: boolean("is_visible").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  pageIdx: index("site_block_page_idx").on(table.pageId),
}));

export const siteNavItemsTable = pgTable("site_nav_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  siteId: varchar("site_id").notNull(),
  label: text("label").notNull(),
  url: text("url"),
  pageId: varchar("page_id"),
  parentId: varchar("parent_id"),
  sortOrder: integer("sort_order").default(0),
  isVisible: boolean("is_visible").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  siteIdx: index("site_nav_site_idx").on(table.siteId),
}));

export type Site = typeof sitesTable.$inferSelect;
export type SitePage = typeof sitePagesTable.$inferSelect;
export type SiteBlock = typeof siteBlocksTable.$inferSelect;
export type SiteNavItem = typeof siteNavItemsTable.$inferSelect;
