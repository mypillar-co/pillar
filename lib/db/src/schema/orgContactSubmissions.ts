import { pgTable, text, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgContactSubmissionsTable = pgTable("org_contact_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  email: varchar("email").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("ocs_org_idx").on(table.orgId),
}));

export type OrgContactSubmission = typeof orgContactSubmissionsTable.$inferSelect;
export type InsertOrgContactSubmission = typeof orgContactSubmissionsTable.$inferInsert;
