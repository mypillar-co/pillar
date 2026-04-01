import { pgTable, text, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const registrationsTable = pgTable("registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  type: varchar("type").notNull(), // "vendor" | "sponsor"
  status: varchar("status").notNull().default("pending_payment"),
  // "pending_payment" → "pending_approval" → "approved" | "rejected"

  // Applicant info
  name: text("name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  website: text("website"),
  logoUrl: text("logo_url"),
  description: text("description"),

  // Sponsor-specific
  tier: varchar("tier"), // "Gold" | "Silver" | "Bronze" | "Presenting"

  // Vendor-specific
  vendorType: varchar("vendor_type"), // "food" | "merchandise" | "service" | "entertainment" | "other"

  // Payment
  feeAmount: integer("fee_amount").notNull().default(0), // in cents
  stripeSessionId: varchar("stripe_session_id"),
  stripePaymentStatus: varchar("stripe_payment_status").notNull().default("unpaid"), // "unpaid" | "paid" | "waived"
  paidAt: timestamp("paid_at", { withTimezone: true }),

  // Approval
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),

  // Links to created records (set on approval)
  sponsorId: varchar("sponsor_id"),
  vendorId: varchar("vendor_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("registration_org_idx").on(table.orgId),
  statusIdx: index("registration_status_idx").on(table.status),
}));

export type Registration = typeof registrationsTable.$inferSelect;
export type InsertRegistration = typeof registrationsTable.$inferInsert;
