import { type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";

const CSRF_COOKIE = "__csrf";
const CSRF_HEADER = "x-csrf-token";
const CSRF_RESPONSE_HEADER = "x-csrf-token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const EXEMPT_PREFIXES = [
  "/api/public/",
  "/api/auth/",
  "/api/stripe/webhook",
  "/api/hooks/",
  "/api/nrc/",
  "/api/service/",
];

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  // Also expose the token in a response header so the frontend can cache it
  // in memory — more reliable than document.cookie in proxied environments.
  res.setHeader(CSRF_RESPONSE_HEADER, token);
  // Allow JS to read this header cross-origin (safe: CORS already restricts origins)
  res.setHeader("Access-Control-Expose-Headers", CSRF_RESPONSE_HEADER);
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (isExempt(req.path)) {
    return next();
  }

  let token = req.cookies[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = randomBytes(32).toString("hex");
  }

  if (MUTATING_METHODS.has(req.method)) {
    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!headerToken || headerToken !== token) {
      // Refresh the cookie/header so the client can retry immediately
      setCsrfCookie(res, token);
      res.status(403).json({ error: "Invalid or missing CSRF token" });
      return;
    }
  }

  // Always refresh the cookie + response header on every non-exempt request
  // so the frontend always has a fresh token to work with.
  setCsrfCookie(res, token);

  next();
}
