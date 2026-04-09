import { Router, type Request, type Response } from "express";
import {
  db, socialAccountsTable, socialPostsTable, automationRulesTable,
  contentStrategyTable, organizationsTable, eventsTable, oauthStatesTable,
} from "@workspace/db";
import { eq, and, desc, gte, lt, isNotNull, asc } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";
import { randomBytes, createHash } from "crypto";
import { logger } from "../lib/logger";
import { encryptToken, decryptToken } from "../lib/tokenCrypto";
import { getSessionId } from "../lib/auth";
import OpenAI from "openai";

const router = Router();

// Derive the public-facing base URL from the request itself so OAuth
// redirects work in every environment without needing BASE_URL set.
function getBaseUrl(req: Request): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)
      ?.split(",")[0].trim() ?? req.protocol;
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)
      ?.split(",")[0].trim() ?? (req.headers.host as string | undefined) ?? "";
  return `${proto}://${host}`;
}

interface OAuthState {
  orgId: string;
  platform: string;
  sessionId: string;
  codeVerifier?: string;
  expiresAt: number;
}

async function saveOAuthState(
  stateToken: string,
  data: { orgId: string; platform: string; sessionId: string; codeVerifier?: string },
): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.delete(oauthStatesTable).where(lt(oauthStatesTable.expiresAt, new Date()));
  await db.insert(oauthStatesTable).values({
    stateToken,
    orgId: data.orgId,
    platform: data.platform,
    sessionId: data.sessionId,
    codeVerifier: data.codeVerifier ?? null,
    expiresAt,
  });
}

async function getAndDeleteOAuthState(stateToken: string): Promise<OAuthState | null> {
  const [row] = await db
    .select()
    .from(oauthStatesTable)
    .where(eq(oauthStatesTable.stateToken, stateToken));
  if (!row) return null;
  await db.delete(oauthStatesTable).where(eq(oauthStatesTable.stateToken, stateToken));
  return {
    orgId: row.orgId,
    platform: row.platform,
    sessionId: row.sessionId,
    codeVerifier: row.codeVerifier ?? undefined,
    expiresAt: row.expiresAt.getTime(),
  };
}

function getOpenAIClient() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI integration not configured");
  }
  return new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

const BUFFER_SERVICES = new Set(["twitter", "facebook", "instagram", "linkedin", "pinterest"]);
const VALID_PLATFORMS = new Set([
  "facebook", "instagram", "twitter",
  ...([...BUFFER_SERVICES].map(s => `buffer_${s}`)),
]);

function validatePlatforms(platforms: unknown): string | null {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return "platforms must be a non-empty array";
  }
  const invalid = (platforms as string[]).filter(p => !VALID_PLATFORMS.has(p));
  if (invalid.length > 0) {
    return `Invalid platforms: ${invalid.join(", ")}. Allowed: facebook, instagram, twitter, or buffer_twitter / buffer_facebook / buffer_instagram / buffer_linkedin / buffer_pinterest`;
  }
  return null;
}

function validateAutomationPlatforms(platforms: unknown): string | null {
  const base = validatePlatforms(platforms);
  if (base) return base;
  if ((platforms as string[]).includes("instagram")) {
    return "Direct Instagram cannot be used in automation rules because posts require a hosted image URL. Use buffer_instagram via Buffer instead, which handles media automatically.";
  }
  return null;
}

const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly"]);
const VALID_CONTENT_TYPES = new Set(["events", "updates", "promotions", "community", "custom", "announcements", "general"]);
const VALID_DAYS = new Set(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]);
const VALID_POST_STATUSES = new Set(["draft", "scheduled"]);
const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateFrequency(freq: string): string | null {
  if (!VALID_FREQUENCIES.has(freq)) {
    return `Invalid frequency "${freq}". Allowed: ${[...VALID_FREQUENCIES].join(", ")}`;
  }
  return null;
}

function validateTimeOfDay(time: string): string | null {
  if (!TIME_OF_DAY_RE.test(time)) {
    return `Invalid timeOfDay "${time}". Expected HH:MM (24-hour format, e.g. "09:00")`;
  }
  return null;
}

function validateContentType(ct: string): string | null {
  if (!VALID_CONTENT_TYPES.has(ct)) {
    return `Invalid contentType "${ct}". Allowed: ${[...VALID_CONTENT_TYPES].join(", ")}`;
  }
  return null;
}

