import { pgTable, text, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteThemesTable = pgTable("site_themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  themePresetKey: text("theme_preset_key").default("pillar-default"),
  colorPrimary: text("color_primary"),
  colorSecondary: text("color_secondary"),
  colorAccent: text("color_accent"),
  colorSurface: text("color_surface"),
  colorText: text("color_text"),
  fontHeadingKey: text("font_heading_key"),
  fontBodyKey: text("font_body_key"),
  radiusScale: text("radius_scale"),
  shadowStyle: text("shadow_style"),
  heroStyleDefault: text("hero_style_default"),
  buttonStyle: text("button_style"),
  logoMode: text("logo_mode").default("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("st_site_idx").on(table.siteId),
]);

export type SiteTheme = typeof siteThemesTable.$inferSelect;
export type InsertSiteTheme = typeof siteThemesTable.$inferInsert;
