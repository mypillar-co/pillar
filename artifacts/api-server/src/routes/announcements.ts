import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const rows = await db.execute(sql`
    SELECT id, title, body, created_at
    FROM cs_announcements
    WHERE org_id = ${org.id}
    ORDER BY created_at DESC
  `);
  res.json(rows.rows);
});

router.post("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const { title, body } = (req.body ?? {}) as { title?: string; body?: string };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "Title and body are required" });
    return;
  }
  const rows = await db.execute(sql`
    INSERT INTO cs_announcements (org_id, title, body)
    VALUES (${org.id}, ${title.trim()}, ${body.trim()})
    RETURNING id, title, body, created_at
  `);
  res.status(201).json(rows.rows[0]);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.execute(sql`
    DELETE FROM cs_announcements WHERE id = ${id} AND org_id = ${org.id}
  `);
  res.status(204).send();
});

export default router;
