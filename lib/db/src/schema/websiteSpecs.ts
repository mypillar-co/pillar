import { pgTable, text, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const websiteSpecsTable = pgTable("website_specs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique(),
  siteId: varchar("site_id"),
  orgName: text("org_name"),
  tagline: text("tagline"),
  mission: text("mission"),
  services: jsonb("services").$type<string[]>().default([]),
  location: text("location"),
  hours: text("hours"),
  events: jsonb("events").$type<string[]>().default([]),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  socialMedia: jsonb("social_media").$type<string[]>().default([]),
  audience: text("audience"),
  colors: text("colors"),
  extras: text("extras"),
  rawConversation: jsonb("raw_conversation").$type<{ role: string; content: string }[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("website_spec_org_idx").on(table.orgId),
}));

export type WebsiteSpec = typeof websiteSpecsTable.$inferSelect;
export type InsertWebsiteSpec = typeof websiteSpecsTable.$inferInsert;
