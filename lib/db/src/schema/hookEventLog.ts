import { pgTable, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const hookEventLogTable = pgTable("hook_event_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id"),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  hookPayload: jsonb("hook_payload").$type<Record<string, unknown>>().notNull(),
  priority: varchar("priority", { length: 20 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  actionTaken: varchar("action_taken", { length: 40 }).notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("hook_event_log_org_idx").on(table.orgId),
  eventTypeIdx: index("hook_event_log_type_idx").on(table.eventType),
  createdAtIdx: index("hook_event_log_created_idx").on(table.createdAt),
}));

export type HookEventLog = typeof hookEventLogTable.$inferSelect;

export const hookCadenceLogTable = pgTable("hook_cadence_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  cadenceKey: varchar("cadence_key", { length: 100 }).notNull(),
  date: text("date").notNull(),
  count: varchar("count", { length: 10 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgCadenceDateIdx: index("hook_cadence_org_key_date_idx").on(table.orgId, table.cadenceKey, table.date),
}));

export type HookCadenceLog = typeof hookCadenceLogTable.$inferSelect;
