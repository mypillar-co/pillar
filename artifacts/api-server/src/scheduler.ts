import { db, sitesTable, siteUpdateSchedulesTable } from "@workspace/db";
import { eq, lte, and } from "drizzle-orm";
import { logger } from "./lib/logger";

const MAX_CHANGE_TOKENS = 6000;

async function callClaude(
  messages: { role: string; content: string }[],
  system: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
  const data = await response.json() as { content: { type: string; text: string }[] };
  return data.content?.[0]?.text ?? "";
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

        const runSystem = `You are an expert web developer autonomously updating an organization's website as part of a scheduled job.
Apply the requested updates to the HTML. Keep all sections, styles, and structure intact.
Output ONLY the complete updated HTML document starting with <!DOCTYPE html>. No explanations or commentary.`;

        const runPrompt = `Current website HTML:
${site.generatedHtml}

Scheduled update instructions:
${instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}

Today's date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Apply all updates and output the complete updated HTML.`;

        const updatedHtml = await callClaude([{ role: "user", content: runPrompt }], runSystem, MAX_CHANGE_TOKENS);
        let cleanedHtml = updatedHtml.trim();
        if (!cleanedHtml.startsWith("<!DOCTYPE") && !cleanedHtml.startsWith("<html")) {
          const idx = cleanedHtml.indexOf("<!DOCTYPE");
          cleanedHtml = idx >= 0 ? cleanedHtml.substring(idx) : cleanedHtml;
        }

        const nextRunAt = computeNextRun(schedule.frequency, schedule.dayOfWeek);
        await db.update(sitesTable).set({ generatedHtml: cleanedHtml, updatedAt: new Date() }).where(eq(sitesTable.orgId, schedule.orgId));
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

const SCHEDULE_INTERVAL_MS = 30 * 60 * 1000;

export function startScheduler(): void {
  logger.info("Starting site update scheduler (interval: 30min)");

  runDueSchedules().catch((err: unknown) => {
    logger.warn({ err }, "Initial schedule check failed");
  });

  setInterval(() => {
    runDueSchedules().catch((err: unknown) => {
      logger.warn({ err }, "Scheduled run failed");
    });
  }, SCHEDULE_INTERVAL_MS);
}