function validateDayOfWeek(day: string): string | null {
  if (!VALID_DAYS.has(day.toLowerCase())) {
    return `Invalid dayOfWeek "${day}". Allowed: ${[...VALID_DAYS].join(", ")}`;
  }
  return null;
}

function validateFutureDate(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return `Invalid date "${iso}"`;
  if (d.getTime() < Date.now() + 60_000) return "scheduledAt must be at least 1 minute in the future";
  return null;
}

function validatePostStatus(s: string): string | null {
  if (!VALID_POST_STATUSES.has(s)) {
    return `Invalid status "${s}". Allowed: ${[...VALID_POST_STATUSES].join(", ")}`;
  }
  return null;
}

function tierAllowsSocial(tier: string | null | undefined): boolean {
  return tier === "tier1a" || tier === "tier2" || tier === "tier3";
}

function tierAllowsStrategy(tier: string | null | undefined): boolean {
  return tier === "tier3";
}

function computeNextRun(frequency: string, dayOfWeek?: string | null, timeOfDay?: string | null): Date {
  const now = new Date();
  const next = new Date(now);
  const parts = (timeOfDay ?? "09:00").split(":");
  const hh = parseInt(parts[0] ?? "9", 10);
  const mm = parseInt(parts[1] ?? "0", 10);
  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
    next.setHours(hh, mm, 0, 0);
  } else if (frequency === "weekly") {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDay = days.indexOf((dayOfWeek ?? "monday").toLowerCase());
    const currentDay = next.getDay();
    const diff = (targetDay - currentDay + 7) % 7 || 7;
    next.setDate(next.getDate() + diff);
    next.setHours(hh, mm, 0, 0);
  } else {
    next.setMonth(next.getMonth() + 1, 1);
    next.setHours(hh, mm, 0, 0);
  }
  return next;
}

// ─── OAuth Flows ─────────────────────────────────────────────────

router.get("/oauth/:platform/start", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const { platform } = req.params;

  if (platform === "facebook" || platform === "instagram") {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
      res.status(400).json({
        error: "Facebook OAuth not configured",
        message: "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to enable one-click OAuth. For now, use the manual token option below.",
        manualConnect: true,
      });
      return;
    }
    const state = randomBytes(16).toString("hex");
    await saveOAuthState(state, { orgId: org.id, platform, sessionId: getSessionId(req) ?? "" });
    // Request scopes for both Facebook page posting and Instagram Business
    const scope = platform === "instagram"
      ? "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,instagram_manage_insights"
      : "pages_show_list,pages_manage_posts,pages_read_engagement";
    const redirectUri = encodeURIComponent(`${getBaseUrl(req)}/api/social/oauth/${platform}/callback`);
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    res.json({ authUrl });
    return;
  }

  if (platform === "twitter") {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) {
      res.status(400).json({
        error: "Twitter OAuth not configured",
        message: "Set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET to enable one-click OAuth. For now, use the manual token option below.",
        manualConnect: true,
      });
      return;
    }
    const state = randomBytes(16).toString("hex");
    // Generate PKCE code verifier and store it server-side with the state
    const codeVerifier = randomBytes(32).toString("base64url");
    // Derive S256 code challenge: base64url(sha256(verifier))
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    await saveOAuthState(state, { orgId: org.id, platform, sessionId: getSessionId(req) ?? "", codeVerifier });
    const redirectUri = encodeURIComponent(`${getBaseUrl(req)}/api/social/oauth/twitter/callback`);
    const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=tweet.write%20tweet.read%20users.read&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    res.json({ authUrl });
    return;
  }

  res.status(400).json({ error: `Unsupported platform: ${platform}` });
});

async function upsertSocialAccount(orgId: string, platform: string, accountName: string, encryptedToken: string, accountId: string | null, encryptedRefresh?: string | null): Promise<void> {
  const existing = await db.select({ id: socialAccountsTable.id }).from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.orgId, orgId), eq(socialAccountsTable.platform, platform)));

  if (existing.length > 0) {
    await db.update(socialAccountsTable).set({
      accountName,
      accessToken: encryptedToken,
      refreshToken: encryptedRefresh ?? null,
      accountId,
      isConnected: true,
      updatedAt: new Date(),
    }).where(eq(socialAccountsTable.id, existing[0].id));
  } else {
    await db.insert(socialAccountsTable).values({
      orgId,
      platform,
      accountName,
      accessToken: encryptedToken,
      refreshToken: encryptedRefresh ?? null,
      accountId,
    });
  }
}

