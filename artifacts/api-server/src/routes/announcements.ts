import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";

const router = Router();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function publicOrgId(req: Request): string | null {
  return text(req.headers["x-org-id"]) || text(req.query.orgId) || text(req.query.org);
}

async function publicOrgIds(orgId: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT id, slug
    FROM organizations
    WHERE id = ${orgId} OR slug = ${orgId}
    LIMIT 1
  `);
  const row = rows.rows[0] as Record<string, unknown> | undefined;
  const ids = new Set<string>([orgId]);
  const id = text(row?.id);
  const slug = text(row?.slug);
  if (id) ids.add(id);
  if (slug) ids.add(slug);
  return [...ids];
}

router.get("/", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    const orgId = publicOrgId(req);
    if (!orgId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const orgIds = await publicOrgIds(orgId);
    const rows = await db.execute(sql`
      SELECT id, title, body, status, visibility, created_at
      FROM cs_announcements
      WHERE org_id IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})
        AND status = 'published'
        AND visibility IN ('public', 'both')
      ORDER BY created_at DESC
      LIMIT 5
    `);
    res.json(rows.rows);
    return;
  }

  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const orgSlug = (org as { slug?: string | null }).slug ?? null;
  const orgIds = orgSlug && orgSlug !== org.id ? [org.id, orgSlug] : [org.id];
  const rows = await db.execute(sql`
    SELECT id, title, body, status, visibility, created_at
    FROM cs_announcements
    WHERE org_id IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY created_at DESC
  `);
  res.json(rows.rows);
});

router.post("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const { title, body, visibility } = (req.body ?? {}) as { title?: string; body?: string; visibility?: string };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "Title and body are required" });
    return;
  }
  const nextVisibility = visibility === "public" || visibility === "members" || visibility === "both"
    ? visibility
    : "both";
  const orgSlug = (org as { slug?: string | null }).slug || org.id;
  const rows = await db.execute(sql`
    INSERT INTO cs_announcements (org_id, title, body, status, visibility)
    VALUES (${orgSlug}, ${title.trim()}, ${body.trim()}, 'published', ${nextVisibility})
    RETURNING id, title, body, status, visibility, created_at
  `);
  res.status(201).json(rows.rows[0]);
});

router.put("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { title, body, visibility } = (req.body ?? {}) as { title?: string; body?: string; visibility?: string };
  const nextTitle = text(title);
  const nextBody = text(body);
  const nextVisibility = visibility === "public" || visibility === "members" || visibility === "both"
    ? visibility
    : undefined;
  if (!nextTitle && !nextBody && !nextVisibility) {
    res.status(400).json({ error: "No announcement changes provided" });
    return;
  }
  const orgSlug = (org as { slug?: string | null }).slug ?? null;
  const orgIds = orgSlug && orgSlug !== org.id ? [org.id, orgSlug] : [org.id];
  const rows = await db.execute(sql`
    UPDATE cs_announcements
    SET
      title = COALESCE(${nextTitle || null}, title),
      body = COALESCE(${nextBody || null}, body),
      visibility = COALESCE(${nextVisibility || null}, visibility)
    WHERE id = ${id}
      AND org_id IN (${sql.join(orgIds.map((orgId) => sql`${orgId}`), sql`, `)})
    RETURNING id, title, body, status, visibility, created_at
  `);
  const row = rows.rows[0];
  if (!row) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  res.json(row);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const orgSlug = (org as { slug?: string | null }).slug ?? null;
  const orgIds = orgSlug && orgSlug !== org.id ? [org.id, orgSlug] : [org.id];
  await db.execute(sql`
    DELETE FROM cs_announcements
    WHERE id = ${id}
      AND org_id IN (${sql.join(orgIds.map((orgId) => sql`${orgId}`), sql`, `)})
  `);
  res.status(204).send();
});

export default router;
