import { Router, type IRouter, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

// GET /api/organizations — get current user's org
router.get("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));

  res.json({
    organization: org
      ? {
          ...org,
          createdAt: org.createdAt.toISOString(),
        }
      : null,
  });
});

// POST /api/organizations — create or update current user's org
router.post("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, type, category } = req.body as { name?: string; type?: string; category?: string };

  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }

  const userId = req.user.id;

  // Check for existing org
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));

  let org;

  if (existing) {
    [org] = await db
      .update(organizationsTable)
      .set({ name, type, category: category ?? null })
      .where(eq(organizationsTable.userId, userId))
      .returning();
  } else {
    // Generate a unique slug
    const baseSlug = generateSlug(name);
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    [org] = await db
      .insert(organizationsTable)
      .values({
        id: crypto.randomUUID(),
        userId,
        name,
        type,
        category: category ?? null,
        slug,
      })
      .returning();
  }

  res.json({
    organization: {
      ...org,
      createdAt: org.createdAt.toISOString(),
    },
  });
});

// PUT /api/organizations — update current user's org
router.put("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, type } = req.body as { name?: string; type?: string };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const userId = req.user.id;
  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, userId));

  if (!existing) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const updates: Record<string, unknown> = { name };
  if (type) updates.type = type;

  const [org] = await db
    .update(organizationsTable)
    .set(updates)
    .where(eq(organizationsTable.userId, userId))
    .returning();

  res.json({ organization: { ...org, createdAt: org.createdAt.toISOString() } });
});

export default router;
