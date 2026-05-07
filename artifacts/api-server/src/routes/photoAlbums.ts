import { Router, type Request, type Response } from "express";
import { db, photoAlbumsTable, albumPhotosTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";

const router = Router();

/**
 * Mirror a dashboard photo album into the community-platform tables
 * (cs_photo_albums) so it shows up on the public {slug}.mypillar.co/gallery page.
 * The two table sets share the same Postgres database but use different ID schemes:
 *   - api-server tables (photo_albums, album_photos): org_id = organizations.id (UUID)
 *   - public-site tables (cs_*): org_id = organizations.slug (string slug)
 * So we look up the slug and use it as org_id for the CP rows. The CP album id
 * is a separate serial, so we match by (slug + title) to be idempotent.
 * Best-effort — failure must not block the dashboard write.
 */
async function getOrgSlug(orgIdUuid: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT slug FROM organizations WHERE id = ${orgIdUuid} LIMIT 1`);
  return r.rows[0] ? String((r.rows[0] as { slug: string }).slug) : null;
}

async function ensurePillarAlbum(
  orgIdUuid: string,
  title: string,
  description: string | null,
): Promise<{ csAlbumId: number; orgSlug: string } | null> {
  try {
    const orgSlug = await getOrgSlug(orgIdUuid);
    if (!orgSlug) {
      console.warn("[photoAlbums] mirror skipped — no slug for org", orgIdUuid);
      return null;
    }

    const existing = await db.execute(sql`
      SELECT id FROM cs_photo_albums
      WHERE org_id = ${orgSlug} AND title = ${title}
      ORDER BY id LIMIT 1
    `);
    if (existing.rows[0]) {
      return { csAlbumId: Number((existing.rows[0] as { id: number }).id), orgSlug };
    }

    const inserted = await db.execute(sql`
      INSERT INTO cs_photo_albums (org_id, title, description)
      VALUES (${orgSlug}, ${title}, ${description})
      RETURNING id
    `);
    return inserted.rows[0]
      ? { csAlbumId: Number((inserted.rows[0] as { id: number }).id), orgSlug }
      : null;
  } catch (err) {
    console.warn("[photoAlbums] mirror album to community site failed:", err);
    return null;
  }
}

async function mirrorPhotosToPillar(
  orgSlug: string,
  csAlbumId: number,
  photos: { url: string; caption?: string }[],
): Promise<void> {
  try {
    for (const p of photos) {
      await db.execute(sql`
        INSERT INTO cs_album_photos (org_id, album_id, url, caption)
        VALUES (${orgSlug}, ${csAlbumId}, ${p.url}, ${p.caption?.trim() ?? null})
      `);
    }
    await db.execute(sql`
      UPDATE cs_photo_albums
      SET cover_photo_url = (
        SELECT url FROM cs_album_photos WHERE album_id = ${csAlbumId} ORDER BY id LIMIT 1
      )
      WHERE id = ${csAlbumId} AND (cover_photo_url IS NULL OR cover_photo_url = '')
    `);
  } catch (err) {
    console.warn("[photoAlbums] mirror photos to community site failed:", err);
  }
}

// GET /api/photo-albums
router.get("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const albums = await db
    .select()
    .from(photoAlbumsTable)
    .where(eq(photoAlbumsTable.orgId, orgId))
    .orderBy(desc(photoAlbumsTable.createdAt));
  res.json(albums);
});

// GET /api/photo-albums/:albumId/photos
router.get("/:albumId/photos", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;

  const { albumId } = req.params;
  const [album] = await db
    .select({ id: photoAlbumsTable.id })
    .from(photoAlbumsTable)
    .where(and(eq(photoAlbumsTable.id, albumId), eq(photoAlbumsTable.orgId, orgId)))
    .limit(1);
  if (!album) {
    res.status(404).json({ error: "album not found" });
    return;
  }

  const photos = await db
    .select()
    .from(albumPhotosTable)
    .where(and(eq(albumPhotosTable.albumId, albumId), eq(albumPhotosTable.orgId, orgId)))
    .orderBy(desc(albumPhotosTable.createdAt));
  res.json(photos);
});

// POST /api/photo-albums
router.post("/", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const { title, description } = req.body as { title?: string; description?: string };
  if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }
  const [album] = await db.insert(photoAlbumsTable).values({
    orgId,
    title: title.trim(),
    description: description?.trim() ?? null,
  }).returning();

  void ensurePillarAlbum(orgId, album.title, album.description ?? null);

  res.status(201).json(album);
});

// POST /api/photo-albums/:albumId/photos
router.post("/:albumId/photos", async (req: Request, res: Response) => {
  const orgId = await resolveOrg(req, res);
  if (!orgId) return;
  const { albumId } = req.params;
  const { photos } = req.body as { photos?: { url: string; caption?: string }[] };
  if (!photos?.length) { res.status(400).json({ error: "photos array is required" }); return; }

  // Verify album belongs to this org
  const [album] = await db
    .select()
    .from(photoAlbumsTable)
    .where(eq(photoAlbumsTable.id, albumId))
    .limit(1);
  if (!album || album.orgId !== orgId) { res.status(404).json({ error: "album not found" }); return; }

  const inserted = await db.insert(albumPhotosTable).values(
    photos.map(p => ({
      albumId,
      orgId,
      url: p.url,
      caption: p.caption?.trim() ?? null,
    }))
  ).returning();

  // If album has no cover yet, set the first uploaded photo as cover
  if (!album.coverPhotoId && inserted[0]) {
    await db.update(photoAlbumsTable)
      .set({ coverPhotoId: inserted[0].id })
      .where(eq(photoAlbumsTable.id, albumId));
  }

  // Mirror to community-platform tables so uploaded photos appear on the public site.
  void (async () => {
    const mirror = await ensurePillarAlbum(orgId, album.title, album.description ?? null);
    if (mirror) await mirrorPhotosToPillar(mirror.orgSlug, mirror.csAlbumId, photos);
  })();

  scheduleSiteAutoUpdate(orgId).catch(() => {});
  res.status(201).json(inserted);
});

export default router;
