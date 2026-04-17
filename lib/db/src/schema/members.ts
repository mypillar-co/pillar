import { pgTable, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const membersTable = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  memberType: varchar("member_type").notNull().default("general"),
  status: varchar("status").notNull().default("active"),
  joinDate: varchar("join_date"),
  renewalDate: varchar("renewal_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => [
  index("members_org_idx").on(t.orgId),
  index("members_org_status_idx").on(t.orgId, t.status),
  index("members_org_email_idx").on(t.orgId, t.email),
]);
