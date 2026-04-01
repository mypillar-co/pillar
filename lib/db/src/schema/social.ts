import { pgTable, text, varchar, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const socialAccountsTable = pgTable("social_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  platform: varchar("platform").notNull(),
  accountName: text("account_name").notNull(),
  accountId: varchar("account_id"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isConnected: boolean("is_connected").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgPlatformIdx: index("social_accounts_org_platform_idx").on(table.orgId, table.platform),
}));

export const socialPostsTable = pgTable("social_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  platforms: text("platforms").array().notNull().default(sql`ARRAY[]::text[]`),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  status: varchar("status").notNull().default("draft"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  automationRuleId: varchar("automation_rule_id"),
  externalPostIds: text("external_post_ids"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgStatusIdx: index("social_posts_org_status_idx").on(table.orgId, table.status),
  scheduledIdx: index("social_posts_scheduled_idx").on(table.scheduledAt),
  statusScheduledIdx: index("social_posts_status_scheduled_idx").on(table.status, table.scheduledAt),
}));

export const automationRulesTable = pgTable("automation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  platforms: text("platforms").array().notNull().default(sql`ARRAY[]::text[]`),
  frequency: varchar("frequency").notNull(),
  dayOfWeek: varchar("day_of_week"),
  timeOfDay: varchar("time_of_day").default("09:00"),
  contentType: varchar("content_type").default("events"),
  customPrompt: text("custom_prompt"),
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  nextRunIdx: index("automation_rules_next_run_idx").on(table.nextRunAt),
  orgIdx: index("automation_rules_org_idx").on(table.orgId),
}));

export const contentStrategyTable = pgTable("content_strategy", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().unique(),
  tone: varchar("tone").default("professional"),
  postingFrequency: varchar("posting_frequency").default("weekly"),
  topics: text("topics").array().default(sql`ARRAY[]::text[]`),
  platforms: text("platforms").array().default(sql`ARRAY[]::text[]`),
  isAutonomous: boolean("is_autonomous").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const oauthStatesTable = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateToken: varchar("state_token", { length: 128 }).notNull().unique(),
  orgId: varchar("org_id").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  sessionId: varchar("session_id", { length: 256 }).notNull().default(""),
  codeVerifier: varchar("code_verifier", { length: 256 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  stateTokenIdx: index("oauth_states_token_idx").on(table.stateToken),
  expiresAtIdx: index("oauth_states_expires_idx").on(table.expiresAt),
}));
