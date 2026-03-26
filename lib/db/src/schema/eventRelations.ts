import { pgTable, varchar, text, real, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventVendorsTable = pgTable("event_vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  eventId: varchar("event_id").notNull(),
  vendorId: varchar("vendor_id").notNull(),
  boothNumber: varchar("booth_number"),
  boothLocation: text("booth_location"),
  feeAmount: real("fee_amount"),
  feeStatus: varchar("fee_status").default("pending"),
  status: varchar("status").default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  eventVendorIdx: uniqueIndex("event_vendor_unique_idx").on(table.eventId, table.vendorId),
  eventIdx: index("ev_event_idx").on(table.eventId),
}));

export const eventSponsorsTable = pgTable("event_sponsors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  eventId: varchar("event_id").notNull(),
  sponsorId: varchar("sponsor_id").notNull(),
  tier: varchar("tier"),
  amountPledged: real("amount_pledged"),
  amountReceived: real("amount_received"),
  status: varchar("status").default("prospect"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  eventSponsorIdx: uniqueIndex("event_sponsor_unique_idx").on(table.eventId, table.sponsorId),
  eventIdx: index("es_event_idx").on(table.eventId),
}));

export const paymentsTable = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  eventId: varchar("event_id"),
  paymentType: varchar("payment_type"),
  amount: real("amount").notNull(),
  currency: varchar("currency").default("USD"),
  status: varchar("status").default("pending"),
  source: varchar("source"),
  description: text("description"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("payment_org_idx").on(table.orgId),
}));

export type EventVendor = typeof eventVendorsTable.$inferSelect;
export type EventSponsor = typeof eventSponsorsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
