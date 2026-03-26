import { pgTable, text, varchar, boolean, integer, real, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventsTable = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  slug: varchar("slug").notNull(),
  description: text("description"),
  eventType: varchar("event_type"),
  status: varchar("status").default("draft"),
  startDate: varchar("start_date"),
  endDate: varchar("end_date"),
  startTime: varchar("start_time"),
  endTime: varchar("end_time"),
  location: text("location"),
  maxCapacity: integer("max_capacity"),
  isTicketed: boolean("is_ticketed").default(false),
  ticketPrice: real("ticket_price"),
  ticketCapacity: integer("ticket_capacity"),
  hasRegistration: boolean("has_registration").default(false),
  isActive: boolean("is_active").default(true),
  featured: boolean("featured").default(false),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgSlugIdx: uniqueIndex("event_org_slug_idx").on(table.orgId, table.slug),
  orgIdx: index("event_org_idx").on(table.orgId),
}));

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = typeof eventsTable.$inferInsert;
