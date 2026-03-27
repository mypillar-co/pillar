import { Router, type Request, type Response } from "express";
import {
  db, socialAccountsTable, socialPostsTable, automationRulesTable,
  contentStrategyTable, organizationsTable, eventsTable,
} from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { logger } from "../lib/logger";
import { encryptToken, decryptToken } from "../lib/tokenCrypto";
import OpenAI from "openai";

const router = Router();

interface OAuthState {
  orgId: string;
  platform: string;
  codeVerifier?: string;
  expiresAt: number;
}

const oauthStateStore = new Map<string, OAuthState>();

function cleanOAuthState() {
  const now = Date.now();
  for (const [key, val] of oauthStateStore.entries()) {
    if (val.expiresAt < now) oauthStateStore.delete(key);
  }
}

function getOpenAIClient() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI integration not configured");
  }
  return new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

const VALID_PLATFORMS = new Set(["facebook", "instagram", "twitter"]);

function validatePlatforms(platforms: unknown): string | null {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return "platforms must be a non-empty array";
  }
  const invalid = (platforms as string[]).filter(p => !VALID_PLATFORMS.has(p));
  if (invalid.length > 0) {
    return `Invalid platforms: ${invalid.join(", ")}. Allowed: facebook, instagram, twitter`;
  }
  return null;
}

function tierAllowsSocial(tier: string | null | undefined): boolean {
  return tier === "tier1a" || tier === "tier2" || tier === "tier3";
}

function tierAllowsStrategy(tier: string | null | undefined): boolean {
  return tier === "tier3";
}

async function resolveOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, tier: organizationsTable.tier })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
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
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

  const { platform } = req.params;
  cleanOAuthState();

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
    oauthStateStore.set(state, { orgId: org.id, platform, expiresAt: Date.now() + 10 * 60 * 1000 });
    // Request scopes for both Facebook page posting and Instagram Business
    const scope = platform === "instagram"
      ? "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,instagram_manage_insights"
      : "pages_show_list,pages_manage_posts,pages_read_engagement";
    const redirectUri = encodeURIComponent(`${process.env.BASE_URL ?? ""}/api/social/oauth/${platform}/callback`);
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
    oauthStateStore.set(state, { orgId: org.id, platform, codeVerifier, expiresAt: Date.now() + 10 * 60 * 1000 });
    const redirectUri = encodeURIComponent(`${process.env.BASE_URL ?? ""}/api/social/oauth/twitter/callback`);
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

  const stored = oauthStateStore.get(state);
  if (!stored || stored.expiresAt < Date.now()) {
    res.redirect("/dashboard/social?error=OAuth+state+expired");
    return;
  }
  oauthStateStore.delete(state);

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    res.redirect("/dashboard/social?error=Facebook+OAuth+not+configured");
    return;
  }

  try {
    const redirectUri = encodeURIComponent(`${process.env.BASE_URL ?? ""}/api/social/oauth/facebook/callback`);
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

  const stored = oauthStateStore.get(state);
  if (!stored || stored.expiresAt < Date.now()) {
    res.redirect("/dashboard/social?error=OAuth+state+expired");
    return;
  }
  oauthStateStore.delete(state);

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    res.redirect("/dashboard/social?error=Instagram+OAuth+not+configured");
    return;
  }

  try {
    const redirectUri = encodeURIComponent(`${process.env.BASE_URL ?? ""}/api/social/oauth/instagram/callback`);
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

  const stored = oauthStateStore.get(state);
  if (!stored || stored.expiresAt < Date.now()) {
    res.redirect("/dashboard/social?error=OAuth+state+expired");
    return;
  }
  // Retrieve the PKCE verifier stored during /start
  const codeVerifier = stored.codeVerifier;
  if (!codeVerifier) {
    res.redirect("/dashboard/social?error=OAuth+PKCE+state+missing");
    return;
  }
  oauthStateStore.delete(state);

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect("/dashboard/social?error=Twitter+OAuth+not+configured");
    return;
  }

  try {
    const redirectUri = `${process.env.BASE_URL ?? ""}/api/social/oauth/twitter/callback`;
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

// ─── Accounts ───────────────────────────────────────────────────

router.get("/accounts", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

  const accounts = await db
    .select()
    .from(socialAccountsTable)
    .where(eq(socialAccountsTable.orgId, org.id))
    .orderBy(socialAccountsTable.createdAt);

  res.json(accounts.map(a => ({ ...a, accessToken: undefined, refreshToken: undefined })));
});

