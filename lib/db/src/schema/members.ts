import { pgTable, text, date, timestamp, boolean } from "drizzle-orm/pg-core";

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
  // Member portal (additive — see api-server/src/index.ts runMigrations)
  passwordHash: text("password_hash"),
  registrationToken: text("registration_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  registeredAt: timestamp("registered_at"),
  showInDirectory: boolean("show_in_directory").notNull().default(true),
  title: text("title"),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  address: text("address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const memberSessionsTable = pgTable("member_sessions", {
  token: text("token").primaryKey(),
  memberId: text("member_id").notNull(),
  orgId: text("org_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});
