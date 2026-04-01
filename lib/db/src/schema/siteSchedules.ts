import { pgTable, text, varchar, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const siteUpdateSchedulesTable = pgTable("site_update_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique(),
  siteId: varchar("site_id").notNull(),
  frequency: varchar("frequency").notNull().default("weekly"),
  dayOfWeek: varchar("day_of_week"),
  updateItems: jsonb("update_items").$type<string[]>().default([]),
  customInstructions: text("custom_instructions"),
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("schedule_org_idx").on(table.orgId),
  nextRunIdx: index("schedule_next_run_idx").on(table.nextRunAt),
}));

export type SiteUpdateSchedule = typeof siteUpdateSchedulesTable.$inferSelect;
export type InsertSiteUpdateSchedule = typeof siteUpdateSchedulesTable.$inferInsert;
