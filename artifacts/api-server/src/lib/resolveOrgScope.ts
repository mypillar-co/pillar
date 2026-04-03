import { type Request, type Response, type NextFunction } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, organizationsTable, orgMembersTable, sitesTable } from "@workspace/db";
import { getOrgIdForUser } from "./resolveOrg.js";

declare module "express" {
  interface Request {
    orgId?: string;
    siteId?: string;
    userRole?: "owner" | "admin" | "member";
  }
}

async function resolveUserRole(
  userId: string,
  orgId: string,
): Promise<"owner" | "admin" | "member"> {
  const [owned] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, orgId), eq(organizationsTable.userId, userId)))
    .limit(1);
  if (owned) return "owner";

  const [membership] = await db
    .select({ role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)))
    .limit(1);

  if (!membership) return "member";
  const role = membership.role;
  if (role === "admin") return "admin";
  return "member";
}

export async function resolveOrgScope(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const orgId = await getOrgIdForUser(req.user.id);
  if (!orgId) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const [site] = await db
    .select({ id: sitesTable.id })
    .from(sitesTable)
    .where(and(eq(sitesTable.orgId, orgId), isNull(sitesTable.deletedAt)))
    .limit(1);

  req.orgId = orgId;
  req.siteId = site?.id;
  req.userRole = await resolveUserRole(req.user.id, orgId);
  next();
}
