import { pgTable, text, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgSiteContentTable = pgTable("org_site_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  key: varchar("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("osc_org_idx").on(table.orgId),
  orgKeyIdx: uniqueIndex("osc_org_key_idx").on(table.orgId, table.key),
}));

export type OrgSiteContent = typeof orgSiteContentTable.$inferSelect;
export type InsertOrgSiteContent = typeof orgSiteContentTable.$inferInsert;
