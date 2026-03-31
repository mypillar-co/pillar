import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const contentQueueTable = pgTable("content_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platform: varchar("platform", { length: 50 }).notNull(),
  content: text("content").notNull(),
  hashtags: text("hashtags"),
  angle: varchar("angle", { length: 100 }),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
});

export type ContentQueueItem = typeof contentQueueTable.$inferSelect;