router.get("/oauth/facebook/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query as { code?: string; state?: string; error?: string };

  if (oauthError) {
    res.redirect(`/dashboard/social?error=${encodeURIComponent("Facebook OAuth denied")}`);
    return;
  }
  if (!code || !state) {
    res.redirect("/dashboard/social?error=Invalid+OAuth+callback");
    return;
  }

  const stored = await getAndDeleteOAuthState(state);
  if (!stored || stored.expiresAt < Date.now()) {
    res.redirect("/dashboard/social?error=OAuth+state+expired");
    return;
  }
  if (stored.sessionId && stored.sessionId !== getSessionId(req)) {
    res.redirect("/dashboard/social?error=OAuth+session+mismatch");
    return;
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    res.redirect("/dashboard/social?error=Facebook+OAuth+not+configured");
    return;
  }

  try {
    const redirectUri = encodeURIComponent(`${getBaseUrl(req)}/api/social/oauth/facebook/callback`);
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirectUri}&client_secret=${appSecret}&code=${code}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json() as { access_token?: string; error?: { message?: string } };

    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "No access token received");
    }

    // Exchange for long-lived user token
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`;
    const llResp = await fetch(longLivedUrl);
    const llData = await llResp.json() as { access_token?: string };
    const userToken = llData.access_token ?? tokenData.access_token;

    // Fetch the user's managed Pages to get page-level access tokens
    const pagesResp = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`);
    const pagesData = await pagesResp.json() as { data?: Array<{ id: string; name: string; access_token: string }> };

    const pages = pagesData.data ?? [];
    if (pages.length === 0) {
      // No managed pages — store user token with user ID as fallback
      const meResp = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${userToken}`);
      const meData = await meResp.json() as { id?: string; name?: string };
      await upsertSocialAccount(stored.orgId, "facebook", meData.name ?? "Facebook Profile", encryptToken(userToken), meData.id ?? null);
    } else {
      // Store the first page's page-level access token (never expires with long-lived user token)
      const page = pages[0];
      await upsertSocialAccount(stored.orgId, "facebook", page.name, encryptToken(page.access_token), page.id);
    }

    res.redirect("/dashboard/social?success=Facebook+account+connected");
  } catch (err) {
    logger.error({ err }, "Facebook OAuth callback failed");
    res.redirect(`/dashboard/social?error=${encodeURIComponent("Failed to connect Facebook account")}`);
  }
});

router.get("/oauth/instagram/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query as { code?: string; state?: string; error?: string };

  if (oauthError) {
    res.redirect(`/dashboard/social?error=${encodeURIComponent("Instagram OAuth denied")}`);
    return;
  }
  if (!code || !state) {
    res.redirect("/dashboard/social?error=Invalid+OAuth+callback");
    return;
  }

  const stored = await getAndDeleteOAuthState(state);
  if (!stored || stored.expiresAt < Date.now()) {
    res.redirect("/dashboard/social?error=OAuth+state+expired");
    return;
  }
  if (stored.sessionId && stored.sessionId !== getSessionId(req)) {
    res.redirect("/dashboard/social?error=OAuth+session+mismatch");
    return;
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    res.redirect("/dashboard/social?error=Instagram+OAuth+not+configured");
    return;
  }

  try {
    const redirectUri = encodeURIComponent(`${getBaseUrl(req)}/api/social/oauth/instagram/callback`);
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirectUri}&client_secret=${appSecret}&code=${code}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json() as { access_token?: string; error?: { message?: string } };

    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "No access token received");
    }

    // Exchange for long-lived user token
    const llResp = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`);
    const llData = await llResp.json() as { access_token?: string };
    const userToken = llData.access_token ?? tokenData.access_token;

    // Get all managed pages
    const pagesResp = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`);
    const pagesData = await pagesResp.json() as { data?: Array<{ id: string; name: string; access_token: string }> };

    const pages = pagesData.data ?? [];
    if (pages.length === 0) {
      throw new Error("No Facebook Pages found. An Instagram Business account must be linked to a Facebook Page.");
    }

    // Find the first page with a connected Instagram Business account
    let igAccountId: string | null = null;
    let igAccountName = "Instagram Business Account";
    let pageToken = userToken;

    for (const page of pages) {
      const igResp = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account,name&access_token=${page.access_token}`
      );
      const igData = await igResp.json() as {
        instagram_business_account?: { id: string };
        name?: string;
      };

      if (igData.instagram_business_account?.id) {
        igAccountId = igData.instagram_business_account.id;
        pageToken = page.access_token;
        // Fetch the IG account's username for display
        const igUserResp = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?fields=username&access_token=${page.access_token}`
        );
        const igUserData = await igUserResp.json() as { username?: string };
        igAccountName = igUserData.username ? `@${igUserData.username}` : page.name;
        break;
      }
    }

    if (!igAccountId) {
      throw new Error("No Instagram Business account linked to your Facebook Pages. Please link one in Facebook Business Manager.");
    }

    await upsertSocialAccount(stored.orgId, "instagram", igAccountName, encryptToken(pageToken), igAccountId);

    res.redirect("/dashboard/social?success=Instagram+account+connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect Instagram account";
    logger.error({ err }, "Instagram OAuth callback failed");
    res.redirect(`/dashboard/social?error=${encodeURIComponent(msg)}`);
  }
});

router.get("/oauth/twitter/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query as { code?: string; state?: string; error?: string };

  if (oauthError || !code || !state) {
    res.redirect("/dashboard/social?error=Twitter+OAuth+failed");
    return;
  }

  const stored = await getAndDeleteOAuthState(state);
  if (!stored || stored.expiresAt < Date.now()) {
    res.redirect("/dashboard/social?error=OAuth+state+expired");
    return;
  }
  if (stored.sessionId && stored.sessionId !== getSessionId(req)) {
    res.redirect("/dashboard/social?error=OAuth+session+mismatch");
    return;
  }
  // Retrieve the PKCE verifier stored during /start
  const codeVerifier = stored.codeVerifier;
  if (!codeVerifier) {
    res.redirect("/dashboard/social?error=OAuth+PKCE+state+missing");
    return;
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect("/dashboard/social?error=Twitter+OAuth+not+configured");
    return;
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/api/social/oauth/twitter/callback`;
    const tokenResp = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });
    const tokenData = await tokenResp.json() as { access_token?: string; refresh_token?: string; error?: string };

    if (!tokenData.access_token) {
      throw new Error(tokenData.error ?? "No access token received");
    }

    const userResp = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResp.json() as { data?: { id?: string; name?: string } };

    const encryptedToken = encryptToken(tokenData.access_token);
    const encryptedRefresh = tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null;
    await upsertSocialAccount(stored.orgId, "twitter", userData.data?.name ?? "X Account", encryptedToken, userData.data?.id ?? null, encryptedRefresh);

    res.redirect("/dashboard/social?success=X+account+connected");
  } catch (err) {
    logger.error({ err }, "Twitter OAuth callback failed");
    res.redirect(`/dashboard/social?error=${encodeURIComponent("Failed to connect X account")}`);
  }
});

