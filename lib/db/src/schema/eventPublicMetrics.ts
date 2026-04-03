import { pgTable, varchar, integer, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventPublicMetricsTable = pgTable("event_public_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  ticketsSold: integer("tickets_sold").default(0),
  ticketsRemaining: integer("tickets_remaining"),
  revenueTotal: real("revenue_total").default(0),
  lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("epm_event_idx").on(table.eventId),
]);

export type EventPublicMetrics = typeof eventPublicMetricsTable.$inferSelect;
export type InsertEventPublicMetrics = typeof eventPublicMetricsTable.$inferInsert;
