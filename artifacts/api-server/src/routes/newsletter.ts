import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";

const router = Router();

router.get("/subscribers", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const rows = await db.execute(sql`
    SELECT id, email, first_name, status, subscribed_at, unsubscribed_at
    FROM cs_newsletter_subscribers
    WHERE org_id = ${org.id}
    ORDER BY subscribed_at DESC NULLS LAST
  `);

  const all = rows.rows as Array<{ status: string }>;
  const activeCount = all.filter((r) => r.status === "active").length;

  res.json({
    count: all.length,
    activeCount,
    subscribers: rows.rows,
  });
});

export default router;
