import {
  db,
  sitesTable,
  siteUpdateSchedulesTable,
  recurringEventTemplatesTable,
  eventsTable,
  socialPostsTable,
  socialAccountsTable,
  automationRulesTable,
  contentStrategyTable,
  organizationsTable,
  ticketSalesTable,
  ticketTypesTable,
  registrationsTable,
} from "@workspace/db";
import {
  runCustomerSuccessAgent,
  runOperationsAgent,
  runContentAgent,
  runOutreachAgent,
} from "./agents";
import { checkAndRenewDomains, checkSslProvisioning, pollDnsPropagation } from "./routes/domains";
import { eq, lte, and, gte, lt, isNotNull, sql } from "drizzle-orm";
import { logger } from "./lib/logger";
import { decryptToken } from "./lib/tokenCrypto";
import { withSchedulerLock } from "./lib/schedulerLock";
import sanitizeHtml from "sanitize-html";
import OpenAI from "openai";
import { getUncachableStripeClient } from "./stripeClient";

const SITE_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "html", "head", "body", "title", "meta", "link", "style",
    "header", "footer", "main", "section", "article", "aside", "nav",
    "figure", "figcaption", "picture", "source", "video", "audio",
    "canvas", "details", "summary", "dialog", "template",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "svg", "path", "circle", "rect", "line", "polygon", "g",
  ]),
  allowedAttributes: {
    "*": ["class", "id", "style", "href", "src", "alt", "title", "aria-*", "data-*",
          "width", "height", "target", "rel", "type", "name", "content", "charset",
          "viewBox", "xmlns", "fill", "stroke", "d", "cx", "cy", "r", "x", "y",
          "x1", "y1", "x2", "y2", "points", "transform"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  disallowedTagsMode: "discard",
};

const MAX_CHANGE_TOKENS = 6000;

function getOpenAIClient() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "Replit AI integration not configured: AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must be set"
    );
  }
  return new OpenAI({ apiKey, baseURL });
}

async function callOpenAI(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
  model: "gpt-5-mini" | "gpt-4o-mini" = "gpt-5-mini",
): Promise<string> {
  const client = getOpenAIClient();
  const params: Record<string, unknown> = { model, messages };
  if (model === "gpt-5-mini") {
    params.max_completion_tokens = maxTokens;
  } else {
    params.max_tokens = maxTokens;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.chat.completions.create as any)(params);
  return response.choices[0]?.message?.content ?? "";
}

function computeNextRun(frequency: string, dayOfWeek?: string | null): Date {
  const now = new Date();
  const next = new Date(now);
  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  } else if (frequency === "weekly") {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDay = days.indexOf((dayOfWeek ?? "monday").toLowerCase());
    const currentDay = next.getDay();
    const diff = (targetDay - currentDay + 7) % 7 || 7;
    next.setDate(next.getDate() + diff);
    next.setHours(9, 0, 0, 0);
  } else {
    next.setMonth(next.getMonth() + 1, 1);
    next.setHours(9, 0, 0, 0);
  }
  return next;
}

