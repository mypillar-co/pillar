import { type Request, type Response } from "express";
import { db, organizationsTable, orgMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function getAuthenticatedUserId(req: Request, res: Response): string | null {
  const userId = (req.user as { id?: string } | undefined)?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

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
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return null;
  const orgId = await getOrgIdForUser(userId);
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
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return null;
  const org = await getFullOrgForUser(userId);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  return org;
}

const EDITOR_ROLES = new Set(["owner", "admin", "editor"]);

export async function getEditableOrgIdForUser(userId: string): Promise<string | null> {
  const [owned] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (owned) return owned.id;

  const [membership] = await db
    .select({ orgId: orgMembersTable.orgId, role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(eq(orgMembersTable.userId, userId));
  if (!membership || !EDITOR_ROLES.has(membership.role)) return null;
  return membership.orgId;
}

export async function resolveFullOrgEditor(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) return null;

  const [owned] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (owned) return owned;

  const [membership] = await db
    .select({ orgId: orgMembersTable.orgId, role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(eq(orgMembersTable.userId, userId));
  if (!membership) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  if (!EDITOR_ROLES.has(membership.role)) {
    res.status(403).json({ error: "You do not have permission to edit this organization." });
    return null;
  }

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, membership.orgId));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }
  return org;
}
