import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createSession,
  clearSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please wait 15 minutes and try again." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait 15 minutes and try again." },
});

function checkBotFields(body: Record<string, unknown>): boolean {
  if (body._gotcha && String(body._gotcha).trim() !== "") return true;
  const ft = Number(body._ft);
  if (!ft || isNaN(ft)) return true;
  const elapsed = Date.now() - ft;
  if (elapsed < 1200 || elapsed > 3_600_000) return true;
  return false;
}

const router = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
}

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  if (checkBotFields(body)) {
    res.status(400).json({ error: "Invalid submission" });
    return;
  }

  const { email, password, firstName, lastName } = body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const adminEmails = getAdminEmails();
  const isAdmin = adminEmails.has(email.toLowerCase());

  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    firstName: firstName ?? null,
    lastName: lastName ?? null,
    passwordHash,
    authProvider: "email",
    isAdmin,
  }).returning();

  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ ok: true });
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  if (checkBotFields(body)) {
    res.status(400).json({ error: "Invalid submission" });
    return;
  }

  const { email, password } = body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.has(email.toLowerCase()) && !user.isAdmin) {
    await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, user.id));
  }

  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ ok: true });
});

router.post("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ ok: true });
});

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function getGoogleCallbackUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}/api/auth/google/callback`;
}

router.get("/google", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google sign-in is not configured" });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  const returnTo = getSafeReturnTo(req.query.returnTo);

  res.cookie("google_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 * 1000 });
  res.cookie("google_return_to", returnTo, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const expectedState = req.cookies?.google_state;
  const returnTo = getSafeReturnTo(req.cookies?.google_return_to);

  res.clearCookie("google_state", { path: "/" });
  res.clearCookie("google_return_to", { path: "/" });

  if (error || !code || state !== expectedState) {
    res.redirect("/login?error=google_failed");
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGoogleCallbackUrl(req),
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      res.redirect("/login?error=google_failed");
      return;
    }

    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await userRes.json() as { sub: string; email: string; given_name?: string; family_name?: string; picture?: string };

    if (!profile.email) {
      res.redirect("/login?error=google_no_email");
      return;
    }

    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.has(profile.email.toLowerCase());

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, profile.email.toLowerCase())).limit(1);
    let user = existing[0];

    if (!user) {
      const [created] = await db.insert(usersTable).values({
        email: profile.email.toLowerCase(),
        firstName: profile.given_name ?? null,
        lastName: profile.family_name ?? null,
        profileImageUrl: profile.picture ?? null,
        authProvider: "google",
        isAdmin,
      }).returning();
      user = created;
    } else if (isAdmin && !user.isAdmin) {
      await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, user.id));
    }

    const sessionData: SessionData = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      },
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.redirect(returnTo);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect("/login?error=google_failed");
  }
});

router.get("/google/status", (_req: Request, res: Response) => {
  res.json({ enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
});

// ─── Apple Sign In ────────────────────────────────────────────────────────────

const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function getAppleCallbackUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}/api/auth/apple/callback`;
}


router.get("/apple", (req: Request, res: Response) => {
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Apple sign-in is not configured" });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  const returnTo = getSafeReturnTo(req.query.returnTo);

  res.cookie("apple_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 * 1000 });
  res.cookie("apple_return_to", returnTo, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getAppleCallbackUrl(req),
    response_type: "code id_token",
    scope: "name email",
    response_mode: "form_post",
    state,
  });

  res.redirect(`${APPLE_AUTH_URL}?${params}`);
});

router.post("/apple/callback", async (req: Request, res: Response) => {
  const { code, id_token, state, error, user: userJson } = req.body ?? {};
  const expectedState = req.cookies?.apple_state;
  const returnTo = getSafeReturnTo(req.cookies?.apple_return_to);

  res.clearCookie("apple_state", { path: "/" });
  res.clearCookie("apple_return_to", { path: "/" });

  if (error || !id_token || state !== expectedState) {
    res.redirect("/login?error=apple_failed");
    return;
  }

  try {
    const { payload } = await jwtVerify(id_token, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: process.env.APPLE_CLIENT_ID!,
    });

    const email = payload.email as string | undefined;
    if (!email) {
      res.redirect("/login?error=apple_no_email");
      return;
    }

    // Apple only sends name on first sign-in, in the form body as JSON
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (userJson) {
      try {
        const parsed = typeof userJson === "string" ? JSON.parse(userJson) : userJson;
        firstName = parsed?.name?.firstName ?? null;
        lastName = parsed?.name?.lastName ?? null;
      } catch { /* ignore */ }
    }

    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.has(email.toLowerCase());

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    let dbUser = existing[0];

    if (!dbUser) {
      const [created] = await db.insert(usersTable).values({
        email: email.toLowerCase(),
        firstName,
        lastName,
        authProvider: "apple",
        isAdmin,
      }).returning();
      dbUser = created;
    } else if (isAdmin && !dbUser.isAdmin) {
      await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, dbUser.id));
    }

    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
      },
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.redirect(returnTo);
  } catch (err) {
    console.error("Apple OAuth error:", err);
    res.redirect("/login?error=apple_failed");
  }
});

// Combined provider status endpoint
router.get("/providers", (_req: Request, res: Response) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY),
  });
});

export { router as customAuthRouter };