export async function runDueSchedules(): Promise<void> {
  const now = new Date();
  logger.info("Checking for due site update schedules");

  try {
    const dueSchedules = await db
      .select()
      .from(siteUpdateSchedulesTable)
      .where(and(
        eq(siteUpdateSchedulesTable.isActive, true),
        lte(siteUpdateSchedulesTable.nextRunAt, now),
      ));

    if (dueSchedules.length === 0) {
      logger.info("No due schedules found");
      return;
    }

    logger.info({ count: dueSchedules.length }, "Running due schedules");

    for (const schedule of dueSchedules) {
      try {
        const [site] = await db
          .select()
          .from(sitesTable)
          .where(eq(sitesTable.orgId, schedule.orgId));

        if (!site?.generatedHtml) {
          logger.warn({ orgId: schedule.orgId }, "Skipping schedule — no generated HTML found");
          continue;
        }

        const updateItems = schedule.updateItems ?? [];
        const custom = schedule.customInstructions ?? "";
        const instructions: string[] = [];

        if (updateItems.includes("events")) instructions.push("Update the events section with current upcoming events for the next 30 days");
        if (updateItems.includes("hours")) instructions.push("Ensure all operating hours and schedules appear current");
        if (updateItems.includes("announcements")) instructions.push("Refresh announcements or news to reflect that the organization is active and current");
        if (custom) instructions.push(custom);
        if (instructions.length === 0) instructions.push("Review and freshen any dated-looking content");

        const updatedHtml = await callOpenAI([
          {
            role: "system",
            content: `You are an expert web developer autonomously updating an organization's website as part of a scheduled job.
Apply the requested updates to the HTML. Keep all sections, styles, and structure intact.
Output ONLY the complete updated HTML document starting with <!DOCTYPE html>. No explanations or commentary.`,
          },
          {
            role: "user",
            content: `Current website HTML:\n${site.generatedHtml}\n\nScheduled update instructions:\n${instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}\n\nToday's date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\nApply all updates and output the complete updated HTML.`,
          },
        ], MAX_CHANGE_TOKENS, "gpt-4o-mini");

        let cleanedHtml = updatedHtml.trim();
        const htmlStart = cleanedHtml.indexOf("<!DOCTYPE");
        if (htmlStart > 0) cleanedHtml = cleanedHtml.substring(htmlStart);
        cleanedHtml = sanitizeHtml(cleanedHtml, SITE_HTML_SANITIZE_OPTIONS);

        const nextRunAt = computeNextRun(schedule.frequency, schedule.dayOfWeek);
        await db.update(sitesTable).set({ generatedHtml: cleanedHtml, proposedHtml: null, updatedAt: new Date() }).where(eq(sitesTable.orgId, schedule.orgId));
        await db.update(siteUpdateSchedulesTable).set({ lastRunAt: new Date(), nextRunAt, updatedAt: new Date() }).where(eq(siteUpdateSchedulesTable.id, schedule.id));

        logger.info({ orgId: schedule.orgId, nextRunAt }, "Schedule ran successfully");
      } catch (err) {
        logger.error({ err, orgId: schedule.orgId }, "Schedule run failed for org");
        const nextRunAt = computeNextRun(schedule.frequency, schedule.dayOfWeek);
        await db.update(siteUpdateSchedulesTable).set({ nextRunAt }).where(eq(siteUpdateSchedulesTable.id, schedule.id)).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, "Error running due schedules");
  }
}

// ─────────────────────────────────────────────────────────────────
// Recurring Event Automation
// ─────────────────────────────────────────────────────────────────

function computeNextEventOccurrence(
  frequency: string,
  dayOfWeek?: number | null,
  weekOfMonth?: number | null,
  dayOfMonth?: number | null,
  after?: Date,
): Date {
  const base = after ? new Date(after) : new Date();
  base.setDate(base.getDate() + 1);
  if (frequency === "weekly" && dayOfWeek != null) {
    while (base.getDay() !== dayOfWeek) base.setDate(base.getDate() + 1);
    return base;
  }
  if (frequency === "biweekly" && dayOfWeek != null) {
    while (base.getDay() !== dayOfWeek) base.setDate(base.getDate() + 1);
    base.setDate(base.getDate() + 7);
    return base;
  }
  if (frequency === "monthly") {
    if (dayOfMonth != null) {
      base.setDate(1);
      base.setMonth(base.getMonth() + 1);
      const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      base.setDate(Math.min(dayOfMonth, maxDay));
      return base;
    }
    if (weekOfMonth != null && dayOfWeek != null) {
      base.setDate(1);
      base.setMonth(base.getMonth() + 1);
      let c = 0;
      while (true) {
        if (base.getDay() === dayOfWeek) { c++; if (c === weekOfMonth) break; }
        base.setDate(base.getDate() + 1);
      }
      return base;
    }
  }
  base.setMonth(base.getMonth() + 1);
  return base;
}

async function runDueRecurringTemplates(): Promise<void> {
  const now = new Date();
  logger.info("Checking for due recurring event templates");

  try {
    const dueTemplates = await db
      .select()
      .from(recurringEventTemplatesTable)
      .where(
        and(
          eq(recurringEventTemplatesTable.isActive, true),
          lte(recurringEventTemplatesTable.nextGenerateAt, now),
        ),
      );

    if (dueTemplates.length === 0) {
      logger.info("No due recurring templates found");
      return;
    }

    logger.info({ count: dueTemplates.length }, "Running due recurring event templates");

    for (const template of dueTemplates) {
      try {
        // Use the stored nextGenerateAt as the event date to prevent schedule drift.
        // Compute the FOLLOWING occurrence to advance the pointer.
        const eventDate = template.nextGenerateAt ?? new Date();
        const dateStr = eventDate.toISOString().split("T")[0];

        let generatedDescription = template.description ?? "";
        try {
          const aiClient = getOpenAIClient();
          const completion = await aiClient.chat.completions.create({
            model: "gpt-5-mini",
            max_completion_tokens: 200,
            messages: [
              {
                role: "system",
                content:
                  "You are an AI assistant for a civic organization. Generate a compelling event description (2-3 sentences, professional and welcoming) for a recurring event. Reply with only the description text.",
              },
              {
                role: "user",
                content: `Event: ${template.name}\nDate: ${dateStr}\nTime: ${template.startTime ?? "TBD"}\nLocation: ${template.location ?? "TBD"}\nType: ${template.eventType ?? "general"}\nBase description: ${template.description ?? ""}`,
              },
            ],
          });
          generatedDescription = completion.choices[0]?.message?.content?.trim() ?? generatedDescription;
        } catch (aiErr) {
          logger.warn({ aiErr, templateId: template.id }, "AI description failed, using base description");
        }

        const slug = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
        await db.insert(eventsTable).values({
          orgId: template.orgId,
          name: template.name,
          slug,
          description: generatedDescription,
          eventType: template.eventType ?? undefined,
          location: template.location ?? undefined,
          startTime: template.startTime ?? undefined,
          startDate: dateStr,
          isRecurring: true,
          recurringTemplateId: template.id,
          status: "draft",
          isActive: true,
        });

        const followingDate = computeNextEventOccurrence(
          template.frequency,
          template.dayOfWeek,
          template.weekOfMonth,
          template.dayOfMonth,
          eventDate,
        );
        await db.update(recurringEventTemplatesTable)
          .set({ lastGeneratedAt: now, nextGenerateAt: followingDate })
          .where(eq(recurringEventTemplatesTable.id, template.id));

        logger.info({ templateId: template.id, nextDate: dateStr }, "Recurring event generated");
      } catch (err) {
        logger.error({ err, templateId: template.id }, "Recurring event generation failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error running due recurring templates");
  }
}

// ─────────────────────────────────────────────────────────────────
// Social Post Publishing
// ─────────────────────────────────────────────────────────────────

const MAX_POST_RETRIES = 3;
const RETRY_DELAY_MS = 60 * 60 * 1000;

async function publishToFacebook(content: string, encryptedToken: string, pageId?: string | null): Promise<string> {
  const accessToken = decryptToken(encryptedToken);
  const targetId = pageId ?? "me";
  const url = `https://graph.facebook.com/v19.0/${targetId}/feed`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: content, access_token: accessToken }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Facebook API error: ${resp.status}`);
  }
  const data = await resp.json() as { id?: string };
  return data.id ?? "";
}

async function publishToInstagram(content: string, encryptedToken: string, pageId?: string | null, mediaUrl?: string | null): Promise<string> {
  const accessToken = decryptToken(encryptedToken);
  if (!pageId) throw new Error("Instagram Business Account ID required");
  if (!mediaUrl) throw new Error("Instagram posts require an image URL (mediaUrl). Text-only posts are not supported by the Instagram Graph API.");
  const createUrl = `https://graph.facebook.com/v19.0/${pageId}/media`;
  const createResp = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caption: content, media_type: "IMAGE", image_url: mediaUrl, access_token: accessToken }),
  });
  if (!createResp.ok) {
    const err = await createResp.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Instagram API error: ${createResp.status}`);
  }
  const { id: creationId } = await createResp.json() as { id: string };
  const publishUrl = `https://graph.facebook.com/v19.0/${pageId}/media_publish`;
  const publishResp = await fetch(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  });
  if (!publishResp.ok) {
    const err = await publishResp.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Instagram publish error: ${publishResp.status}`);
  }
  const { id } = await publishResp.json() as { id: string };
  return id;
}

async function publishToTwitter(content: string, encryptedToken: string): Promise<string> {
  const accessToken = decryptToken(encryptedToken);
  const resp = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text: content }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { detail?: string };
    throw new Error(err?.detail ?? `Twitter API error: ${resp.status}`);
  }
  const data = await resp.json() as { data?: { id?: string } };
  return data.data?.id ?? "";
}

async function runDueSocialPosts(): Promise<void> {
  const now = new Date();
  logger.info("Checking for due social posts");

  try {
    const duePosts = await db
      .select()
      .from(socialPostsTable)
      .where(and(
        eq(socialPostsTable.status, "scheduled"),
        lte(socialPostsTable.scheduledAt, now),
      ));

    if (duePosts.length === 0) return;
    logger.info({ count: duePosts.length }, "Publishing due social posts");

    for (const post of duePosts) {
      // Parse any platforms that already succeeded in a previous attempt
      const alreadySucceeded: Record<string, string> = post.externalPostIds
        ? (JSON.parse(post.externalPostIds) as Record<string, string>)
        : {};

      // Only attempt platforms that haven't succeeded yet
      const pendingPlatforms = post.platforms.filter(p => !(p in alreadySucceeded));

      const newSuccesses: Record<string, string> = {};
      const errors: string[] = [];

      for (const platform of pendingPlatforms) {
        const [account] = await db
          .select()
          .from(socialAccountsTable)
          .where(and(
            eq(socialAccountsTable.orgId, post.orgId),
            eq(socialAccountsTable.platform, platform),
            eq(socialAccountsTable.isConnected, true),
          ));

        if (!account) {
          errors.push(`No connected ${platform} account`);
          continue;
        }

        try {
          let postId = "";
          if (platform === "facebook") {
            postId = await publishToFacebook(post.content, account.accessToken, account.accountId);
          } else if (platform === "instagram") {
            postId = await publishToInstagram(post.content, account.accessToken, account.accountId, post.mediaUrl);
          } else if (platform === "twitter") {
            postId = await publishToTwitter(post.content, account.accessToken);
          } else {
            errors.push(`${platform}: unsupported platform`);
            continue;
          }
          newSuccesses[platform] = postId;
          logger.info({ platform, postId, orgId: post.orgId }, "Post published");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          errors.push(`${platform}: ${msg}`);
          logger.error({ err, platform, postId: post.id }, "Failed to publish to platform");

          // If the error looks like a token expiry / auth failure, mark the account
          // as disconnected so the user knows to reconnect — and stop retrying.
          const authFailure = /401|403|invalid.*(oauth|token)|token.*invalid|expired|Unauthorized/i.test(msg);
          if (authFailure) {
            await db.update(socialAccountsTable)
              .set({ isConnected: false, updatedAt: new Date() })
              .where(eq(socialAccountsTable.id, account.id));
            logger.warn({ platform, accountId: account.id, orgId: post.orgId }, "Auth failure detected — account marked disconnected");
          }
        }
      }

      // Merge previously succeeded platforms with newly succeeded platforms
      const allSucceeded: Record<string, string> = { ...alreadySucceeded, ...newSuccesses };
      const allPlatformsSucceeded = post.platforms.every(p => p in allSucceeded);
      const currentRetries = post.retryCount ?? 0;

      if (!allPlatformsSucceeded && errors.length > 0 && currentRetries < MAX_POST_RETRIES) {
        // Retry: reschedule, preserving already-succeeded platforms
        const retryAt = new Date(now.getTime() + RETRY_DELAY_MS);
        await db.update(socialPostsTable).set({
          status: "scheduled",
          scheduledAt: retryAt,
          retryCount: currentRetries + 1,
          externalPostIds: Object.keys(allSucceeded).length > 0 ? JSON.stringify(allSucceeded) : null,
          errorMessage: `Attempt ${currentRetries + 1}/${MAX_POST_RETRIES} — pending: ${errors.join("; ")}`,
          updatedAt: new Date(),
        }).where(eq(socialPostsTable.id, post.id));
        logger.warn({ postId: post.id, retryCount: currentRetries + 1, retryAt, errors }, "Partial publish failure — scheduled for retry");
      } else {
        // All platforms succeeded, or we've exhausted retries
        const finalStatus = allPlatformsSucceeded ? "published" : "failed";
        await db.update(socialPostsTable).set({
          status: finalStatus,
          publishedAt: finalStatus === "published" ? now : null,
          externalPostIds: Object.keys(allSucceeded).length > 0 ? JSON.stringify(allSucceeded) : null,
          errorMessage: errors.length > 0 ? `Final: ${errors.join("; ")}` : null,
          updatedAt: new Date(),
        }).where(eq(socialPostsTable.id, post.id));

        if (finalStatus === "failed") {
          logger.error({ postId: post.id, orgId: post.orgId, errors, allSucceeded }, "Post permanently failed after max retries");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Error processing due social posts");
  }
}

// ─────────────────────────────────────────────────────────────────
// Automation Rule Runner
// ─────────────────────────────────────────────────────────────────

function computeSocialNextRun(frequency: string, dayOfWeek?: string | null, timeOfDay?: string | null): Date {
  const now = new Date();
  const next = new Date(now);
  const [hh, mm] = (timeOfDay ?? "09:00").split(":").map(Number);
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

async function generateAndSchedulePost(
  orgId: string,
  orgName: string,
  platform: string,
  contextPrompt: string,
  tone: string,
  ruleId?: string,
): Promise<void> {
  // Instagram requires a hosted image URL for every post and cannot be
  // generated automatically without image hosting infrastructure.
  // Automation rules and Tier 3 strategy must exclude Instagram.
  if (platform === "instagram") {
    logger.warn({ orgId, platform }, "Skipping automated Instagram post: Instagram requires a media URL and is not supported in automation");
    return;
  }

  const platformGuidelines: Record<string, string> = {
    facebook: "Facebook post (up to 400 characters). Be engaging. Include a call to action.",
    twitter: "Tweet (under 280 characters). Be concise. 1-2 hashtags.",
  };
  const guideline = platformGuidelines[platform] ?? "Social media post (under 300 characters).";

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 512,
    messages: [
      {
        role: "system",
        content: `You are a social media content writer for ${orgName}. Tone: ${tone}. ${guideline} Output only the post text, no quotes or commentary.`,
      },
      { role: "user", content: contextPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!content) return;

  const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.insert(socialPostsTable).values({
    orgId,
    platforms: [platform],
    content,
    status: "scheduled",
    scheduledAt,
    automationRuleId: ruleId ?? null,
  });
}

async function buildContextPrompt(
  orgId: string,
  orgName: string,
  contentType: string,
  customPrompt: string | null,
  topics?: string[] | null,
  now?: Date,
): Promise<string> {
  const ts = now ?? new Date();
  if (customPrompt) return customPrompt;

  if (contentType === "events") {
    const upcoming = await db
      .select({ name: eventsTable.name, startDate: eventsTable.startDate, location: eventsTable.location })
      .from(eventsTable)
      .where(and(
        eq(eventsTable.orgId, orgId),
        eq(eventsTable.status, "published"),
        gte(eventsTable.startDate, ts.toISOString().split("T")[0]),
      ))
      .limit(3);

    if (upcoming.length > 0) {
      return `Upcoming events for ${orgName}:\n` +
        upcoming.map(e => `- ${e.name} on ${e.startDate ?? "TBD"}${e.location ? ` at ${e.location}` : ""}`).join("\n");
    }
    return `Write a general community update for ${orgName}.`;
  }

  if (contentType === "announcements") {
    return `Write a weekly organizational update announcement for ${orgName}.`;
  }

  if (topics && topics.length > 0) {
    return `Write a post about one of these topics for ${orgName}: ${topics.join(", ")}.`;
  }

  return `Write a general community post for ${orgName}.`;
}

async function runDueAutomationRules(): Promise<void> {
  const now = new Date();
  logger.info("Checking for due automation rules");

  try {
    const dueRules = await db
      .select()
      .from(automationRulesTable)
      .where(and(
        eq(automationRulesTable.isActive, true),
        lte(automationRulesTable.nextRunAt, now),
      ));

    if (dueRules.length === 0) return;
    logger.info({ count: dueRules.length }, "Running due automation rules");

    for (const rule of dueRules) {
      try {
        const [org] = await db
          .select({ name: organizationsTable.name, tier: organizationsTable.tier })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, rule.orgId));

        const orgName = org?.name ?? "our organization";

        let tone = "professional and welcoming";
        let strategyPlatforms: string[] | null = null;
        let strategyTopics: string[] | null = null;

        if (org?.tier === "tier3") {
          const [strategy] = await db
            .select()
            .from(contentStrategyTable)
            .where(eq(contentStrategyTable.orgId, rule.orgId));

          if (strategy) {
            tone = strategy.tone ?? tone;
            strategyTopics = strategy.topics ?? null;
            if (strategy.isAutonomous && strategy.platforms && strategy.platforms.length > 0) {
              strategyPlatforms = strategy.platforms;
            }
          }
        }

        const effectivePlatforms = strategyPlatforms ?? rule.platforms;

        const contextPrompt = await buildContextPrompt(
          rule.orgId,
          orgName,
          rule.contentType ?? "general",
          rule.customPrompt,
          strategyTopics,
          now,
        );

        for (const platform of effectivePlatforms) {
          try {
            await generateAndSchedulePost(rule.orgId, orgName, platform, contextPrompt, tone, rule.id);
            logger.info({ ruleId: rule.id, platform }, "Automation rule generated post");
          } catch (aiErr) {
            logger.error({ aiErr, ruleId: rule.id, platform }, "Failed to generate AI post for automation rule");
          }
        }

        const nextRunAt = computeSocialNextRun(rule.frequency, rule.dayOfWeek, rule.timeOfDay);
        await db.update(automationRulesTable)
          .set({ lastRunAt: now, nextRunAt, updatedAt: new Date() })
          .where(eq(automationRulesTable.id, rule.id));
      } catch (err) {
        logger.error({ err, ruleId: rule.id }, "Automation rule execution failed");
        const nextRunAt = computeSocialNextRun(rule.frequency, rule.dayOfWeek, rule.timeOfDay);
        await db.update(automationRulesTable).set({ nextRunAt }).where(eq(automationRulesTable.id, rule.id)).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, "Error running due automation rules");
  }
}

// ─────────────────────────────────────────────────────────────────
// Tier 3 Autonomous Campaign Runner
// Runs for Tier 3 orgs with isAutonomous=true content strategy.
// Uses strategy's postingFrequency/topics/tone/platforms to generate
// posts without requiring manual automation rules.
// ─────────────────────────────────────────────────────────────────

const FREQUENCY_TO_HOURS: Record<string, number> = {
  "daily": 20,
  "twice-weekly": 84,
  "weekly": 160,
  "biweekly": 320,
};

async function runTier3AutonomousCampaigns(): Promise<void> {
  const now = new Date();
  logger.info("Checking Tier 3 autonomous campaigns");

  try {
    const strategies = await db
      .select()
      .from(contentStrategyTable)
      .where(eq(contentStrategyTable.isAutonomous, true));

    for (const strategy of strategies) {
      try {
        const [org] = await db
          .select({ id: organizationsTable.id, name: organizationsTable.name, tier: organizationsTable.tier })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, strategy.orgId));

        if (org?.tier !== "tier3") continue;

        // Determine minimum interval between autonomous posts
        const minHours = FREQUENCY_TO_HOURS[strategy.postingFrequency ?? "weekly"] ?? 160;
        const windowStart = new Date(now.getTime() - minHours * 60 * 60 * 1000);

        // Skip if a post was already generated in the current window
        const recentPosts = await db
          .select({ id: socialPostsTable.id })
          .from(socialPostsTable)
          .where(and(
            eq(socialPostsTable.orgId, strategy.orgId),
            gte(socialPostsTable.createdAt, windowStart),
          ))
          .limit(1);

        if (recentPosts.length > 0) continue;

        const platforms = strategy.platforms && strategy.platforms.length > 0
          ? strategy.platforms
          : ["facebook"];

        const tone = strategy.tone ?? "professional and welcoming";
        const topics = strategy.topics ?? null;

        const contextPrompt = await buildContextPrompt(
          strategy.orgId,
          org.name,
          "general",
          null,
          topics,
          now,
        );

        for (const platform of platforms) {
          try {
            await generateAndSchedulePost(strategy.orgId, org.name, platform, contextPrompt, tone);
            logger.info({ orgId: strategy.orgId, platform }, "Tier 3 autonomous post generated");
          } catch (err) {
            logger.error({ err, orgId: strategy.orgId, platform }, "Failed to generate Tier 3 autonomous post");
          }
        }
      } catch (err) {
        logger.error({ err, orgId: strategy.orgId }, "Tier 3 autonomous campaign error");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error running Tier 3 autonomous campaigns");
  }
}

const SCHEDULE_INTERVAL_MS = 30 * 60 * 1000;
const SOCIAL_PUBLISH_INTERVAL_MS = 5 * 60 * 1000;
const DOMAIN_RENEWAL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SSL_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DNS_POLL_INTERVAL_MS = 15 * 60 * 1000;
const AGENT_CS_INTERVAL_MS = 30 * 60 * 1000;
const AGENT_OPS_INTERVAL_MS = 60 * 60 * 1000;
const AGENT_CONTENT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AGENT_OUTREACH_INTERVAL_MS = 60 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Three-layer payment reliability — Layer 3: background reconciler.
 * Layers 1 & 2 are the webhook handler + order-ID fallback in webhookHandlers.ts.
 * This job catches any pending ticket sales where the webhook was missed or
 * failed. It looks up each Stripe checkout session directly and reconciles
 * the payment_status so no sale stays stuck as "pending" indefinitely.
 */
async function reconcilePendingTicketSales(): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // older than 2 hours

  const pending = await db
    .select({
      id: ticketSalesTable.id,
      stripeCheckoutSessionId: ticketSalesTable.stripeCheckoutSessionId,
      ticketTypeId: ticketSalesTable.ticketTypeId,
      quantity: ticketSalesTable.quantity,
    })
    .from(ticketSalesTable)
    .where(
      and(
        eq(ticketSalesTable.paymentStatus, "pending"),
        isNotNull(ticketSalesTable.stripeCheckoutSessionId),
        lt(ticketSalesTable.createdAt, cutoff),
      ),
    )
    .limit(50);

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "[reconciler] Checking stale pending ticket sales");

  const stripe = await getUncachableStripeClient();

  for (const sale of pending) {
    if (!sale.stripeCheckoutSessionId) continue;
    try {
      const session = await stripe.checkout.sessions.retrieve(sale.stripeCheckoutSessionId);

      if (session.payment_status === "paid") {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null);

        await db
          .update(ticketSalesTable)
          .set({ paymentStatus: "paid", stripePaymentIntentId: paymentIntentId })
          .where(
            and(
              eq(ticketSalesTable.id, sale.id),
              sql`${ticketSalesTable.paymentStatus} != 'paid'`,
            ),
          );
        logger.info({ saleId: sale.id }, "[reconciler] Recovered paid ticket sale");

      } else if (session.status === "expired") {
        await db
          .update(ticketSalesTable)
          .set({ paymentStatus: "expired" })
          .where(eq(ticketSalesTable.id, sale.id));

        if (sale.ticketTypeId) {
          await db
            .update(ticketTypesTable)
            .set({ sold: sql`${ticketTypesTable.sold} - ${sale.quantity}` })
            .where(eq(ticketTypesTable.id, sale.ticketTypeId));
        }
        logger.info({ saleId: sale.id }, "[reconciler] Marked expired ticket sale, inventory released");
      }
      // session.status === "open" means it may still complete — leave pending
    } catch (err) {
      logger.warn({ saleId: sale.id, err }, "[reconciler] Failed to retrieve Stripe session");
    }
  }
}

// ─── Document Reminders ───────────────────────────────────────────────────────

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000; // every 24h
const REMINDER_CADENCE_DAYS = 7; // re-remind every 7 days

async function sendDocumentReminders(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - REMINDER_CADENCE_DAYS * 24 * 60 * 60 * 1000);

    // Find approved vendor registrations with upcoming events that still need docs
    const pending = await db
      .select({
        id: registrationsTable.id,
        email: registrationsTable.email,
        name: registrationsTable.name,
        orgId: registrationsTable.orgId,
        eventId: registrationsTable.eventId,
        servSafeUrl: registrationsTable.servSafeUrl,
        insuranceCertUrl: registrationsTable.insuranceCertUrl,
      })
      .from(registrationsTable)
      .where(
        and(
          eq(registrationsTable.type, "vendor"),
          eq(registrationsTable.status, "approved"),
        )
      );

    for (const reg of pending) {
      const needsServSafe = !reg.servSafeUrl;
      const needsInsurance = !reg.insuranceCertUrl;
      if (!needsServSafe && !needsInsurance) continue;
      if (!reg.email) continue;

      // Get event to check it's in the future
      if (!reg.eventId) continue;
      const [event] = await db
        .select({ name: eventsTable.name, slug: eventsTable.slug, startDate: eventsTable.startDate, orgId: eventsTable.orgId })
        .from(eventsTable)
        .where(eq(eventsTable.id, reg.eventId));
      if (!event?.startDate) continue;

      const eventDate = new Date(event.startDate);
      const daysUntil = Math.floor((eventDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysUntil < 0 || daysUntil > 60) continue; // only remind for events in next 60 days

      // Check if we've reminded recently - use raw SQL since these are migrated columns
      const rawRow = await db.execute(
        sql`SELECT last_servsafe_reminder, last_insurance_reminder FROM registrations WHERE id = ${reg.id}`
      );
      const raw = rawRow.rows?.[0] as Record<string, Date | null> | undefined;

      const [org] = await db
        .select({ name: organizationsTable.name, senderEmail: organizationsTable.senderEmail, slug: organizationsTable.slug })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, reg.orgId));
      if (!org) continue;

      const fromEmail = org.senderEmail ?? "noreply@mypillar.co";
      const uploadUrl = `https://${org.slug ?? ""}.mypillar.co/events/${event.slug}/vendor-apply`;

      if (needsServSafe) {
        const lastReminder = raw?.last_servsafe_reminder;
        if (!lastReminder || new Date(lastReminder) < cutoff) {
          const sendgridKey = process.env.SENDGRID_API_KEY;
          if (sendgridKey) {
            await fetch("https://api.sendgrid.com/v3/mail/send", {
              method: "POST",
              headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: reg.email, name: reg.name }] }],
                from: { email: fromEmail, name: org.name },
                subject: `Action Required: ServSafe Certificate for ${event.name}`,
                content: [{ type: "text/plain", value: `Hi ${reg.name},\n\nThis is a reminder that we still need your ServSafe certificate for the ${event.name} (${daysUntil} days away).\n\nPlease upload it here: ${uploadUrl}\n\nThanks,\n${org.name}` }],
              }),
            }).catch(() => {});
          }
          await db.execute(sql`UPDATE registrations SET last_servsafe_reminder = NOW() WHERE id = ${reg.id}`);
          logger.info({ regId: reg.id, email: reg.email }, "[doc-reminders] SerSafe reminder sent");
        }
      }

      if (needsInsurance) {
        const lastReminder = raw?.last_insurance_reminder;
        if (!lastReminder || new Date(lastReminder) < cutoff) {
          const sendgridKey = process.env.SENDGRID_API_KEY;
          if (sendgridKey) {
            await fetch("https://api.sendgrid.com/v3/mail/send", {
              method: "POST",
              headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: reg.email, name: reg.name }] }],
                from: { email: fromEmail, name: org.name },
                subject: `Action Required: Insurance Certificate for ${event.name}`,
                content: [{ type: "text/plain", value: `Hi ${reg.name},\n\nThis is a reminder that we still need your certificate of insurance for the ${event.name} (${daysUntil} days away).\n\nPlease upload it here: ${uploadUrl}\n\nThanks,\n${org.name}` }],
              }),
            }).catch(() => {});
          }
          await db.execute(sql`UPDATE registrations SET last_insurance_reminder = NOW() WHERE id = ${reg.id}`);
          logger.info({ regId: reg.id, email: reg.email }, "[doc-reminders] Insurance reminder sent");
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "[doc-reminders] Error sending document reminders");
  }
}

