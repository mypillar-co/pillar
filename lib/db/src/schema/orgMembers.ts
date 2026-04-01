import { pgTable, varchar, timestamp, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgMembersTable = pgTable("org_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  userId: varchar("user_id"),
  email: varchar("email").notNull(),
  role: varchar("role").notNull().default("admin"),
  inviteToken: varchar("invite_token"),
  invitedBy: varchar("invited_by").notNull(),
  invitedAt: timestamp("invited_at").notNull().default(sql`now()`),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => [
  index("org_members_org_idx").on(t.orgId),
  index("org_members_user_idx").on(t.userId),
  index("org_members_token_idx").on(t.inviteToken),
  unique("org_members_org_email_unique").on(t.orgId, t.email),
]);
