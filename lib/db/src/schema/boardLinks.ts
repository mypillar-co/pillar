import { pgTable, text, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const boardApprovalLinksTable = pgTable("board_approval_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  token: varchar("token").notNull().unique(),
  createdByUserId: varchar("created_by_user_id").notNull(),
  orgName: text("org_name"),
  orgType: text("org_type"),
  message: text("message"),
  viewCount: integer("view_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("board_link_org_idx").on(table.orgId),
  tokenIdx: index("board_link_token_idx").on(table.token),
}));

export const boardApprovalVotesTable = pgTable("board_approval_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  linkId: varchar("link_id").notNull(),
  voterName: text("voter_name").notNull(),
  voterEmail: varchar("voter_email"),
  vote: varchar("vote").notNull(), // 'approve' | 'question' | 'decline'
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  linkIdx: index("board_vote_link_idx").on(table.linkId),
}));

export type BoardApprovalLink = typeof boardApprovalLinksTable.$inferSelect;
export type InsertBoardApprovalLink = typeof boardApprovalLinksTable.$inferInsert;
export type BoardApprovalVote = typeof boardApprovalVotesTable.$inferSelect;
export type InsertBoardApprovalVote = typeof boardApprovalVotesTable.$inferInsert;
