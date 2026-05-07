import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Response } from "express";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXTENSION_CONTENT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(CONTENT_TYPE_EXTENSIONS).map(([contentType, ext]) => [ext, contentType]),
);

function localObjectRoots(): string[] {
  const roots = [
    process.env.PRIVATE_OBJECT_DIR,
    path.resolve(process.cwd(), "../../.local-object-storage/private"),
    path.resolve(process.cwd(), ".local-object-storage/private"),
  ].filter((root): root is string => typeof root === "string" && root.trim().length > 0);
  return Array.from(new Set(roots));
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  return EXTENSION_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function safeLocalRegistrationDocPath(objectPath: string): string | null {
  const withoutPrefix = objectPath.replace(/^\/objects\//, "");
  if (!withoutPrefix.startsWith("local-registration-docs/")) return null;
  if (withoutPrefix.includes("..") || path.isAbsolute(withoutPrefix)) return null;
  return withoutPrefix;
}

export function isAllowedRegistrationDocType(contentType: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPE_EXTENSIONS, contentType.toLowerCase());
}

export async function writeLocalRegistrationDoc(
  orgId: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const ext = CONTENT_TYPE_EXTENSIONS[contentType.toLowerCase()] ?? "bin";
  const relativePath = path.join("local-registration-docs", orgId, `${randomUUID()}.${ext}`);
  let lastError: unknown = null;

  for (const root of localObjectRoots()) {
    try {
      const fullPath = path.join(root, relativePath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, body);
      return `/objects/${relativePath.split(path.sep).join("/")}`;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Local registration document storage is unavailable");
}

export async function serveLocalRegistrationDoc(objectPath: string, res: Response): Promise<boolean> {
  const relativePath = safeLocalRegistrationDocPath(objectPath);
  if (!relativePath) return false;

  for (const root of localObjectRoots()) {
    const fullPath = path.join(root, relativePath);
    try {
      await access(fullPath);
      res.setHeader("Content-Type", contentTypeForPath(fullPath));
      res.setHeader("Cache-Control", "private, max-age=300");
      createReadStream(fullPath).pipe(res);
      return true;
    } catch {
      // Try the next configured local object root.
    }
  }

  return false;
}
