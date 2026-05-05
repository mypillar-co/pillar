import * as chrono from "chrono-node";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, eventsTable } from "@workspace/db";
import { scheduleSiteAutoUpdate } from "./scheduleSiteAutoUpdate";

export type EventMutationStatus = "completed" | "clarification_required" | "error";

export type EventMutationIntent =
  | "update_event_date"
  | "update_event_time"
  | "update_event_title"
  | "update_event_location"
  | "update_event_description"
  | "publish_event"
  | "unpublish_event";

type EventRow = typeof eventsTable.$inferSelect;

export type DeterministicEventMutationResult = {
  status: EventMutationStatus;
  intent: EventMutationIntent;
  message: string;
  data?: Record<string, unknown>;
};

const FALLBACK_TIME_ZONE = "America/New_York";
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return null;
  }
}

async function resolveOrgTimeZone(orgId: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT site_config
    FROM organizations
    WHERE id = ${orgId}
    LIMIT 1
  `);
  const row = result.rows[0] as { site_config?: unknown } | undefined;
  const config = isRecord(row?.site_config) ? row.site_config : {};
  return (
    safeTimeZone(config.timeZone) ||
    safeTimeZone(config.timezone) ||
    safeTimeZone(config.orgTimeZone) ||
    safeTimeZone(config.eventTimeZone) ||
    safeTimeZone(process.env.ORG_DEFAULT_TIMEZONE) ||
    FALLBACK_TIME_ZONE
  );
}

function stripPunctuation(value: string): string {
  return value.replace(/[.?!]\s*$/, "").trim();
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eventSummary(event: EventRow): Record<string, unknown> {
  return {
    id: event.id,
    name: event.name,
    slug: event.slug,
    startDate: event.startDate ?? null,
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
    location: event.location ?? null,
    description: event.description ?? null,
    status: event.status ?? null,
    isActive: event.isActive,
    showOnPublicSite: event.showOnPublicSite,
  };
}

function detectEventMutationIntent(message: string): EventMutationIntent | null {
  const lower = message.toLowerCase();
  if (/\b(rename|retitle)\b/.test(lower)) return "update_event_title";
  if (/\b(change|update|set|move|reschedule)\b/.test(lower) && /\b(title|name)\b/.test(lower)) return "update_event_title";
  if (/\b(change|update|set|move|reschedule)\b/.test(lower) && /\b(location|venue|address|where)\b/.test(lower)) return "update_event_location";
  if (/\b(change|update|set|rewrite)\b/.test(lower) && /\b(description|details|summary|copy)\b/.test(lower)) return "update_event_description";
  if (/\b(unpublish|hide|take\s+(?:it|the event)\s+offline)\b/.test(lower) && /\bevent\b/.test(lower)) return "unpublish_event";
  if (/\bpublish\b/.test(lower) && /\bevent\b/.test(lower)) return "publish_event";
  if (/\b(change|update|set|move|reschedule)\b/.test(lower) && /\b(time)\b/.test(lower)) return "update_event_time";
  if (/\b(change|update|set|move|reschedule)\b/.test(lower) && /\b(date|day|tomorrow|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2})\b/.test(lower)) {
    return "update_event_date";
  }
  return null;
}

export function hasDeterministicEventMutationIntent(message: string): boolean {
  return detectEventMutationIntent(message) !== null;
}

function phraseAfterLastTo(message: string): string | null {
  const parts = message.split(/\bto\b/i);
  if (parts.length < 2) return null;
  return stripPunctuation(parts[parts.length - 1] ?? "");
}

function extractTitle(message: string): string | null {
  const rename = message.match(/\b(?:rename|retitle|call)\b\s+(.+?)\s+\b(?:to|as)\b\s+(.+)$/i);
  if (rename?.[2]) return stripPunctuation(rename[2]);
  const after = phraseAfterLastTo(message);
  return after && after.length >= 2 ? after : null;
}

function extractLocation(message: string): string | null {
  const after = phraseAfterLastTo(message);
  return after && after.length >= 2 ? after : null;
}

function extractDescription(message: string): string | null {
  const quoted = message.match(/["“]([^"”]+)["”]/)?.[1]?.trim();
  if (quoted) return quoted;
  const after = phraseAfterLastTo(message);
  return after && after.length >= 2 ? after : null;
}

function extractDatePhrase(message: string): string | null {
  const after = phraseAfterLastTo(message);
  if (after) return after;
  const match = message.match(/\b(?:on|for|at)\s+(.+)$/i);
  return match?.[1] ? stripPunctuation(match[1]) : null;
}

function datePartsInZone(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = WEEKDAY_INDEX[value("weekday").toLowerCase()];
  if (typeof weekday !== "number") {
    throw new Error(`Unable to resolve weekday in timezone ${timeZone}`);
  }
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday,
  };
}

function dateFromParts(parts: Pick<DateParts, "year" | "month" | "day">): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = dateFromParts(parts);
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

function formatDateParts(parts: Pick<DateParts, "year" | "month" | "day">): string {
  const year = parts.year;
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: Date, timeZone: string): string {
  return formatDateParts(datePartsInZone(date, timeZone));
}

function formatTimeParts(hour: number, minute: number | null = 0): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute ?? 0).padStart(2, "0")} ${period}`;
}

function formatHumanDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function timeWasParsed(result: chrono.ParsedResult): boolean {
  return (
    result.start.isCertain("hour") ||
    result.start.isCertain("minute") ||
    /(?:am|pm|\d:\d{2}|morning|afternoon|evening|tonight|noon|midnight)/i.test(result.text)
  );
}

function parseDeterministicDateTime(
  rawPhrase: string,
  referenceInstant: Date,
  timeZone: string,
): { date?: string; time?: string; humanDate?: string; parsedDate: Date } | null {
  const phrase = stripPunctuation(rawPhrase);
  if (!phrase) return null;
  const referenceParts = datePartsInZone(referenceInstant, timeZone);
  const referenceDate = new Date(referenceParts.year, referenceParts.month - 1, referenceParts.day, 12, 0, 0, 0);
  const weekdayOverride = phrase.match(/\b(this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  const phraseForChrono = (() => {
    if (!weekdayOverride) return phrase;
    const modifier = weekdayOverride[1].toLowerCase();
    const weekday = weekdayOverride[2].toLowerCase();
    const target = WEEKDAY_INDEX[weekday];
    const current = referenceParts.weekday;
    let delta = (target - current + 7) % 7;
    if (modifier === "next" && delta === 0) delta = 7;
    if (modifier === "this" && delta === 0) delta = 0;
    if (modifier === "this" && delta < 0) delta += 7;
    return phrase.replace(weekdayOverride[0], formatDateParts(addDays(referenceParts, delta)));
  })();

  const results = chrono.casual.parse(phraseForChrono, referenceDate, { forwardDate: true });
  if (results.length !== 1) return null;

  const result = results[0];
  if (!result?.start) return null;
  if (!result.start.isCertain("day") && !result.start.isCertain("weekday")) return null;

  const parsedParts = {
    year: result.start.get("year") ?? referenceParts.year,
    month: result.start.get("month"),
    day: result.start.get("day"),
  };
  if (!parsedParts.month || !parsedParts.day) return null;
  const parsedDate = dateFromParts({
    year: parsedParts.year,
    month: parsedParts.month,
    day: parsedParts.day,
  });
  const parsed: { date?: string; time?: string; humanDate?: string; parsedDate: Date } = {
    parsedDate,
    date: formatDateParts({
      year: parsedParts.year,
      month: parsedParts.month,
      day: parsedParts.day,
    }),
    humanDate: formatHumanDate(parsedDate),
  };
  if (timeWasParsed(result)) {
    const hour = result.start.get("hour");
    if (typeof hour === "number") {
      parsed.time = formatTimeParts(hour, result.start.get("minute") ?? 0);
    }
  }
  return parsed;
}

async function loadCandidateEvents(orgId: string): Promise<EventRow[]> {
  return db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.orgId, orgId), eq(eventsTable.isActive, true)))
    .orderBy(asc(eventsTable.startDate), asc(eventsTable.name))
    .limit(100);
}

function resolveEventTarget(events: EventRow[], message: string, currentDate: string): EventRow | { clarification: string } {
  if (events.length === 0) {
    return { clarification: "I couldn't find any active events to update." };
  }

  const beforeTo = message.split(/\bto\b/i)[0] ?? message;
  const normalizedFull = normalize(message);
  const normalizedBeforeTo = normalize(beforeTo);
  const matches = events
    .map((event) => ({ event, normalizedName: normalize(event.name) }))
    .filter(({ normalizedName }) => normalizedName && (normalizedBeforeTo.includes(normalizedName) || normalizedFull.includes(normalizedName)))
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  if (matches.length === 1) return matches[0].event;
  if (matches.length > 1) {
    const longest = matches[0].normalizedName.length;
    const tied = matches.filter((match) => match.normalizedName.length === longest);
    if (tied.length === 1) return tied[0].event;
    return { clarification: `I found multiple matching events: ${tied.map((match) => match.event.name).join(", ")}. Which one should I update?` };
  }

  const upcoming = events.filter((event) => text(event.startDate) >= currentDate);
  if (events.length === 1) return events[0];
  if (upcoming.length === 1 && /\b(the|this|that)\s+event\b/i.test(message)) return upcoming[0];
  return { clarification: "Which event should I update? Include the event name, like “Change Spring Gala to next Saturday at 6pm.”" };
}

