import { pgTable, text, timestamp, varchar, integer, boolean, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const organizationsTable = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: varchar("type").notNull(),
  category: varchar("category"),
  tier: varchar("tier"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: varchar("subscription_status"),
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeConnectOnboarded: boolean("stripe_connect_onboarded").default(false),
  isNonprofit: boolean("is_nonprofit").default(false),
  taxIdNumber: varchar("tax_id_number"),
  slug: varchar("slug").unique(),
  aiMessagesUsed: integer("ai_messages_used").notNull().default(0),
  aiMessagesResetAt: timestamp("ai_messages_reset_at", { withTimezone: true }).notNull().defaultNow(),
  storageUsedBytes: real("storage_used_bytes").notNull().default(0),
  shopEmbedCode: text("shop_embed_code"),
  senderEmail: varchar("sender_email"),
  senderName: varchar("sender_name"),
  resendDomainId: varchar("resend_domain_id"),
  senderDomainVerified: boolean("sender_domain_verified").default(false),
  emailForwardAlias: varchar("email_forward_alias"),
  emailForwardDestination: varchar("email_forward_destination"),
  emailForwardActive: boolean("email_forward_active").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