// ─── Buffer Integration ──────────────────────────────────────────
// Uses a single platform-level BUFFER_API_KEY. Each org selects which
// Buffer channels (profiles) belong to them; posts are published via Buffer
// which distributes to the actual social platforms on their behalf.

router.get("/buffer/profiles", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Buffer integration not configured on this platform." }); return; }

  try {
    const resp = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${encodeURIComponent(apiKey)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { message?: string; error?: string };
      res.status(502).json({ error: err.message ?? err.error ?? `Buffer API error ${resp.status}` });
      return;
    }
    const profiles = await resp.json() as Array<{
      id: string;
      service: string;
      service_username: string;
      formatted_username: string;
      avatar_https?: string;
      default?: boolean;
    }>;
    // Only return supported service types
    const filtered = profiles.filter(p => BUFFER_SERVICES.has(p.service));
    res.json({ profiles: filtered });
  } catch (err) {
    logger.error({ err }, "Buffer profiles fetch failed");
    res.status(502).json({ error: "Could not reach Buffer API" });
  }
});

router.post("/buffer/connect", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const { profileId, profileName, service } = req.body as { profileId: string; profileName: string; service: string };
  if (!profileId || !profileName || !service || !BUFFER_SERVICES.has(service)) {
    res.status(400).json({ error: "profileId, profileName, and a valid service (twitter/facebook/instagram/linkedin/pinterest) are required" });
    return;
  }

  const platformKey = `buffer_${service}`;
  // Posting uses process.env.BUFFER_API_KEY directly; store a placeholder token.
  await upsertSocialAccount(org.id, platformKey, profileName, encryptToken("buffer-managed"), profileId);
  res.json({ ok: true });
});

