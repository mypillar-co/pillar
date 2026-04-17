import { pgTable, text, date, timestamp } from "drizzle-orm/pg-core";

export const membersTable = pgTable("members", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  memberType: text("member_type").notNull().default("general"),
  status: text("status").notNull().default("active"),
  joinDate: date("join_date"),
  renewalDate: date("renewal_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
