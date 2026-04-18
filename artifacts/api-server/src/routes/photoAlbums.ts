import { Router, type Request, type Response } from "express";
import { db, photoAlbumsTable, albumPhotosTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";

const router = Router();

/**
 * Mirror a dashboard photo album into the community-platform tables
 * (cs_photo_albums) so it shows up on the public {slug}.mypillar.co/gallery page.
 * The two table sets share the same Postgres database but use different ID types
 * (api-server: UUID, CP: serial), so we match by (org_id, title) instead of by id.
 * Best-effort — failure must not block the dashboard write.
 */
async function ensurePillarAlbum(
  orgId: string,
  title: string,
  description: string | null,
): Promise<number | null> {
  try {
    const existing = await db.execute(sql`
      SELECT id FROM cs_photo_albums
      WHERE org_id = ${orgId} AND title = ${title}
      ORDER BY id LIMIT 1
    `);
    if (existing.rows[0]) return Number((existing.rows[0] as { id: number }).id);

    const inserted = await db.execute(sql`
      INSERT INTO cs_photo_albums (org_id, title, description)
      VALUES (${orgId}, ${title}, ${description})
      RETURNING id
    `);
    return inserted.rows[0] ? Number((inserted.rows[0] as { id: number }).id) : null;
  } catch (err) {
    console.warn("[photoAlbums] mirror album to community site failed:", err);
    return null;
  }
}

async function mirrorPhotosToPillar(
  orgId: string,
  csAlbumId: number,
  photos: { url: string; caption?: string }[],
): Promise<void> {
  try {
    for (const p of photos) {
      await db.execute(sql`
        INSERT INTO cs_album_photos (org_id, album_id, url, caption)
        VALUES (${orgId}, ${csAlbumId}, ${p.url}, ${p.caption?.trim() ?? null})
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
    const csAlbumId = await ensurePillarAlbum(orgId, album.title, album.description ?? null);
    if (csAlbumId) await mirrorPhotosToPillar(orgId, csAlbumId, photos);
  })();

  scheduleSiteAutoUpdate(orgId).catch(() => {});
  res.status(201).json(inserted);
});

export default router;
