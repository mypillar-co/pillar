import { pgTable, text, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const newsletterSubscribersTable = pgTable("newsletter_subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  email: varchar("email").notNull(),
  name: text("name"),
  subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
}, (table) => ({
  orgIdx: index("ns_org_idx").on(table.orgId),
  orgEmailIdx: uniqueIndex("ns_org_email_idx").on(table.orgId, table.email),
}));

export type NewsletterSubscriber = typeof newsletterSubscribersTable.$inferSelect;
export type InsertNewsletterSubscriber = typeof newsletterSubscribersTable.$inferInsert;
