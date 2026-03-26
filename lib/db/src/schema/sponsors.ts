import { pgTable, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sponsorsTable = pgTable("sponsors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  contactId: varchar("contact_id"),
  email: varchar("email"),
  phone: varchar("phone"),
  website: text("website"),
  logoUrl: text("logo_url"),
  status: varchar("status").default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("sponsor_org_idx").on(table.orgId),
}));

export type Sponsor = typeof sponsorsTable.$inferSelect;
export type InsertSponsor = typeof sponsorsTable.$inferInsert;
