import { pgTable, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgUsageLimitsTable = pgTable("org_usage_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique(),
  aiCallsToday: integer("ai_calls_today").notNull().default(0),
  aiCallsThisMonth: integer("ai_calls_this_month").notNull().default(0),
  dailyLimit: integer("daily_limit").notNull().default(20),
  monthlyLimit: integer("monthly_limit").notNull().default(200),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull().defaultNow(),
  monthlyResetAt: timestamp("monthly_reset_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("oul_org_idx").on(table.orgId),
]);

export type OrgUsageLimits = typeof orgUsageLimitsTable.$inferSelect;
export type InsertOrgUsageLimits = typeof orgUsageLimitsTable.$inferInsert;
