import {
  db,
  sitesTable,
  siteUpdateSchedulesTable,
  recurringEventTemplatesTable,
  eventsTable,
} from "@workspace/db";
import { eq, lte, and } from "drizzle-orm";
import { logger } from "./lib/logger";
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

const SCHEDULE_INTERVAL_MS = 30 * 60 * 1000;

export function startScheduler(): void {
  logger.info("Starting schedulers (site updates + recurring events, interval: 30min)");

  runDueSchedules().catch((err: unknown) => {
    logger.warn({ err }, "Initial schedule check failed");
  });

  runDueRecurringTemplates().catch((err: unknown) => {
    logger.warn({ err }, "Initial recurring template check failed");
  });

  setInterval(() => {
    runDueSchedules().catch((err: unknown) => {
      logger.warn({ err }, "Scheduled run failed");
    });
    runDueRecurringTemplates().catch((err: unknown) => {
      logger.warn({ err }, "Recurring template run failed");
    });
  }, SCHEDULE_INTERVAL_MS);
}
