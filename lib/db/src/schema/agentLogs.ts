import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const agentLogsTable = pgTable("agent_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  action: varchar("action", { length: 200 }).notNull(),
  targetId: varchar("target_id"),
  targetEmail: varchar("target_email"),
  status: varchar("status", { length: 50 }).notNull().default("success"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AgentLog = typeof agentLogsTable.$inferSelect;
