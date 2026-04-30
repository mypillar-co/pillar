import express, { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { db, organizationsTable, orgMembersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getOrgIdForUser } from "../lib/resolveOrg";

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.number(),
    contentType: z.string(),
  }),
});

const ConfirmUploadBody = z.object({
  objectPath: z.string(),
  size: z.number(),
});

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const STORAGE_LIMITS: Record<string, number> = {
  tier1:  500 * 1024 * 1024,       // 500 MB
  tier1a: 2 * 1024 * 1024 * 1024,  // 2 GB
  tier2:  5 * 1024 * 1024 * 1024,  // 5 GB
  tier3:  10 * 1024 * 1024 * 1024, // 10 GB
};
const DEFAULT_STORAGE_LIMIT = 100 * 1024 * 1024; // 100 MB (no active plan)

function storageLimitForTier(tier: string | null | undefined): number {
  if (!tier) return DEFAULT_STORAGE_LIMIT;
  return STORAGE_LIMITS[tier] ?? DEFAULT_STORAGE_LIMIT;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

// ─── Request presigned upload URL ─────────────────────────────────────────────
// Does NOT increment quota. Call /storage/uploads/confirm after successful upload.
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  const orgId = await getOrgIdForUser(req.user!.id);
  if (!orgId) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const [org] = await db
    .select({ id: organizationsTable.id, tier: organizationsTable.tier, storageUsedBytes: organizationsTable.storageUsedBytes })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const limit = storageLimitForTier(org.tier);
  const used = org.storageUsedBytes ?? 0;

  if (used + size > limit) {
    res.status(413).json({
      error: `Storage limit reached. Your plan includes ${formatBytes(limit)} and you have used ${formatBytes(used)}. Please upgrade your plan or remove unused files.`,
      storageUsed: used,
      storageLimit: limit,
    });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ─── Local/Replit fallback upload ─────────────────────────────────────────────
// When Replit Object Storage is not configured, dashboard image flows still need
// to work. Store a data URL directly in app data so galleries/sponsor logos can
// render immediately and persist with the DB record that references them.
router.post(
  "/storage/uploads/data-url",
  express.raw({ type: "image/*", limit: "10mb" }),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const contentType = (req.headers["content-type"] ?? "").toString();
    if (!contentType.startsWith("image/")) {
      res.status(400).json({ error: "Only image uploads are supported" });
      return;
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Image body is required" });
      return;
    }

    const orgId = await getOrgIdForUser(req.user!.id);
    if (!orgId) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const [org] = await db
      .select({
        id: organizationsTable.id,
        tier: organizationsTable.tier,
        storageUsedBytes: organizationsTable.storageUsedBytes,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId));

    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const limit = storageLimitForTier(org.tier);
    const used = org.storageUsedBytes ?? 0;
    if (used + body.length > limit) {
      res.status(413).json({
        error: `Storage limit reached. Your plan includes ${formatBytes(limit)} and you have used ${formatBytes(used)}. Please upgrade your plan or remove unused files.`,
        storageUsed: used,
        storageLimit: limit,
      });
      return;
    }

    await db
      .update(organizationsTable)
      .set({ storageUsedBytes: sql`${organizationsTable.storageUsedBytes} + ${body.length}` })
      .where(eq(organizationsTable.id, orgId));

    const objectPath = `data:${contentType};base64,${body.toString("base64")}`;
    res.json({
      uploadURL: null,
      objectPath,
      metadata: {
        name: "inline-image",
        size: body.length,
        contentType,
      },
    });
  },
);

// ─── Confirm successful upload and increment quota ─────────────────────────────
router.post("/storage/uploads/confirm", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ConfirmUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { size } = parsed.data;

  const orgId = await getOrgIdForUser(req.user!.id);
  if (!orgId) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  await db
    .update(organizationsTable)
    .set({ storageUsedBytes: sql`${organizationsTable.storageUsedBytes} + ${size}` })
    .where(eq(organizationsTable.id, orgId));

  res.json({ ok: true });
});

// ─── Serve public objects (no auth required) ────────────────────────────────
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

// ─── Serve private objects — requires authentication ────────────────────────
// Only the authenticated org owner or org members can download private files.
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const orgId = await getOrgIdForUser(req.user!.id);
  if (!orgId) {
    res.status(403).json({ error: "Forbidden: no organization found for this account" });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