router.delete("/buffer/connect/:profileId", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const { profileId } = req.params;
  await db
    .update(socialAccountsTable)
    .set({ isConnected: false, updatedAt: new Date() })
    .where(and(eq(socialAccountsTable.orgId, org.id), eq(socialAccountsTable.accountId, profileId)));
  res.json({ ok: true });
});

// ─── Accounts ───────────────────────────────────────────────────

router.get("/accounts", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const accounts = await db
    .select()
    .from(socialAccountsTable)
    .where(eq(socialAccountsTable.orgId, org.id))
    .orderBy(socialAccountsTable.createdAt);

  res.json(accounts.map(a => ({ ...a, accessToken: undefined, refreshToken: undefined })));
});

router.post("/accounts", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const { platform, accountName, accessToken, accountId } = req.body as {
    platform: string; accountName: string; accessToken: string; accountId?: string;
  };

  if (!platform || !accountName || !accessToken) {
    res.status(400).json({ error: "platform, accountName, and accessToken are required" });
    return;
  }

  const validPlatforms = ["facebook", "instagram", "twitter"];
  if (!validPlatforms.includes(platform)) {
    res.status(400).json({ error: "platform must be facebook, instagram, or twitter" });
    return;
  }

  const encryptedToken = encryptToken(accessToken);
  const existing = await db
    .select({ id: socialAccountsTable.id })
    .from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.orgId, org.id), eq(socialAccountsTable.platform, platform)));

  if (existing.length > 0) {
    const [updated] = await db
      .update(socialAccountsTable)
      .set({ accountName, accessToken: encryptedToken, accountId: accountId ?? null, isConnected: true, updatedAt: new Date() })
      .where(eq(socialAccountsTable.id, existing[0].id))
      .returning();
    res.json({ ...updated, accessToken: undefined, refreshToken: undefined });
    return;
  }

  const [account] = await db
    .insert(socialAccountsTable)
    .values({ orgId: org.id, platform, accountName, accessToken: encryptedToken, accountId: accountId ?? null })
    .returning();

  res.status(201).json({ ...account, accessToken: undefined, refreshToken: undefined });
});