function locked(jobName: string, ttlMs: number, fn: () => Promise<void>): () => void {
  return () => {
    withSchedulerLock(jobName, ttlMs, fn).catch((err: unknown) => {
      logger.warn({ err, jobName }, "[scheduler-lock] Unexpected error");
    });
  };
}

export function startScheduler(): void {
  logger.info("Starting schedulers (site/events: 30min, social: 5min, domains: 6h, ssl: 1h, dns: 15min, AI agents: cs/30min ops/1h content/24h outreach/1h) — distributed locking enabled");

  // Initial runs — each job competes for the lock; only one instance wins
  locked("site-schedules", SCHEDULE_INTERVAL_MS, runDueSchedules)();
  locked("recurring-templates", SCHEDULE_INTERVAL_MS, runDueRecurringTemplates)();
  locked("social-posts", SOCIAL_PUBLISH_INTERVAL_MS, runDueSocialPosts)();
  locked("automation-rules", SCHEDULE_INTERVAL_MS, runDueAutomationRules)();
  locked("tier3-campaigns", SCHEDULE_INTERVAL_MS, runTier3AutonomousCampaigns)();
  locked("domain-renewal", DOMAIN_RENEWAL_INTERVAL_MS, checkAndRenewDomains)();
  locked("ssl-provisioning", SSL_CHECK_INTERVAL_MS, checkSslProvisioning)();
  locked("dns-propagation", DNS_POLL_INTERVAL_MS, pollDnsPropagation)();

  // Social post publishing every 5 minutes — locked to prevent duplicate publishes
  setInterval(locked("social-posts", SOCIAL_PUBLISH_INTERVAL_MS, runDueSocialPosts), SOCIAL_PUBLISH_INTERVAL_MS);

  // Payment reconciler — catches missed webhooks, runs every 30 min
  locked("ticket-reconciler", RECONCILE_INTERVAL_MS, reconcilePendingTicketSales)();
  setInterval(locked("ticket-reconciler", RECONCILE_INTERVAL_MS, reconcilePendingTicketSales), RECONCILE_INTERVAL_MS);

  // Site updates, recurring events, and automation rules every 30 minutes
  setInterval(() => {
    locked("site-schedules", SCHEDULE_INTERVAL_MS, runDueSchedules)();
    locked("recurring-templates", SCHEDULE_INTERVAL_MS, runDueRecurringTemplates)();
    locked("automation-rules", SCHEDULE_INTERVAL_MS, runDueAutomationRules)();
    locked("tier3-campaigns", SCHEDULE_INTERVAL_MS, runTier3AutonomousCampaigns)();
  }, SCHEDULE_INTERVAL_MS);

  // Domain jobs
  setInterval(locked("domain-renewal", DOMAIN_RENEWAL_INTERVAL_MS, checkAndRenewDomains), DOMAIN_RENEWAL_INTERVAL_MS);
  setInterval(locked("ssl-provisioning", SSL_CHECK_INTERVAL_MS, checkSslProvisioning), SSL_CHECK_INTERVAL_MS);
  setInterval(locked("dns-propagation", DNS_POLL_INTERVAL_MS, pollDnsPropagation), DNS_POLL_INTERVAL_MS);

  // ── AI Agents — locked so only one instance runs agents at a time ──────────
  locked("agent-customer-success", AGENT_CS_INTERVAL_MS, runCustomerSuccessAgent)();
  locked("agent-operations", AGENT_OPS_INTERVAL_MS, runOperationsAgent)();
  locked("agent-content", AGENT_CONTENT_INTERVAL_MS, runContentAgent)();
  locked("agent-outreach", AGENT_OUTREACH_INTERVAL_MS, runOutreachAgent)();

  setInterval(locked("agent-customer-success", AGENT_CS_INTERVAL_MS, runCustomerSuccessAgent), AGENT_CS_INTERVAL_MS);
  setInterval(locked("agent-operations", AGENT_OPS_INTERVAL_MS, runOperationsAgent), AGENT_OPS_INTERVAL_MS);
  setInterval(locked("agent-content", AGENT_CONTENT_INTERVAL_MS, runContentAgent), AGENT_CONTENT_INTERVAL_MS);
  setInterval(locked("agent-outreach", AGENT_OUTREACH_INTERVAL_MS, runOutreachAgent), AGENT_OUTREACH_INTERVAL_MS);

  // Document reminders — run daily for vendors missing SerSafe/insurance docs
  locked("doc-reminders", REMINDER_INTERVAL_MS, sendDocumentReminders)();
  setInterval(locked("doc-reminders", REMINDER_INTERVAL_MS, sendDocumentReminders), REMINDER_INTERVAL_MS);
}
