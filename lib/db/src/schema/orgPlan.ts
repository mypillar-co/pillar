import { pgTable, text, varchar, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgPlanTable = pgTable("org_plan", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique(),
  planType: text("plan_type").notNull().default("free"),
  status: text("status").notNull().default("active"),
  billingTier: text("billing_tier"),
  aiQuotaOverride: integer("ai_quota_override"),
  maxSites: integer("max_sites").notNull().default(1),
  maxEvents: integer("max_events").notNull().default(10),
  featureOverridesJson: jsonb("feature_overrides_json").$type<Record<string, boolean>>().notNull().default({}),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("op_org_idx").on(table.orgId),
]);

export type OrgPlan = typeof orgPlanTable.$inferSelect;
export type InsertOrgPlan = typeof orgPlanTable.$inferInsert;
