import { pgTable, varchar, timestamp, text, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const notificationsTable = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  type: varchar("type").notNull(),
  // domain_expiry_warning | domain_expired | domain_renewed | domain_renewal_failed | ssl_active | ssl_failed
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("notifications_org_idx").on(table.orgId),
  typeIdx: index("notifications_type_idx").on(table.type),
  unreadIdx: index("notifications_unread_idx").on(table.orgId, table.read),
}));

export type Notification = typeof notificationsTable.$inferSelect;
