import { pgTable, varchar, timestamp, text, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const domainsTable = pgTable("domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  domain: varchar("domain").notNull(),
  tld: varchar("tld").notNull().default("com"),
  status: varchar("status").notNull().default("pending"),
  // pending | active | expired | failed | pending_manual
  dnsStatus: varchar("dns_status").notNull().default("pending"),
  // pending | propagating | live
  sslStatus: varchar("ssl_status").notNull().default("pending"),
  // pending | provisioning | active
  isExternal: boolean("is_external").notNull().default(false),
  registrar: varchar("registrar").default("porkbun"),
  registrarRef: varchar("registrar_ref"),
  stripePaymentId: varchar("stripe_payment_id"),
  stripeSessionId: varchar("stripe_session_id"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  autoRenew: boolean("auto_renew").notNull().default(true),
  renewalNotifiedAt: timestamp("renewal_notified_at", { withTimezone: true }),
  nameservers: text("nameservers"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("domains_org_idx").on(table.orgId),
  domainUniqueIdx: uniqueIndex("domains_domain_unique_idx").on(table.domain),
}));

export type Domain = typeof domainsTable.$inferSelect;
