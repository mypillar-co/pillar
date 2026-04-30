/**
 * POST /api/hooks/site-event
 *
 * Receives content-hook webhooks from framework-built sites.
 * Each hook carries a strategy object that Pillar uses to decide
 * whether to post, when to post, what tone to use, and which platforms
 * to target. Pillar's automation rules are always the final authority.
 *
 * Hook lifecycle:
 *  1. Parse + authenticate payload
 *  2. Identify org by orgWebsite slug or orgName
 *  3. Check org has social tier (tier1a, tier2, tier3)
 *  4. Priority gate: low/internal → log only; urgent+postImmediately → post now
 *  5. Cadence gate: skip if cadenceKey already hit today's limit
 *  6. Find connected social accounts, intersect with suggestedPlatforms
 *  7. Build context prompt from event type + data
 *  8. Generate AI copy (one per platform) with suggestedTone
 *  9. Insert socialPost records (scheduled or immediate)
 * 10. Log everything to hook_event_log for analytics
 */

import { Router } from "express";
import {
  db,
  organizationsTable,
  sitesTable,
  socialAccountsTable,
  socialPostsTable,
  hookEventLogTable,
  hookCadenceLogTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import OpenAI from "openai";
import { createOpenAIClient } from "../lib/openaiClient";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOpenAIClient() {
  return createOpenAIClient();
}

function tierAllowsSocial(tier: string | null | undefined): boolean {
  return tier === "tier1a" || tier === "tier2" || tier === "tier3";
}

/** ISO date string for today in UTC — used as the cadence log key */
function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Payload types ────────────────────────────────────────────────────────────

type HookStrategy = {
  priority: "urgent" | "high" | "normal" | "low" | "internal";
  category: "announcement" | "promotion" | "update" | "milestone" | "recognition" | "internal";
  suggestedTone: string;
  suggestedPlatforms: string[];
  cadenceKey: string;
  cadenceLimitPerDay: number;
  includeImage: boolean;
  threadWorthy: boolean;
  postImmediately: boolean;
  timingGuidance?: string;
};

type HookData = {
  title?: string;
  eventName?: string;
  date?: string;
  time?: string;
  location?: string;
  ticketUrl?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  description?: string;
  excerpt?: string;
  url?: string;
  sponsorName?: string;
  quantity?: number;
  percentage?: number;
  capacity?: number;
  newDate?: string;
  newLocation?: string;
  [key: string]: unknown;
};

type SiteHookPayload = {
  event: string;
  orgName?: string;
  orgWebsite?: string;
  data: HookData;
  strategy: HookStrategy;
};

// ─── Event → context prompt ───────────────────────────────────────────────────

function buildHookContextPrompt(eventType: string, data: HookData, orgName: string): string {
  const title = data.title ?? data.eventName ?? "our event";
  const link = data.url ?? data.ticketUrl ?? "";
  const linkNote = link ? ` Link: ${link}` : "";

  switch (eventType) {
    case "event.activated":
      return `Announce a new upcoming event for ${orgName}: "${title}"${data.date ? `, on ${data.date}` : ""}${data.location ? ` at ${data.location}` : ""}. Invite the community to join us.${linkNote}`;

    case "event.updated":
      return `Post an important update for ${orgName}: the event "${title}" has changed. ${data.newDate ? `New date: ${data.newDate}.` : ""} ${data.newLocation ? `New location: ${data.newLocation}.` : ""} Ask people to update their plans.${linkNote}`;

    case "ticket_sales.opened":
      return `Tickets are now on sale for ${orgName}'s "${title}"${data.date ? ` on ${data.date}` : ""}. Encourage people to grab tickets before they sell out.${linkNote}`;

    case "ticket_sales.milestone": {
      const pct = data.percentage ? `${data.percentage}%` : "";
      const qty = data.quantity ?? "";
      return `Ticket sales milestone for ${orgName}'s "${title}": ${qty ? `${qty} tickets sold` : ""}${pct ? ` (${pct} sold)` : ""}. Build excitement and encourage those on the fence to act fast.${linkNote}`;
    }

    case "ticket_sales.sold_out":
      return `${orgName}'s "${title}" is SOLD OUT! Create an energetic post celebrating this milestone. Express gratitude to everyone who got tickets.`;

    case "blog.published": {
      const excerpt = data.excerpt ?? data.description ?? "";
      return `A new article was just published on ${orgName}'s site: "${title}". ${excerpt ? `Preview: "${excerpt}"` : ""} Invite readers to check it out.${linkNote}`;
    }

    case "sponsor.added": {
      const sponsorName = data.sponsorName ?? title;
      return `Welcome and thank a new sponsor for ${orgName}: ${sponsorName}. Express genuine gratitude for their community support.`;
    }

    default:
      return `Write a community update post for ${orgName} about: "${title}".${linkNote}`;
  }
}

// ─── Per-platform copy generator ──────────────────────────────────────────────

const PLATFORM_GUIDELINES: Record<string, string> = {
  facebook: "Facebook post (up to 400 characters). Engaging, community-focused. Include a CTA.",
  twitter:  "Tweet (under 280 characters). Punchy and direct. 1-2 relevant hashtags.",
  x:        "Tweet (under 280 characters). Punchy and direct. 1-2 relevant hashtags.",
  instagram: "Instagram caption (under 300 characters). Energetic and visual. 3-5 hashtags.",
};

async function generatePostCopy(
  orgName: string,
  platform: string,
  contextPrompt: string,
  tone: string,
): Promise<string> {
  const guideline = PLATFORM_GUIDELINES[platform] ?? "Social media post (under 300 characters).";
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 512,
    messages: [
      {
        role: "system",
        content: `You are a social media content writer for ${orgName}. Tone: ${tone}. ${guideline} Output only the post text — no quotes, no labels, no commentary.`,
      },
      { role: "user", content: contextPrompt },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

// ─── Cadence helpers ──────────────────────────────────────────────────────────

/** Returns true if the cadence limit has already been reached for today */
async function cadenceLimitReached(orgId: string, cadenceKey: string, limitPerDay: number): Promise<boolean> {
  if (limitPerDay <= 0) return false;
  const today = todayUtc();
  const rows = await db
    .select({ count: hookCadenceLogTable.count })
    .from(hookCadenceLogTable)
    .where(and(
      eq(hookCadenceLogTable.orgId, orgId),
      eq(hookCadenceLogTable.cadenceKey, cadenceKey),
      eq(hookCadenceLogTable.date, today),
    ));
  const current = rows.length > 0 ? parseInt(rows[0].count, 10) : 0;
  return current >= limitPerDay;
}

/** Increments (or creates) the cadence counter for today */
async function incrementCadence(orgId: string, cadenceKey: string): Promise<void> {
  const today = todayUtc();
  await db.execute(sql`
    INSERT INTO hook_cadence_log (org_id, cadence_key, date, count)
    VALUES (${orgId}, ${cadenceKey}, ${today}, '1')
    ON CONFLICT (org_id, cadence_key, date)
    DO UPDATE SET count = (CAST(hook_cadence_log.count AS integer) + 1)::text, updated_at = now()
  `);
}

// ─── Org lookup ───────────────────────────────────────────────────────────────

/**
 * Identify the Pillar org from a hook payload.
 * Strategy (in priority order):
 *   1. Extract subdomain from orgWebsite (e.g. "norwin-rotary-club.mypillar.co" → slug "norwin-rotary-club")
 *   2. Look up by organizations.slug
 *   3. Fall back to case-insensitive name match via sites table orgSlug → org lookup
 */
async function resolveOrgFromHook(
  payload: SiteHookPayload,
): Promise<{ id: string; name: string; tier: string | null } | null> {
  // Try slug from orgWebsite hostname
  if (payload.orgWebsite) {
    try {
      const hostname = new URL(
        payload.orgWebsite.startsWith("http") ? payload.orgWebsite : `https://${payload.orgWebsite}`,
      ).hostname;
      // e.g. "norwin-rotary-club.mypillar.co" → "norwin-rotary-club"
      const slug = hostname.split(".")[0];
      if (slug && slug !== "www") {
        const [org] = await db
          .select({ id: organizationsTable.id, name: organizationsTable.name, tier: organizationsTable.tier })
          .from(organizationsTable)
          .where(eq(organizationsTable.slug, slug));
        if (org) return org;

        // Also try looking up through sitesTable.orgSlug
        const [site] = await db
          .select({ orgId: sitesTable.orgId })
          .from(sitesTable)
          .where(eq(sitesTable.orgSlug, slug));
        if (site) {
          const [org2] = await db
            .select({ id: organizationsTable.id, name: organizationsTable.name, tier: organizationsTable.tier })
            .from(organizationsTable)
            .where(eq(organizationsTable.id, site.orgId));
          if (org2) return org2;
        }
      }
    } catch {
      // malformed URL — fall through to name lookup
    }
  }

  // Fall back to name match
  if (payload.orgName) {
    const [org] = await db
      .select({ id: organizationsTable.id, name: organizationsTable.name, tier: organizationsTable.tier })
      .from(organizationsTable)
      .where(sql`lower(${organizationsTable.name}) = lower(${payload.orgName})`);
    if (org) return org;
  }

  return null;
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

router.post("/site-event", async (req, res) => {
  const payload = req.body as SiteHookPayload;

  // Basic shape validation
  if (!payload?.event || !payload?.strategy) {
    res.status(400).json({ error: "Invalid hook payload: event and strategy are required" });
    return;
  }

  const { event: eventType, data = {} as HookData, strategy } = payload;
  const {
    priority,
    category,
    suggestedTone,
    suggestedPlatforms = [],
    cadenceKey,
    cadenceLimitPerDay,
    includeImage,
    postImmediately,
  } = strategy;

  logger.info({ eventType, priority, category, orgName: payload.orgName, orgWebsite: payload.orgWebsite }, "[site-hook] Received");

  // ── 1. Resolve org ──────────────────────────────────────────────────────────
  const org = await resolveOrgFromHook(payload);

  // Always log the event — even if org not found (analytics)
  const logAction = async (action: string) => {
    try {
      await db.insert(hookEventLogTable).values({
        orgId: org?.id ?? null,
        eventType,
        hookPayload: payload as Record<string, unknown>,
        priority,
        category,
        actionTaken: action,
      });
    } catch (logErr) {
      logger.warn({ logErr }, "[site-hook] Failed to write hook_event_log");
    }
  };

  if (!org) {
    logger.warn({ orgName: payload.orgName, orgWebsite: payload.orgWebsite }, "[site-hook] Org not found — logging only");
    await logAction("org_not_found");
    res.json({ received: true, action: "org_not_found" });
    return;
  }

  // ── 2. Tier check ───────────────────────────────────────────────────────────
  if (!tierAllowsSocial(org.tier)) {
    logger.info({ orgId: org.id, tier: org.tier }, "[site-hook] Org tier does not include social — logging only");
    await logAction("tier_insufficient");
    res.json({ received: true, action: "tier_insufficient" });
    return;
  }

  // ── 3. Priority gate ────────────────────────────────────────────────────────
  // internal category or "internal"/"low" priority = log only, don't post
  if (category === "internal" || priority === "internal" || priority === "low") {
    logger.info({ orgId: org.id, eventType, priority }, "[site-hook] Internal/low priority — logging only");
    await logAction("logged_only");
    res.json({ received: true, action: "logged_only" });
    return;
  }

  // Also skip known internal-only event types regardless of strategy
  const INTERNAL_EVENTS = new Set(["ticket.purchased", "vendor.registered"]);
  if (INTERNAL_EVENTS.has(eventType)) {
    await logAction("logged_only");
    res.json({ received: true, action: "logged_only" });
    return;
  }

  // ── 4. Cadence check ────────────────────────────────────────────────────────
  if (cadenceKey && cadenceLimitPerDay > 0) {
    const limited = await cadenceLimitReached(org.id, cadenceKey, cadenceLimitPerDay);
    if (limited) {
      logger.info({ orgId: org.id, cadenceKey, cadenceLimitPerDay }, "[site-hook] Cadence limit reached — skipping post");
      await logAction("cadence_skipped");
      res.json({ received: true, action: "cadence_skipped" });
      return;
    }
  }

  // ── 5. Find connected accounts, intersect with suggestedPlatforms ───────────
  // Normalise "x" → "twitter" (our DB uses "twitter"; framework may send "x")
  const normalisedSuggested = suggestedPlatforms.map(p => (p === "x" ? "twitter" : p));

  const connectedAccounts = await db
    .select({ id: socialAccountsTable.id, platform: socialAccountsTable.platform, accessToken: socialAccountsTable.accessToken, accountId: socialAccountsTable.accountId })
    .from(socialAccountsTable)
    .where(and(
      eq(socialAccountsTable.orgId, org.id),
      eq(socialAccountsTable.isConnected, true),
    ));

  const connectedPlatforms = new Set(connectedAccounts.map(a => a.platform));

  // If suggestedPlatforms is empty, fall back to all connected (excluding Instagram for auto)
  const targetPlatforms = normalisedSuggested.length > 0
    ? normalisedSuggested.filter(p => connectedPlatforms.has(p) && p !== "instagram")
    : [...connectedPlatforms].filter(p => p !== "instagram");

  if (targetPlatforms.length === 0) {
    logger.info({ orgId: org.id, eventType }, "[site-hook] No connected accounts match suggestedPlatforms");
    await logAction("no_accounts");
    res.json({ received: true, action: "no_accounts" });
    return;
  }

  // ── 6. Build context prompt ─────────────────────────────────────────────────
  const contextPrompt = buildHookContextPrompt(eventType, data, org.name);
  const tone = suggestedTone || "professional and welcoming";

  // ── 7. Resolve image ────────────────────────────────────────────────────────
  // Instagram is excluded from automation — so we only pass mediaUrl for fb/twitter
  // if an image is available and the strategy requests one.
  const mediaUrl = (includeImage ? (data.imageUrl ?? data.coverImageUrl ?? null) : null) as string | null;

  // ── 8. Generate copy and schedule posts ─────────────────────────────────────
  const generatedPostIds: string[] = [];

  for (const platform of targetPlatforms) {
    try {
      const content = await generatePostCopy(org.name, platform, contextPrompt, tone);
      if (!content) continue;

      // urgent + postImmediately → schedule 60s from now (near-instant)
      // high → schedule 5 min from now
      // normal → schedule per strategy timing (we use 30 min as default)
      let delayMs: number;
      if (priority === "urgent" && postImmediately) {
        delayMs = 60 * 1000; // 1 minute
      } else if (priority === "high") {
        delayMs = 5 * 60 * 1000; // 5 minutes
      } else {
        delayMs = 30 * 60 * 1000; // 30 minutes (normal cadence)
      }

      const scheduledAt = new Date(Date.now() + delayMs);

      const [post] = await db.insert(socialPostsTable).values({
        orgId: org.id,
        platforms: [platform],
        content,
        mediaUrl,
        status: "scheduled",
        scheduledAt,
      }).returning({ id: socialPostsTable.id });

      if (post?.id) generatedPostIds.push(post.id);
      logger.info({ orgId: org.id, platform, postId: post?.id, delayMs, eventType }, "[site-hook] Post queued");
    } catch (err) {
      logger.error({ err, platform, orgId: org.id, eventType }, "[site-hook] Failed to generate/queue post for platform");
    }
  }

  // ── 9. Increment cadence counter ────────────────────────────────────────────
  if (generatedPostIds.length > 0 && cadenceKey) {
    await incrementCadence(org.id, cadenceKey).catch(e =>
      logger.warn({ e }, "[site-hook] Failed to increment cadence log"),
    );
  }

  // ── 10. Log action ──────────────────────────────────────────────────────────
  const action = generatedPostIds.length > 0
    ? (priority === "urgent" && postImmediately ? "posted_immediately" : "queued")
    : "no_content";
  await logAction(action);

  res.json({
    received: true,
    action,
    postsQueued: generatedPostIds.length,
    postIds: generatedPostIds,
  });
});

export default router;
