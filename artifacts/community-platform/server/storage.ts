import { eq, and, desc } from "drizzle-orm";
import { db } from "./db.js";
import {
  csOrgConfigs, csAdminUsers, csEvents, csSponsors, csBusinesses,
  csContactMessages, csPhotoAlbums, csAlbumPhotos, csVendorRegistrations,
  csSponsorshipInquiries, csSiteContent, csRegistrationSettings,
  csNewsletterSubscribers, csBlogPosts, csTicketPurchases,
} from "./schema.js";

export async function getOrgConfig(orgId: string) {
  const rows = await db.select().from(csOrgConfigs).where(eq(csOrgConfigs.orgId, orgId)).limit(1);
  return rows[0] || null;
}

export async function upsertOrgConfig(orgId: string, data: Partial<typeof csOrgConfigs.$inferInsert>) {
  const existing = await getOrgConfig(orgId);
  if (existing) {
    await db.update(csOrgConfigs).set({ ...data, updatedAt: new Date() }).where(eq(csOrgConfigs.orgId, orgId));
  } else {
    await db.insert(csOrgConfigs).values({ orgId, orgName: data.orgName || "My Organization", ...data });
  }
  return getOrgConfig(orgId);
}

export async function patchOrgConfig(
  orgId: string,
  data: Partial<typeof csOrgConfigs.$inferInsert>,
) {
  const rows = await db
    .update(csOrgConfigs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(csOrgConfigs.orgId, orgId))
    .returning();
  return rows[0] || null;
}

export async function getAdminUser(orgId: string, username: string) {
  const rows = await db.select().from(csAdminUsers).where(and(eq(csAdminUsers.orgId, orgId), eq(csAdminUsers.username, username))).limit(1);
  return rows[0] || null;
}

export async function getAdminUserById(id: string) {
  const rows = await db.select().from(csAdminUsers).where(eq(csAdminUsers.id, id)).limit(1);
  return rows[0] || null;
}

export async function createAdminUser(orgId: string, username: string, hashedPassword: string) {
  const rows = await db.insert(csAdminUsers).values({ orgId, username, password: hashedPassword }).returning();
  return rows[0];
}

export async function getEvents(orgId: string) {
  return db.select().from(csEvents).where(eq(csEvents.orgId, orgId)).orderBy(desc(csEvents.id));
}

export async function getEvent(orgId: string, id: number) {
  const rows = await db.select().from(csEvents).where(and(eq(csEvents.orgId, orgId), eq(csEvents.id, id))).limit(1);
  return rows[0] || null;
}

export async function getEventBySlug(orgId: string, slug: string) {
  const rows = await db.select().from(csEvents).where(and(eq(csEvents.orgId, orgId), eq(csEvents.slug, slug))).limit(1);
  return rows[0] || null;
}

