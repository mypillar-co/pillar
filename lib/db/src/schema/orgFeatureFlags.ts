import { pgTable, text, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgFeatureFlagsTable = pgTable("org_feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("off_org_feature_idx").on(table.orgId, table.featureKey),
]);

export type OrgFeatureFlag = typeof orgFeatureFlagsTable.$inferSelect;
export type InsertOrgFeatureFlag = typeof orgFeatureFlagsTable.$inferInsert;
