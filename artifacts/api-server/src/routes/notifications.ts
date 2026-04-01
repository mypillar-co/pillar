import { Router, type Request, type Response } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";

const router = Router();

// GET /notifications — list notifications (unread first, max 50)
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.orgId, org.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const unreadCount = notifications.filter(n => !n.read).length;
  res.json({ notifications, unreadCount });
});

// PUT /notifications/:id/read — mark a notification as read
router.put("/:id/read", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const id = String(req.params.id);
  const [updated] = await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.orgId, org.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json({ notification: updated });
});

// PUT /notifications/read-all — mark all notifications as read
router.put("/read-all", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.orgId, org.id), eq(notificationsTable.read, false)));

  res.json({ success: true });
});

export default router;
