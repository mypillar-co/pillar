import { pgTable, text, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgBusinessesTable = pgTable("org_businesses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  category: varchar("category"),
  description: text("description"),
  address: text("address"),
  phone: varchar("phone"),
  website: text("website"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("ob_org_idx").on(table.orgId),
}));

export type OrgBusiness = typeof orgBusinessesTable.$inferSelect;
export type InsertOrgBusiness = typeof orgBusinessesTable.$inferInsert;
