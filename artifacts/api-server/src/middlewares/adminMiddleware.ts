import { type Request, type Response, type NextFunction } from "express";

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

  const adminIds = getAdminUserIds();
  if (!adminIds.has(req.user.id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
