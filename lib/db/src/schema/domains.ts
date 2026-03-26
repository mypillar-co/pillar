import { pgTable, varchar, timestamp, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const domainsTable = pgTable("domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  domain: varchar("domain").notNull(),
  tld: varchar("tld").notNull().default("com"),
  status: varchar("status").notNull().default("pending"),
  // pending | active | expired | failed | pending_manual
  registrarRef: varchar("registrar_ref"),
  stripePaymentId: varchar("stripe_payment_id"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  autoRenew: varchar("auto_renew").default("true"),
  nameservers: text("nameservers"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("domains_org_idx").on(table.orgId),
  domainUniqueIdx: uniqueIndex("domains_domain_unique_idx").on(table.domain),
}));

export type Domain = typeof domainsTable.$inferSelect;
