import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Generate a clean, unique org slug.
 *
 * Tries the bare name first, then `-2` through `-5`, and only falls back to a
 * 4-char random suffix if all of those are taken. This keeps URLs like
 * `ligonier-beach.mypillar.co` instead of `ligonier-beach-w47h.mypillar.co`.
 *
 * Exported from a standalone module so unit tests can import it without
 * pulling in the full /api/organizations route file.
 */
export async function generateCleanOrgSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org";

  const candidates = [
    base,
    `${base}-2`,
    `${base}-3`,
    `${base}-4`,
    `${base}-5`,
    `${base}-${Math.random().toString(36).slice(2, 6)}`,
  ];

  for (const slug of candidates) {
    const existing = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, slug))
      .limit(1);
    if (existing.length === 0) return slug;
  }
  return candidates[candidates.length - 1];
}
