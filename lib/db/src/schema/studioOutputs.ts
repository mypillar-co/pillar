import { pgTable, varchar, timestamp, text, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const studioOutputsTable = pgTable("studio_outputs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  taskId: varchar("task_id").notNull(),
  taskLabel: varchar("task_label", { length: 200 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  inputSummary: text("input_summary"),
  output: text("output").notNull(),
  packId: varchar("pack_id", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("studio_outputs_org_idx").on(table.orgId),
  orgCreatedIdx: index("studio_outputs_org_created_idx").on(table.orgId, table.createdAt),
}));

export type StudioOutput = typeof studioOutputsTable.$inferSelect;
