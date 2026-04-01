import { type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";

const CSRF_COOKIE = "__csrf";
const CSRF_HEADER = "x-csrf-token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const EXEMPT_PREFIXES = [
  "/api/public/",
  "/api/auth/",
  "/api/stripe/webhook",
];

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (isExempt(req.path)) {
    return next();
  }

  let token = req.cookies[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  if (MUTATING_METHODS.has(req.method)) {
    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!headerToken || headerToken !== token) {
      res.status(403).json({ error: "Invalid or missing CSRF token" });
      return;
    }
  } else {
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  next();
}
