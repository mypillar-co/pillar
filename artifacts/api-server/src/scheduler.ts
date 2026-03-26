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
} from "@workspace/db";
import { eq, lte, and, gte } from "drizzle-orm";
import { logger } from "./lib/logger";
import { decryptToken } from "./lib/tokenCrypto";
import OpenAI from "openai";

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
): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: "gpt-5-mini",
    max_tokens: maxTokens,
    messages,
  });
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
        ], MAX_CHANGE_TOKENS);

        let cleanedHtml = updatedHtml.trim();
        const htmlStart = cleanedHtml.indexOf("<!DOCTYPE");
        if (htmlStart > 0) cleanedHtml = cleanedHtml.substring(htmlStart);

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
            max_tokens: 200,
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

async function publishToInstagram(content: string, encryptedToken: string, pageId?: string | null): Promise<string> {
  const accessToken = decryptToken(encryptedToken);
  if (!pageId) throw new Error("Instagram Business Account ID required");
  const createUrl = `https://graph.facebook.com/v19.0/${pageId}/media`;
  const createResp = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caption: content, media_type: "TEXT", access_token: accessToken }),
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
      const externalIds: Record<string, string> = {};
      const errors: string[] = [];

      for (const platform of post.platforms) {
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
            postId = await publishToInstagram(post.content, account.accessToken, account.accountId);
          } else if (platform === "twitter") {
            postId = await publishToTwitter(post.content, account.accessToken);
          }
          externalIds[platform] = postId;
          logger.info({ platform, postId, orgId: post.orgId }, "Post published");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          errors.push(`${platform}: ${msg}`);
          logger.error({ err, platform, postId: post.id }, "Failed to publish to platform");
        }
      }

      const currentRetries = post.retryCount ?? 0;
      const allFailed = errors.length > 0 && Object.keys(externalIds).length === 0;
      const someFailed = errors.length > 0;

      if (allFailed && currentRetries < MAX_POST_RETRIES) {
        const retryAt = new Date(now.getTime() + RETRY_DELAY_MS);
        await db.update(socialPostsTable).set({
          status: "scheduled",
          scheduledAt: retryAt,
          retryCount: currentRetries + 1,
          errorMessage: `Attempt ${currentRetries + 1}/${MAX_POST_RETRIES}: ${errors.join("; ")}`,
          updatedAt: new Date(),
        }).where(eq(socialPostsTable.id, post.id));
        logger.warn({ postId: post.id, retryCount: currentRetries + 1, retryAt }, "Post publish failed — scheduled for retry");
      } else {
        const finalStatus = allFailed && currentRetries >= MAX_POST_RETRIES ? "failed" : (someFailed ? "published" : "published");
        await db.update(socialPostsTable).set({
          status: finalStatus,
          publishedAt: finalStatus === "published" ? now : null,
          externalPostIds: Object.keys(externalIds).length > 0 ? JSON.stringify(externalIds) : null,
          errorMessage: errors.length > 0 ? `Final attempt: ${errors.join("; ")}` : null,
          updatedAt: new Date(),
        }).where(eq(socialPostsTable.id, post.id));

        if (finalStatus === "failed") {
          logger.error({ postId: post.id, orgId: post.orgId, errors }, "Post permanently failed after max retries");
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
  const platformGuidelines: Record<string, string> = {
    facebook: "Facebook post (up to 400 characters). Be engaging. Include a call to action.",
    instagram: "Instagram caption (up to 300 characters). Include 3-5 hashtags.",
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

        if (org?.tier === "tier3") {
          const [strategy] = await db
            .select()
            .from(contentStrategyTable)
            .where(eq(contentStrategyTable.orgId, rule.orgId));

          if (strategy) {
            tone = strategy.tone ?? tone;
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
          null,
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

const SCHEDULE_INTERVAL_MS = 30 * 60 * 1000;

export function startScheduler(): void {
  logger.info("Starting schedulers (site updates + recurring events + social, interval: 30min)");

  runDueSchedules().catch((err: unknown) => {
    logger.warn({ err }, "Initial schedule check failed");
  });

  runDueRecurringTemplates().catch((err: unknown) => {
    logger.warn({ err }, "Initial recurring template check failed");
  });

  runDueSocialPosts().catch((err: unknown) => {
    logger.warn({ err }, "Initial social posts check failed");
  });

  runDueAutomationRules().catch((err: unknown) => {
    logger.warn({ err }, "Initial automation rules check failed");
  });

  setInterval(() => {
    runDueSchedules().catch((err: unknown) => {
      logger.warn({ err }, "Scheduled run failed");
    });
    runDueRecurringTemplates().catch((err: unknown) => {
      logger.warn({ err }, "Recurring template run failed");
    });
    runDueSocialPosts().catch((err: unknown) => {
      logger.warn({ err }, "Social posts run failed");
    });
    runDueAutomationRules().catch((err: unknown) => {
      logger.warn({ err }, "Automation rules run failed");
    });
  }, SCHEDULE_INTERVAL_MS);
}
