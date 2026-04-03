import { pgTable, text, varchar, boolean, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sitesTable = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique(),
  orgSlug: varchar("org_slug").unique(),
  subdomain: varchar("subdomain").unique(),
  websiteSpec: jsonb("website_spec").$type<Record<string, unknown>>(),
  generatedHtml: text("generated_html"),
  proposedHtml: text("proposed_html"),
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
  name: text("name"),
  slug: varchar("slug").unique(),
  siteType: text("site_type").default("default"),
  primaryCtaType: text("primary_cta_type").default("contact"),
  homepagePageId: varchar("homepage_page_id"),
  themeId: varchar("theme_id"),
  currentVersion: integer("current_version").default(1),
  publishedVersion: integer("published_version"),
  autoUpdateEnabled: boolean("auto_update_enabled").default(false),
  compiledAt: timestamp("compiled_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sitePagesTable = pgTable("site_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  siteId: varchar("site_id").notNull(),
  title: text("title").notNull(),
  slug: varchar("slug").notNull(),
  pageType: varchar("page_type").notNull().default("custom"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  isHomepage: boolean("is_homepage").default(false),
  isPublished: boolean("is_published").default(true),
  sortOrder: integer("sort_order").default(0),
  layoutKey: text("layout_key"),
  visibilityRulesJson: jsonb("visibility_rules_json").$type<Record<string, unknown>>(),
  version: integer("version").notNull().default(1),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  siteSlugIdx: uniqueIndex("site_page_slug_idx").on(table.siteId, table.slug),
  siteIdx: index("site_page_site_idx").on(table.siteId),
  orgSiteIdx: index("sp_org_site_idx").on(table.orgId, table.siteId),
}));

export const siteBlocksTable = pgTable("site_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  siteId: varchar("site_id"),
  pageId: varchar("page_id").notNull(),
  blockType: varchar("block_type").notNull(),
  variantKey: text("variant_key"),
  title: text("title"),
  content: jsonb("content").$type<Record<string, unknown>>().default({}),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>().default({}),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().default({}),
  isVisible: boolean("is_visible").default(true),
  sortOrder: integer("sort_order").default(0),
  sourceMode: text("source_mode").default("generated"),
  lockLevel: text("lock_level").default("editable"),
  editableByRoles: text("editable_by_roles").array().default(sql`ARRAY['owner','admin']::text[]`),
  version: integer("version").notNull().default(1),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  pageIdx: index("site_block_page_idx").on(table.pageId),
  orgSiteIdx: index("sb_org_site_idx").on(table.orgId, table.siteId),
  orgPageIdx: index("sb_org_page_idx").on(table.orgId, table.pageId),
  pageSortIdx: index("sb_page_sort_idx").on(table.pageId, table.sortOrder),
}));

export const siteNavItemsTable = pgTable("site_nav_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  siteId: varchar("site_id").notNull(),
  label: text("label").notNull(),
  url: text("url"),
  externalUrl: text("external_url"),
  pageId: varchar("page_id"),
  parentId: varchar("parent_id"),
  navLocation: text("nav_location").default("header"),
  sortOrder: integer("sort_order").default(0),
  isVisible: boolean("is_visible").default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  siteIdx: index("site_nav_site_idx").on(table.siteId),
  orgSiteIdx: index("sni_org_site_idx").on(table.orgId, table.siteId),
}));

export type Site = typeof sitesTable.$inferSelect;
export type SitePage = typeof sitePagesTable.$inferSelect;
export type SiteBlock = typeof siteBlocksTable.$inferSelect;
export type SiteNavItem = typeof siteNavItemsTable.$inferSelect;
