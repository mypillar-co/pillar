import { pgTable, varchar, real, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventRevenueSummaryTable = pgTable("event_revenue_summary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  ticketRevenue: real("ticket_revenue").default(0),
  vendorRevenue: real("vendor_revenue").default(0),
  sponsorRevenue: real("sponsor_revenue").default(0),
  donationRevenue: real("donation_revenue").default(0),
  lastUpdated: timestamp("last_updated", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("ers_event_idx").on(table.eventId),
]);

export type EventRevenueSummary = typeof eventRevenueSummaryTable.$inferSelect;
export type InsertEventRevenueSummary = typeof eventRevenueSummaryTable.$inferInsert;