router.delete("/accounts/:id", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const [account] = await db
    .select()
    .from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.id, req.params.id), eq(socialAccountsTable.orgId, org.id)));

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  // Best-effort platform token revocation before deleting the local record
  try {
    const rawToken = decryptToken(account.accessToken);
    if (account.platform === "facebook" || account.platform === "instagram") {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      if (appId && appSecret) {
        await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${rawToken}`, { method: "DELETE" })
          .catch(() => {/* silent — token may already be expired */});
      }
    } else if (account.platform === "twitter") {
      const clientId = process.env.TWITTER_CLIENT_ID;
      const clientSecret = process.env.TWITTER_CLIENT_SECRET;
      if (clientId && clientSecret) {
        await fetch("https://api.twitter.com/2/oauth2/revoke", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          },
          body: new URLSearchParams({ token: rawToken, token_type_hint: "access_token" }).toString(),
        }).catch(() => {/* silent — token may already be expired */});
      }
    }
  } catch {
    // Decryption or revocation failed — proceed to delete local record regardless
  }

  await db.delete(socialAccountsTable).where(eq(socialAccountsTable.id, req.params.id));
  res.status(204).send();
});

// ─── AI Post Generation (static route before /:id) ──────────────

router.post("/posts/generate", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const { platform, topic, eventId, tone } = req.body as {
    platform: string; topic?: string; eventId?: string; tone?: string;
  };

  if (!platform) { res.status(400).json({ error: "platform is required" }); return; }

  let context = topic ?? "";
  if (eventId) {
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, org.id)));
    if (event) {
      context = `Event: ${event.name}\nDate: ${event.startDate ?? "TBD"}\nTime: ${event.startTime ?? "TBD"}\nLocation: ${event.location ?? "TBD"}\nDescription: ${event.description ?? ""}`;
    }
  }

  const platformGuidelines: Record<string, string> = {
    facebook: "Write a Facebook post (up to 400 characters). Be engaging and community-focused. Include a call to action.",
    instagram: "Write an Instagram caption (up to 300 characters). Be visual and inspiring. Include 3-5 relevant hashtags at the end.",
    twitter: "Write a tweet (under 280 characters including spaces). Be concise and punchy. You may include 1-2 hashtags.",
  };

  const guideline = platformGuidelines[platform] ?? "Write a social media post (under 300 characters).";
  const toneStr = tone ?? "professional and welcoming";

  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are a social media content writer for a civic organization. Tone: ${toneStr}. ${guideline} Output only the post text, no commentary or quotes around it.`,
        },
        {
          role: "user",
          content: context ? `Generate a post about:\n${context}` : `Generate a general organizational update post for ${platform}.`,
        },
      ],
    });

    const generatedContent = completion.choices[0]?.message?.content?.trim() ?? "";

    // For Instagram, also generate an image prompt suggestion
    if (platform === "instagram") {
      try {
        const imageCompletion = await client.chat.completions.create({
          model: "gpt-5-mini",
          max_completion_tokens: 200,
          messages: [
            {
              role: "system",
              content: "You are a visual director for social media. Based on the caption below, write a concise image prompt (2-3 sentences) describing the ideal photo or graphic to accompany the Instagram post. Be specific about style, colors, and subject matter. Output only the image prompt.",
            },
            { role: "user", content: generatedContent },
          ],
        });
        const imagePrompt = imageCompletion.choices[0]?.message?.content?.trim() ?? "";
        res.json({ content: generatedContent, platform, imagePrompt });
      } catch {
        // If image prompt generation fails, still return the caption
        res.json({ content: generatedContent, platform });
      }
    } else {
      res.json({ content: generatedContent, platform });
    }
  } catch (err) {
    logger.error({ err }, "AI post generation failed");
    res.status(500).json({ error: "Failed to generate post content" });
  }
});

// ─── Posts ──────────────────────────────────────────────────────

router.get("/posts", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const { status } = req.query as { status?: string };
  const baseCondition = eq(socialPostsTable.orgId, org.id);
  const posts = await db
    .select()
    .from(socialPostsTable)
    .where(status ? and(baseCondition, eq(socialPostsTable.status, status)) : baseCondition)
    .orderBy(desc(socialPostsTable.createdAt))
    .limit(100);

  res.json(posts);
});

router.post("/posts", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const { platforms, content, mediaUrl, scheduledAt } = req.body as {
    platforms: string[]; content: string; mediaUrl?: string; scheduledAt?: string;
  };

  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const platformError = validatePlatforms(platforms);
  if (platformError) {
    res.status(400).json({ error: platformError });
    return;
  }
  if (platforms.includes("instagram") && !mediaUrl) {
    res.status(400).json({ error: "Instagram posts require a media URL. Provide a mediaUrl (hosted image URL)." });
    return;
  }
  if (platforms.includes("twitter") && content.length > 280) {
    res.status(400).json({ error: `X/Twitter posts must be 280 characters or fewer (current: ${content.length}).` });
    return;
  }
  if (scheduledAt) {
    const dateErr = validateFutureDate(scheduledAt);
    if (dateErr) { res.status(400).json({ error: dateErr }); return; }
  }

  const status = scheduledAt ? "scheduled" : "draft";
  const [post] = await db
    .insert(socialPostsTable)
    .values({ orgId: org.id, platforms, content, mediaUrl: mediaUrl ?? null, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, status })
    .returning();

  res.status(201).json(post);
});