export async function createEvent(orgId: string, data: Omit<typeof csEvents.$inferInsert, "id" | "orgId">) {
  const rows = await db.insert(csEvents).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function updateEvent(orgId: string, id: number, data: Partial<typeof csEvents.$inferInsert>) {
  const rows = await db.update(csEvents).set(data).where(and(eq(csEvents.orgId, orgId), eq(csEvents.id, id))).returning();
  return rows[0] || null;
}

export async function deleteEvent(orgId: string, id: number) {
  const rows = await db.delete(csEvents).where(and(eq(csEvents.orgId, orgId), eq(csEvents.id, id))).returning();
  return rows.length > 0;
}

export async function updateEventBySlug(
  orgId: string,
  slug: string,
  data: Partial<typeof csEvents.$inferInsert>,
) {
  const rows = await db
    .update(csEvents)
    .set(data)
    .where(and(eq(csEvents.orgId, orgId), eq(csEvents.slug, slug)))
    .returning();
  return rows[0] || null;
}

export async function deleteEventBySlug(orgId: string, slug: string) {
  const rows = await db
    .delete(csEvents)
    .where(and(eq(csEvents.orgId, orgId), eq(csEvents.slug, slug)))
    .returning();
  return rows.length > 0;
}

export async function getSponsors(orgId: string) {
  return db.select().from(csSponsors).where(eq(csSponsors.orgId, orgId));
}

export async function getSponsorsByEvent(orgId: string, eventType: string) {
  return db.select().from(csSponsors).where(and(eq(csSponsors.orgId, orgId), eq(csSponsors.eventType, eventType)));
}

export async function createSponsor(orgId: string, data: Omit<typeof csSponsors.$inferInsert, "id" | "orgId">) {
  const rows = await db.insert(csSponsors).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function updateSponsor(orgId: string, id: number, data: Partial<typeof csSponsors.$inferInsert>) {
  const rows = await db.update(csSponsors).set(data).where(and(eq(csSponsors.orgId, orgId), eq(csSponsors.id, id))).returning();
  return rows[0] || null;
}

export async function deleteSponsor(orgId: string, id: number) {
  const rows = await db.delete(csSponsors).where(and(eq(csSponsors.orgId, orgId), eq(csSponsors.id, id))).returning();
  return rows.length > 0;
}

export async function getBusinesses(orgId: string) {
  return db.select().from(csBusinesses).where(eq(csBusinesses.orgId, orgId));
}

export async function createBusiness(orgId: string, data: Omit<typeof csBusinesses.$inferInsert, "id" | "orgId">) {
  const rows = await db.insert(csBusinesses).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function updateBusiness(orgId: string, id: number, data: Partial<typeof csBusinesses.$inferInsert>) {
  const rows = await db.update(csBusinesses).set(data).where(and(eq(csBusinesses.orgId, orgId), eq(csBusinesses.id, id))).returning();
  return rows[0] || null;
}

export async function deleteBusiness(orgId: string, id: number) {
  const rows = await db.delete(csBusinesses).where(and(eq(csBusinesses.orgId, orgId), eq(csBusinesses.id, id))).returning();
  return rows.length > 0;
}

export async function createContactMessage(orgId: string, data: Omit<typeof csContactMessages.$inferInsert, "id" | "orgId" | "createdAt">) {
  const rows = await db.insert(csContactMessages).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function getContactMessages(orgId: string) {
  return db.select().from(csContactMessages).where(eq(csContactMessages.orgId, orgId)).orderBy(desc(csContactMessages.createdAt));
}

export async function getPhotoAlbums(orgId: string) {
  return db.select().from(csPhotoAlbums).where(eq(csPhotoAlbums.orgId, orgId)).orderBy(desc(csPhotoAlbums.createdAt));
}

export async function getPhotoAlbum(orgId: string, id: number) {
  const rows = await db.select().from(csPhotoAlbums).where(and(eq(csPhotoAlbums.orgId, orgId), eq(csPhotoAlbums.id, id))).limit(1);
  return rows[0] || null;
}

export async function createPhotoAlbum(orgId: string, data: Omit<typeof csPhotoAlbums.$inferInsert, "id" | "orgId" | "createdAt">) {
  const rows = await db.insert(csPhotoAlbums).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function getAlbumPhotos(orgId: string, albumId: number) {
  return db.select().from(csAlbumPhotos).where(and(eq(csAlbumPhotos.orgId, orgId), eq(csAlbumPhotos.albumId, albumId)));
}

export async function createAlbumPhoto(orgId: string, data: Omit<typeof csAlbumPhotos.$inferInsert, "id" | "orgId">) {
  const rows = await db.insert(csAlbumPhotos).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function getVendorRegistrations(orgId: string, eventType?: string) {
  if (eventType) {
    return db.select().from(csVendorRegistrations).where(and(eq(csVendorRegistrations.orgId, orgId), eq(csVendorRegistrations.eventType, eventType)));
  }
  return db.select().from(csVendorRegistrations).where(eq(csVendorRegistrations.orgId, orgId));
}

export async function createVendorRegistration(orgId: string, data: Omit<typeof csVendorRegistrations.$inferInsert, "id" | "orgId" | "createdAt">) {
  const rows = await db.insert(csVendorRegistrations).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function getSponsorshipInquiries(orgId: string) {
  return db.select().from(csSponsorshipInquiries).where(eq(csSponsorshipInquiries.orgId, orgId));
}

export async function createSponsorshipInquiry(orgId: string, data: Omit<typeof csSponsorshipInquiries.$inferInsert, "id" | "orgId" | "createdAt">) {
  const rows = await db.insert(csSponsorshipInquiries).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function getAllSiteContent(orgId: string) {
  return db.select().from(csSiteContent).where(eq(csSiteContent.orgId, orgId));
}

export async function upsertSiteContent(orgId: string, key: string, value: string) {
  const existing = await db.select().from(csSiteContent).where(and(eq(csSiteContent.orgId, orgId), eq(csSiteContent.key, key))).limit(1);
  if (existing.length > 0) {
    const rows = await db.update(csSiteContent).set({ value, updatedAt: new Date() }).where(and(eq(csSiteContent.orgId, orgId), eq(csSiteContent.key, key))).returning();
    return rows[0];
  }
  const rows = await db.insert(csSiteContent).values({ orgId, key, value }).returning();
  return rows[0];
}

export async function getRegistrationSettings(orgId: string, eventType: string) {
  const rows = await db.select().from(csRegistrationSettings).where(and(eq(csRegistrationSettings.orgId, orgId), eq(csRegistrationSettings.eventType, eventType))).limit(1);
  return rows[0] || null;
}

export async function upsertRegistrationSettings(orgId: string, eventType: string, data: Partial<typeof csRegistrationSettings.$inferInsert>) {
  const existing = await getRegistrationSettings(orgId, eventType);
  if (existing) {
    const rows = await db.update(csRegistrationSettings).set(data).where(and(eq(csRegistrationSettings.orgId, orgId), eq(csRegistrationSettings.eventType, eventType))).returning();
    return rows[0];
  }
  const rows = await db.insert(csRegistrationSettings).values({ orgId, eventType, ...data }).returning();
  return rows[0];
}

export async function getNewsletterSubscribers(orgId: string) {
  return db.select().from(csNewsletterSubscribers).where(eq(csNewsletterSubscribers.orgId, orgId));
}

export async function getSubscriberByEmail(orgId: string, email: string) {
  const rows = await db.select().from(csNewsletterSubscribers).where(and(eq(csNewsletterSubscribers.orgId, orgId), eq(csNewsletterSubscribers.email, email))).limit(1);
  return rows[0] || null;
}

export async function createSubscriber(orgId: string, data: Omit<typeof csNewsletterSubscribers.$inferInsert, "id" | "orgId" | "subscribedAt">) {
  const rows = await db.insert(csNewsletterSubscribers).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function updateSubscriber(orgId: string, id: number, data: Partial<typeof csNewsletterSubscribers.$inferInsert>) {
  const rows = await db.update(csNewsletterSubscribers).set(data).where(and(eq(csNewsletterSubscribers.orgId, orgId), eq(csNewsletterSubscribers.id, id))).returning();
  return rows[0] || null;
}

export async function getBlogPosts(orgId: string, publishedOnly = true) {
  const rows = await db.select().from(csBlogPosts).where(eq(csBlogPosts.orgId, orgId)).orderBy(desc(csBlogPosts.createdAt));
  return publishedOnly ? rows.filter(p => p.published) : rows;
}

export async function getBlogPost(orgId: string, id: number) {
  const rows = await db.select().from(csBlogPosts).where(and(eq(csBlogPosts.orgId, orgId), eq(csBlogPosts.id, id))).limit(1);
  return rows[0] || null;
}

export async function getBlogPostBySlug(orgId: string, slug: string) {
  const rows = await db.select().from(csBlogPosts).where(and(eq(csBlogPosts.orgId, orgId), eq(csBlogPosts.slug, slug))).limit(1);
  return rows[0] || null;
}

export async function createBlogPost(orgId: string, data: Omit<typeof csBlogPosts.$inferInsert, "id" | "orgId" | "createdAt" | "updatedAt">) {
  const rows = await db.insert(csBlogPosts).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function updateBlogPost(orgId: string, id: number, data: Partial<typeof csBlogPosts.$inferInsert>) {
  const rows = await db.update(csBlogPosts).set({ ...data, updatedAt: new Date() }).where(and(eq(csBlogPosts.orgId, orgId), eq(csBlogPosts.id, id))).returning();
  return rows[0] || null;
}

export async function deleteBlogPost(orgId: string, id: number) {
  const rows = await db.delete(csBlogPosts).where(and(eq(csBlogPosts.orgId, orgId), eq(csBlogPosts.id, id))).returning();
  return rows.length > 0;
}

export async function createTicketPurchase(orgId: string, data: Omit<typeof csTicketPurchases.$inferInsert, "id" | "orgId" | "purchasedAt">) {
  const rows = await db.insert(csTicketPurchases).values({ ...data, orgId }).returning();
  return rows[0];
}

export async function getTicketPurchasesByEvent(orgId: string, eventId: number) {
  return db.select().from(csTicketPurchases).where(and(eq(csTicketPurchases.orgId, orgId), eq(csTicketPurchases.eventId, eventId)));
}

export async function getTicketsSoldForEvent(orgId: string, eventId: number) {
  const purchases = await db.select().from(csTicketPurchases).where(and(eq(csTicketPurchases.orgId, orgId), eq(csTicketPurchases.eventId, eventId)));
  return purchases.filter(p => p.status !== "cancelled").reduce((sum, p) => sum + (p.quantity || 0), 0);
}
