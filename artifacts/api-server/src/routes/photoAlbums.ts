import { Router, type Request, type Response } from "express";
import { db, photoAlbumsTable, albumPhotosTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { resolveOrgId as resolveOrg } from "../lib/resolveOrg";
import { scheduleSiteAutoUpdate } from "../lib/scheduleSiteAutoUpdate";

const router = Router();

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

  scheduleSiteAutoUpdate(orgId).catch(() => {});
  res.status(201).json(inserted);
});

export default router;