router.put("/posts/:id", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const [existing] = await db
    .select()
    .from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.orgId, org.id)));

  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  if (existing.status === "published") { res.status(400).json({ error: "Cannot edit a published post" }); return; }

  const { platforms, content, mediaUrl, scheduledAt, status } = req.body as {
    platforms?: string[]; content?: string; mediaUrl?: string; scheduledAt?: string; status?: string;
  };

  if (platforms !== undefined) {
    const platformError = validatePlatforms(platforms);
    if (platformError) {
      res.status(400).json({ error: platformError });
      return;
    }
  }

  // Platform-specific constraints on effective (post-update) values
  const effectivePlatforms = platforms ?? existing.platforms;
  const effectiveMediaUrl = mediaUrl !== undefined ? (mediaUrl || null) : existing.mediaUrl;
  const effectiveContent = content ?? existing.content;

  if (effectivePlatforms.includes("instagram") && !effectiveMediaUrl) {
    res.status(400).json({ error: "Instagram posts require a media URL. Provide a mediaUrl (hosted image URL)." });
    return;
  }
  if (effectivePlatforms.includes("twitter") && effectiveContent.length > 280) {
    res.status(400).json({ error: `X/Twitter posts must be 280 characters or fewer (current: ${effectiveContent.length}).` });
    return;
  }
  if (scheduledAt) {
    const dateErr = validateFutureDate(scheduledAt);
    if (dateErr) { res.status(400).json({ error: dateErr }); return; }
  }
  if (status !== undefined) {
    const statusErr = validatePostStatus(status);
    if (statusErr) { res.status(400).json({ error: statusErr }); return; }
  }
  // Guard: cannot set status=scheduled without providing a future scheduledAt
  const resolvedScheduledAt = scheduledAt !== undefined ? scheduledAt : (existing.scheduledAt?.toISOString() ?? null);
  const resolvedStatus = status ?? (scheduledAt !== undefined ? (scheduledAt ? "scheduled" : "draft") : existing.status);
  if (resolvedStatus === "scheduled" && !resolvedScheduledAt) {
    res.status(400).json({ error: "A scheduledAt date is required when status is 'scheduled'" });
    return;
  }

  const newStatus = resolvedStatus;

  const [updated] = await db
    .update(socialPostsTable)
    .set({
      platforms: platforms ?? existing.platforms,
      content: content ?? existing.content,
      mediaUrl: mediaUrl !== undefined ? (mediaUrl ?? null) : existing.mediaUrl,
      scheduledAt: scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(socialPostsTable.id, req.params.id))
    .returning();

  res.json(updated);
});

router.delete("/posts/:id", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const [existing] = await db
    .select()
    .from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.orgId, org.id)));

  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }

  if (existing.status === "published") {
    res.status(409).json({ error: "Published posts cannot be deleted. History is immutable." });
    return;
  }

  if (existing.status === "scheduled") {
    await db.update(socialPostsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(socialPostsTable.id, req.params.id));
  } else {
    await db.delete(socialPostsTable).where(eq(socialPostsTable.id, req.params.id));
  }

  res.status(204).send();
});

// ─── Automation Rules ───────────────────────────────────────────

router.get("/rules", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const rules = await db
    .select()
    .from(automationRulesTable)
    .where(eq(automationRulesTable.orgId, org.id))
    .orderBy(automationRulesTable.createdAt);

  res.json(rules);
});

router.post("/rules", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const { name, platforms, frequency, dayOfWeek, timeOfDay, contentType, customPrompt } = req.body as {
    name: string; platforms: string[]; frequency: string; dayOfWeek?: string;
    timeOfDay?: string; contentType?: string; customPrompt?: string;
  };

  if (!name || !frequency) {
    res.status(400).json({ error: "name and frequency are required" });
    return;
  }
  const platformError = validateAutomationPlatforms(platforms);
  if (platformError) { res.status(400).json({ error: platformError }); return; }
  const freqErr = validateFrequency(frequency);
  if (freqErr) { res.status(400).json({ error: freqErr }); return; }
  if (timeOfDay) {
    const timeErr = validateTimeOfDay(timeOfDay);
    if (timeErr) { res.status(400).json({ error: timeErr }); return; }
  }
  if (dayOfWeek) {
    const dayErr = validateDayOfWeek(dayOfWeek);
    if (dayErr) { res.status(400).json({ error: dayErr }); return; }
  }
  if (contentType) {
    const ctErr = validateContentType(contentType);
    if (ctErr) { res.status(400).json({ error: ctErr }); return; }
  }

  const nextRunAt = computeNextRun(frequency, dayOfWeek, timeOfDay);

  const [rule] = await db
    .insert(automationRulesTable)
    .values({ orgId: org.id, name, platforms, frequency, dayOfWeek: dayOfWeek ?? null, timeOfDay: timeOfDay ?? "09:00", contentType: contentType ?? "events", customPrompt: customPrompt ?? null, nextRunAt })
    .returning();

  res.status(201).json(rule);
});

