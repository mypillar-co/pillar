import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, serial, jsonb } from "drizzle-orm/pg-core";

export const csOrgConfigs = pgTable("cs_org_configs", {
  orgId: text("org_id").primaryKey(),
  orgName: text("org_name").notNull(),
  shortName: text("short_name"),
  orgType: text("org_type").default("community"),
  tagline: text("tagline"),
  mission: text("mission"),
  location: text("location"),
  primaryColor: text("primary_color").default("#c25038"),
  accentColor: text("accent_color").default("#2563eb"),
  logoUrl: text("logo_url"),
  heroImageUrl: text("hero_image_url"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactAddress: text("contact_address"),
  mailingAddress: text("mailing_address"),
  website: text("website"),
  socialFacebook: text("social_facebook"),
  socialInstagram: text("social_instagram"),
  socialTwitter: text("social_twitter"),
  socialLinkedin: text("social_linkedin"),
  meetingDay: text("meeting_day"),
  meetingTime: text("meeting_time"),
  meetingLocation: text("meeting_location"),
  footerText: text("footer_text"),
  metaDescription: text("meta_description"),
  stats: jsonb("stats").default([]),
  programs: jsonb("programs").default([]),
  partners: jsonb("partners").default([]),
  sponsorshipLevels: jsonb("sponsorship_levels").default([]),
  features: jsonb("features").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const csAdminUsers = pgTable("cs_admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
});

export const csEvents = pgTable("cs_events", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug"),
  description: text("description").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  location: text("location").notNull(),
  category: text("category").notNull(),
  featured: boolean("featured").default(false),
  showInNav: boolean("show_in_nav").default(false),
  hasRegistration: boolean("has_registration").default(false),
  imageUrl: text("image_url"),
  posterImageUrl: text("poster_image_url"),
  externalLink: text("external_link"),
  isActive: boolean("is_active").default(true),
  isTicketed: boolean("is_ticketed").default(false),
  ticketPrice: text("ticket_price"),
  ticketCapacity: integer("ticket_capacity"),
  membersOnly: boolean("members_only").default(false),
});

export const csSponsors = pgTable("cs_sponsors", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  eventType: text("event_type").default("general"),
});

export const csBusinesses = pgTable("cs_businesses", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  website: text("website"),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
});

export const csContactMessages = pgTable("cs_contact_messages", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const csPhotoAlbums = pgTable("cs_photo_albums", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  coverPhotoUrl: text("cover_photo_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const csAlbumPhotos = pgTable("cs_album_photos", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  albumId: integer("album_id").notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").default(0),
});

export const csVendorRegistrations = pgTable("cs_vendor_registrations", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  eventType: text("event_type").notNull(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  vendorCategory: text("vendor_category").notNull(),
  description: text("description"),
  specialRequests: text("special_requests"),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const csSponsorshipInquiries = pgTable("cs_sponsorship_inquiries", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  level: text("level").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const csSiteContent = pgTable("cs_site_content", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const csRegistrationSettings = pgTable("cs_registration_settings", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date"),
  vendorRegistrationClosed: boolean("vendor_registration_closed").default(false),
  sponsorRegistrationClosed: boolean("sponsor_registration_closed").default(false),
  vendorRegistrationForceOpen: boolean("vendor_registration_force_open").default(false),
  sponsorRegistrationForceOpen: boolean("sponsor_registration_force_open").default(false),
  ticketSalesClosed: boolean("ticket_sales_closed").default(false),
  ticketSalesForceOpen: boolean("ticket_sales_force_open").default(false),
});

export const csNewsletterSubscribers = pgTable("cs_newsletter_subscribers", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  status: text("status").notNull().default("active"),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at"),
});

export const csBlogPosts = pgTable("cs_blog_posts", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImageUrl: text("cover_image_url"),
  category: text("category").default("News"),
  author: text("author"),
  published: boolean("published").default(false),
  publishedAt: timestamp("published_at"),
  membersOnly: boolean("members_only").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const csTicketPurchases = pgTable("cs_ticket_purchases", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  eventId: integer("event_id").notNull(),
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  quantity: integer("quantity").notNull(),
  totalAmount: integer("total_amount").notNull(),
  paymentOrderId: text("payment_order_id"),
  confirmationNumber: text("confirmation_number").notNull(),
  status: text("status").notNull().default("pending"),
  purchasedAt: timestamp("purchased_at").defaultNow(),
});
