import { type Request, type Response } from "express";
import { db, organizationsTable, orgMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getOrgIdForUser(userId: string): Promise<string | null> {
  const [owned] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (owned) return owned.id;

  const [membership] = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(eq(orgMembersTable.userId, userId));
  return membership?.orgId ?? null;
}

export async function getFullOrgForUser(userId: string) {
  const [owned] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (owned) return owned;

  const [membership] = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(eq(orgMembersTable.userId, userId));
  if (!membership) return null;

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, membership.orgId));
  return org ?? null;
}

export async function resolveOrgId(req: Request, res: Response): Promise<string | null> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const orgId = await getOrgIdForUser(req.user.id);
  if (!orgId) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  return orgId;
}

export async function resolveFullOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const org = await getFullOrgForUser(req.user.id);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  return org;
}
