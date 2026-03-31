import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const supportTicketsTable = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id"),
  userId: varchar("user_id"),
  orgName: varchar("org_name"),
  userEmail: varchar("user_email"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity").notNull().default("normal"),
  status: varchar("status").notNull().default("open"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