router.put("/rules/:id", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const [existing] = await db
    .select()
    .from(automationRulesTable)
    .where(and(eq(automationRulesTable.id, req.params.id), eq(automationRulesTable.orgId, org.id)));

  if (!existing) { res.status(404).json({ error: "Rule not found" }); return; }

  const { name, platforms, frequency, dayOfWeek, timeOfDay, contentType, customPrompt, isActive } = req.body as {
    name?: string; platforms?: string[]; frequency?: string; dayOfWeek?: string;
    timeOfDay?: string; contentType?: string; customPrompt?: string; isActive?: boolean;
  };

  if (platforms !== undefined) {
    const platformError = validateAutomationPlatforms(platforms);
    if (platformError) { res.status(400).json({ error: platformError }); return; }
  }
  if (frequency !== undefined) {
    const freqErr = validateFrequency(frequency);
    if (freqErr) { res.status(400).json({ error: freqErr }); return; }
  }
  if (timeOfDay !== undefined) {
    const timeErr = validateTimeOfDay(timeOfDay);
    if (timeErr) { res.status(400).json({ error: timeErr }); return; }
  }
  if (dayOfWeek !== undefined) {
    const dayErr = validateDayOfWeek(dayOfWeek);
    if (dayErr) { res.status(400).json({ error: dayErr }); return; }
  }
  if (contentType !== undefined) {
    const ctErr = validateContentType(contentType);
    if (ctErr) { res.status(400).json({ error: ctErr }); return; }
  }

  const newFreq = frequency ?? existing.frequency;
  const newDay = dayOfWeek ?? existing.dayOfWeek;
  const newTime = timeOfDay ?? existing.timeOfDay;
  const nextRunAt = computeNextRun(newFreq, newDay, newTime);

  const [updated] = await db
    .update(automationRulesTable)
    .set({
      name: name ?? existing.name,
      platforms: platforms ?? existing.platforms,
      frequency: newFreq,
      dayOfWeek: dayOfWeek !== undefined ? (dayOfWeek ?? null) : existing.dayOfWeek,
      timeOfDay: newTime,
      contentType: contentType ?? existing.contentType,
      customPrompt: customPrompt !== undefined ? (customPrompt ?? null) : existing.customPrompt,
      isActive: isActive !== undefined ? isActive : existing.isActive,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(automationRulesTable.id, req.params.id))
    .returning();

  res.json(updated);
});

router.delete("/rules/:id", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require the Autopilot plan or higher" }); return; }

  const [existing] = await db
    .select()
    .from(automationRulesTable)
    .where(and(eq(automationRulesTable.id, req.params.id), eq(automationRulesTable.orgId, org.id)));

  if (!existing) { res.status(404).json({ error: "Rule not found" }); return; }

  await db.delete(automationRulesTable).where(eq(automationRulesTable.id, req.params.id));
  res.status(204).send();
});

// ─── Content Strategy (Tier 3) ──────────────────────────────────

router.get("/strategy", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsStrategy(org.tier)) { res.status(403).json({ error: "Content strategy requires the Total Operations plan" }); return; }

  const [strategy] = await db
    .select()
    .from(contentStrategyTable)
    .where(eq(contentStrategyTable.orgId, org.id));

  res.json(strategy ?? null);
});

router.put("/strategy", async (req, res) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsStrategy(org.tier)) { res.status(403).json({ error: "Content strategy requires the Total Operations plan" }); return; }

  const { tone, postingFrequency, topics, platforms, isAutonomous } = req.body as {
    tone?: string; postingFrequency?: string; topics?: string[]; platforms?: string[]; isAutonomous?: boolean;
  };

  if (platforms !== undefined && platforms.length > 0) {
    const platformError = validateAutomationPlatforms(platforms);
    if (platformError) {
      res.status(400).json({ error: platformError });
      return;
    }
  }

  const [existing] = await db
    .select({ id: contentStrategyTable.id })
    .from(contentStrategyTable)
    .where(eq(contentStrategyTable.orgId, org.id));

  if (existing) {
    const [updated] = await db
      .update(contentStrategyTable)
      .set({ tone, postingFrequency, topics, platforms, isAutonomous, updatedAt: new Date() })
      .where(eq(contentStrategyTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(contentStrategyTable)
      .values({ orgId: org.id, tone, postingFrequency, topics, platforms, isAutonomous })
      .returning();
    res.json(created);
  }
});

export { decryptToken };
export default router;
