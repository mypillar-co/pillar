import { type Request, type Response, type NextFunction } from "express";

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
}

function getAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean)
  );
}

export function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const adminEmails = getAdminEmails();
  const adminIds = getAdminUserIds();
  const userEmail = req.user.email?.toLowerCase() ?? "";
  const userId = req.user.id;

  if (adminEmails.has(userEmail) || adminIds.has(userId)) {
    next();
    return;
  }

  res.status(403).json({ error: "Forbidden" });
}
