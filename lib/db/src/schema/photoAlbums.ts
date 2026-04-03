import { pgTable, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const photoAlbumsTable = pgTable("photo_albums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  eventSlug: varchar("event_slug"),
  coverPhotoId: varchar("cover_photo_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("pa_org_idx").on(table.orgId),
}));

export const albumPhotosTable = pgTable("album_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  albumId: varchar("album_id").notNull(),
  orgId: varchar("org_id").notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  albumIdx: index("ap_album_idx").on(table.albumId),
}));

export type PhotoAlbum = typeof photoAlbumsTable.$inferSelect;
export type InsertPhotoAlbum = typeof photoAlbumsTable.$inferInsert;
export type AlbumPhoto = typeof albumPhotosTable.$inferSelect;
export type InsertAlbumPhoto = typeof albumPhotosTable.$inferInsert;
