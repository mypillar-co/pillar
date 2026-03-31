import { pgTable, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const outreachProspectsTable = pgTable("outreach_prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgName: varchar("org_name", { length: 255 }).notNull(),
  orgType: varchar("org_type", { length: 100 }),
  contactName: varchar("contact_name", { length: 255 }),
  contactRole: varchar("contact_role", { length: 100 }),
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  currentWebsite: varchar("current_website", { length: 500 }),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  emailsSent: integer("emails_sent").notNull().default(0),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type OutreachProspect = typeof outreachProspectsTable.$inferSelect;