router.post("/accounts", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

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
  const org = await resolveOrg(req, res);
  if (!org) return;

  const [account] = await db
    .select()
    .from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.id, req.params.id), eq(socialAccountsTable.orgId, org.id)));

  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  await db.delete(socialAccountsTable).where(eq(socialAccountsTable.id, req.params.id));
  res.status(204).send();
});

// ─── AI Post Generation (static route before /:id) ──────────────

router.post("/posts/generate", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

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
    res.json({ content: generatedContent, platform });
  } catch (err) {
    logger.error({ err }, "AI post generation failed");
    res.status(500).json({ error: "Failed to generate post content" });
  }
});

// ─── Posts ──────────────────────────────────────────────────────

router.get("/posts", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

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
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

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

  const status = scheduledAt ? "scheduled" : "draft";
  const [post] = await db
    .insert(socialPostsTable)
    .values({ orgId: org.id, platforms, content, mediaUrl: mediaUrl ?? null, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, status })
    .returning();

  res.status(201).json(post);
});

router.put("/posts/:id", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

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

  const newStatus = status ?? (scheduledAt !== undefined ? (scheduledAt ? "scheduled" : "draft") : existing.status);

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
  const org = await resolveOrg(req, res);
  if (!org) return;

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
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

  const rules = await db
    .select()
    .from(automationRulesTable)
    .where(eq(automationRulesTable.orgId, org.id))
    .orderBy(automationRulesTable.createdAt);

  res.json(rules);
});

router.post("/rules", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSocial(org.tier)) { res.status(403).json({ error: "Social media features require Tier 1a or higher" }); return; }

  const { name, platforms, frequency, dayOfWeek, timeOfDay, contentType, customPrompt } = req.body as {
    name: string; platforms: string[]; frequency: string; dayOfWeek?: string;
    timeOfDay?: string; contentType?: string; customPrompt?: string;
  };

  if (!name || !frequency) {
    res.status(400).json({ error: "name and frequency are required" });
    return;
  }
  const platformError = validatePlatforms(platforms);
  if (platformError) {
    res.status(400).json({ error: platformError });
    return;
  }

  const nextRunAt = computeNextRun(frequency, dayOfWeek, timeOfDay);

  const [rule] = await db
    .insert(automationRulesTable)
    .values({ orgId: org.id, name, platforms, frequency, dayOfWeek: dayOfWeek ?? null, timeOfDay: timeOfDay ?? "09:00", contentType: contentType ?? "events", customPrompt: customPrompt ?? null, nextRunAt })
    .returning();

  res.status(201).json(rule);
});

router.put("/rules/:id", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

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
    const platformError = validatePlatforms(platforms);
    if (platformError) {
      res.status(400).json({ error: platformError });
      return;
    }
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
  const org = await resolveOrg(req, res);
  if (!org) return;

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
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsStrategy(org.tier)) { res.status(403).json({ error: "Content strategy requires Tier 3" }); return; }

  const [strategy] = await db
    .select()
    .from(contentStrategyTable)
    .where(eq(contentStrategyTable.orgId, org.id));

  res.json(strategy ?? null);
});

router.put("/strategy", async (req, res) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsStrategy(org.tier)) { res.status(403).json({ error: "Content strategy requires Tier 3" }); return; }

  const { tone, postingFrequency, topics, platforms, isAutonomous } = req.body as {
    tone?: string; postingFrequency?: string; topics?: string[]; platforms?: string[]; isAutonomous?: boolean;
  };

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