async function readEvent(orgId: string, eventId: string): Promise<EventRow | null> {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)))
    .limit(1);
  return event ?? null;
}

export async function updateEventByIdWithReadback(
  orgId: string,
  eventId: string,
  patch: Record<string, unknown>,
): Promise<EventRow | null> {
  if (!Object.keys(patch).length) return readEvent(orgId, eventId);
  await db
    .update(eventsTable)
    .set(patch)
    .where(and(eq(eventsTable.id, eventId), eq(eventsTable.orgId, orgId)));
  const saved = await readEvent(orgId, eventId);
  if (saved) scheduleSiteAutoUpdate(orgId).catch(() => {});
  return saved;
}

export async function applyDeterministicEventMutation(
  orgId: string,
  message: string,
  options?: { referenceInstant?: Date; timeZone?: string },
): Promise<DeterministicEventMutationResult | null> {
  const intent = detectEventMutationIntent(message);
  if (!intent) return null;

  const referenceInstant = options?.referenceInstant ?? new Date();
  const timeZone = options?.timeZone ?? (await resolveOrgTimeZone(orgId));
  const currentDate = formatDate(referenceInstant, timeZone);
  const events = await loadCandidateEvents(orgId);
  const target = resolveEventTarget(events, message, currentDate);
  if ("clarification" in target) {
    return { status: "clarification_required", intent, message: target.clarification };
  }

  if (intent === "update_event_title") {
    const nextTitle = extractTitle(message);
    if (!nextTitle) {
      return { status: "clarification_required", intent, message: "What should the new event title be?" };
    }
    const saved = await updateEventByIdWithReadback(orgId, target.id, { name: nextTitle });
    if (!saved || saved.name !== nextTitle) {
      return { status: "error", intent, message: "Event title could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: `${target.name} renamed to ${saved.name}.`,
      data: { event: eventSummary(saved) },
    };
  }

  if (intent === "update_event_location") {
    const location = extractLocation(message);
    if (!location) {
      return { status: "clarification_required", intent, message: "What location should I save for this event?" };
    }
    const saved = await updateEventByIdWithReadback(orgId, target.id, { location });
    if (!saved || saved.location !== location) {
      return { status: "error", intent, message: "Event location could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: `${saved.name} location updated to ${saved.location}.`,
      data: { event: eventSummary(saved) },
    };
  }

  if (intent === "update_event_description") {
    const description = extractDescription(message);
    if (!description) {
      return { status: "clarification_required", intent, message: "What description should I save for this event?" };
    }
    const saved = await updateEventByIdWithReadback(orgId, target.id, { description });
    if (!saved || saved.description !== description) {
      return { status: "error", intent, message: "Event description could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: `${saved.name} description updated.`,
      data: { event: eventSummary(saved) },
    };
  }

  if (intent === "publish_event" || intent === "unpublish_event") {
    const patch = intent === "publish_event"
      ? { status: "published", isActive: true, showOnPublicSite: true }
      : { status: "draft", showOnPublicSite: false };
    const saved = await updateEventByIdWithReadback(orgId, target.id, patch);
    if (!saved) {
      return { status: "error", intent, message: "Event could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: intent === "publish_event" ? `${saved.name} published.` : `${saved.name} unpublished.`,
      data: { event: eventSummary(saved) },
    };
  }

  const rawPhrase = extractDatePhrase(message);
  if (!rawPhrase) {
    return { status: "clarification_required", intent, message: "What date or time should I save for this event?" };
  }
  const parsed = parseDeterministicDateTime(rawPhrase, referenceInstant, timeZone);
  if (!parsed) {
    return { status: "clarification_required", intent, message: `I couldn't confidently parse “${rawPhrase}.” Please use a date like “May 14 at 7pm.”` };
  }

  const patch: Record<string, unknown> = {};
  if (intent === "update_event_date" && parsed.date) patch.startDate = parsed.date;
  if (parsed.time) patch.startTime = parsed.time;
  if (intent === "update_event_time" && !parsed.time) {
    return { status: "clarification_required", intent, message: `I found a date in “${rawPhrase}” but not a specific time.` };
  }

  const saved = await updateEventByIdWithReadback(orgId, target.id, patch);
  if (!saved) {
    return { status: "error", intent, message: "Event date/time could not be verified after saving." };
  }

  const humanDate = parsed.humanDate ?? saved.startDate ?? "the saved date";
  const humanTime = saved.startTime ? ` at ${saved.startTime}` : "";
  return {
    status: "completed",
    intent,
    message: `${saved.name} updated to ${humanDate}${humanTime}.`,
    data: { event: eventSummary(saved), parsed: { rawPhrase, startDate: saved.startDate, startTime: saved.startTime } },
  };
}
