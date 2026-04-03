import { pgTable, text, varchar, boolean, integer, real, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventsTable = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  slug: varchar("slug").notNull(),
  description: text("description"),
  eventType: varchar("event_type"),
  status: varchar("status").default("draft"),
  startDate: varchar("start_date"),
  endDate: varchar("end_date"),
  startTime: varchar("start_time"),
  endTime: varchar("end_time"),
  location: text("location"),
  maxCapacity: integer("max_capacity"),
  isTicketed: boolean("is_ticketed").default(false),
  ticketPrice: real("ticket_price"),
  ticketCapacity: integer("ticket_capacity"),
  hasRegistration: boolean("has_registration").default(false),
  requiresApproval: boolean("requires_approval").default(false),
  isRecurring: boolean("is_recurring").default(false),
  recurringTemplateId: varchar("recurring_template_id"),
  isActive: boolean("is_active").default(true),
  featured: boolean("featured").default(false),
  imageUrl: text("image_url"),
  showOnPublicSite: boolean("show_on_public_site").default(true),
  featuredOnSite: boolean("featured_on_site").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgSlugIdx: uniqueIndex("event_org_slug_idx").on(table.orgId, table.slug),
  orgIdx: index("event_org_idx").on(table.orgId),
}));

export const ticketTypesTable = pgTable("ticket_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull().default(0),
  quantity: integer("quantity"),
  sold: integer("sold").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("tt_event_idx").on(table.eventId),
}));

export const ticketSalesTable = pgTable("ticket_sales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  ticketTypeId: varchar("ticket_type_id"),
  orgId: varchar("org_id").notNull(),
  attendeeName: text("attendee_name").notNull(),
  attendeeEmail: text("attendee_email"),
  attendeePhone: text("attendee_phone"),
  quantity: integer("quantity").notNull().default(1),
  amountPaid: real("amount_paid").notNull().default(0),
  platformFee: real("platform_fee").notNull().default(0),
  paymentMethod: varchar("payment_method").default("manual"),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  paymentStatus: varchar("payment_status").default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("ts_event_idx").on(table.eventId),
  orgIdx: index("ts_org_idx").on(table.orgId),
  checkoutIdx: index("ts_checkout_idx").on(table.stripeCheckoutSessionId),
  paymentIntentIdx: index("ts_payment_intent_idx").on(table.stripePaymentIntentId),
}));

export const eventApprovalsTable = pgTable("event_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  orgId: varchar("org_id").notNull(),
  approverUserId: varchar("approver_user_id"),
  submittedByUserId: varchar("submitted_by_user_id"),
  status: varchar("status").notNull().default("pending"),
  comments: text("comments"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  eventIdx: index("ea_event_idx").on(table.eventId),
  orgIdx: index("ea_org_idx").on(table.orgId),
}));

export const eventCommunicationsTable = pgTable("event_communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  orgId: varchar("org_id").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventIdx: index("ec_event_idx").on(table.eventId),
}));

export const recurringEventTemplatesTable = pgTable("recurring_event_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  eventType: varchar("event_type"),
  location: text("location"),
  startTime: varchar("start_time"),
  durationMinutes: integer("duration_minutes"),
  frequency: varchar("frequency").notNull(),
  dayOfWeek: integer("day_of_week"),
  weekOfMonth: integer("week_of_month"),
  dayOfMonth: integer("day_of_month"),
  isActive: boolean("is_active").notNull().default(true),
  lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
  nextGenerateAt: timestamp("next_generate_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("ret_org_idx").on(table.orgId),
  nextGenerateIdx: index("ret_next_generate_idx").on(table.nextGenerateAt),
}));

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = typeof eventsTable.$inferInsert;
export type TicketType = typeof ticketTypesTable.$inferSelect;
export type InsertTicketType = typeof ticketTypesTable.$inferInsert;
export type TicketSale = typeof ticketSalesTable.$inferSelect;
export type InsertTicketSale = typeof ticketSalesTable.$inferInsert;
export type EventApproval = typeof eventApprovalsTable.$inferSelect;
export type InsertEventApproval = typeof eventApprovalsTable.$inferInsert;
export type EventCommunication = typeof eventCommunicationsTable.$inferSelect;
export type InsertEventCommunication = typeof eventCommunicationsTable.$inferInsert;
export type RecurringEventTemplate = typeof recurringEventTemplatesTable.$inferSelect;
export type InsertRecurringEventTemplate = typeof recurringEventTemplatesTable.$inferInsert;
