import { readSiteConfig, saveSiteConfigPatch } from "./siteConfigPersistence";

type SiteEditStatus = "completed" | "error";

export type DeterministicSiteEditIntent =
  | "update_contact_email"
  | "update_contact_phone"
  | "update_hours"
  | "update_cta_label"
  | "update_cta_href"
  | "create_custom_page";

export type DeterministicSiteEditResult = {
  status: SiteEditStatus;
  intent: DeterministicSiteEditIntent;
  message: string;
  httpStatus?: number;
  data?: Record<string, unknown>;
  publicOrgId?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_IN_TEXT_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_IN_TEXT_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const URL_IN_TEXT_RE = /(https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*|#[A-Za-z0-9_-][A-Za-z0-9_-]*)/i;
const DAY_RE = /\b(every\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i;
const TIME_RE = /\b((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)|noon|midnight)(?:\s*[-–—]\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)))?/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "page";
}

function sentenceCase(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, " ").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned;
}

function extractRequestedPageTitle(message: string): string | null {
  const quoted = message.match(/new page called\s+["'`]?([^"'`]+?)["'`]?(?:\s+and|\s+with|\.|$)/i);
  if (quoted?.[1]) return sentenceCase(quoted[1]);
  const titled = message.match(/new page\s+["'`]?([^"'`.]+?)["'`]?(?:\s+and|\s+with|\.|$)/i);
  return titled?.[1] ? sentenceCase(titled[1]) : null;
}

function extractRequestedSections(message: string): string[] {
  const match = message.match(/(?:include|with)\s+(?:\w+\s+)?sections?\s*:\s*([^.]*)/i);
  if (!match?.[1]) return [];
  return match[1]
    .replace(/\band\b/gi, ",")
    .split(",")
    .map(part => sentenceCase(part))
    .filter(Boolean);
}

function servicePageBody(orgName: string, sectionTitle: string): string {
  const title = sectionTitle.toLowerCase();
  if (title.includes("food")) {
    return `${orgName} helps provide food support for local students in need so young people can stay focused, healthy, and ready to learn.`;
  }
  if (title.includes("scholar")) {
    return `${orgName} invests in graduating seniors through scholarships that recognize hard work, service, and promise.`;
  }
  if (title.includes("dictionar")) {
    return `${orgName} supports literacy by providing dictionaries to every 3rd grader at Norwin.`;
  }
  if (title.includes("military") || title.includes("veteran")) {
    return `${orgName} honors local military personnel and their families with gratitude for their service and sacrifice.`;
  }
  return `${orgName} supports ${sectionTitle.toLowerCase()} through local service, volunteer time, and community partnerships.`;
}

function extractAfterChangeTarget(message: string): string | null {
  const quoted = message.match(/["“]([^"”]+)["”]/)?.[1]?.trim();
  if (quoted) return quoted;

  const match = message.match(/\b(?:to|as|say|says|read|reads)\s+(.+)$/i);
  return match?.[1]?.replace(/[.?!]\s*$/, "").trim() || null;
}

function extractEmail(message: string): string | null {
  const email = message.match(EMAIL_IN_TEXT_RE)?.[0]?.trim().toLowerCase();
  return email && EMAIL_RE.test(email) ? email : null;
}

function extractPhone(message: string): string | null {
  return message.match(PHONE_IN_TEXT_RE)?.[0]?.trim() ?? null;
}

function extractSafeHref(message: string): string | null {
  const href = message.match(URL_IN_TEXT_RE)?.[0]?.trim();
  if (!href) return null;
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("/") || href.startsWith("#")) {
    return href;
  }
  return null;
}

function extractHoursPatch(message: string): Record<string, string> | null {
  const raw = extractAfterChangeTarget(message) ?? message.replace(/^.*?\b(?:hours|meeting\s+(?:time|schedule)|schedule)\b/i, "").trim();
  const value = raw.replace(/[.?!]\s*$/, "").trim();
  if (!value) return null;

  const patch: Record<string, string> = {};
  const dayMatch = value.match(DAY_RE);
  if (dayMatch) {
    const day = titleCase(dayMatch[2]);
    patch.meetingDay = dayMatch[1] ? `Every ${day}` : day;
  }

  const timeMatch = value.match(TIME_RE);
  if (timeMatch) {
    patch.meetingTime = timeMatch[2]
      ? `${timeMatch[1].trim()} - ${timeMatch[2].trim()}`
      : timeMatch[1].trim();

    const afterTime = value.slice((timeMatch.index ?? 0) + timeMatch[0].length);
    const locationMatch = afterTime.match(/\bat\s+(.+)$/i);
    if (locationMatch?.[1]?.trim()) {
      patch.meetingLocation = locationMatch[1].trim();
    }
  }

  if (Object.keys(patch).length === 0) {
    patch.meetingTime = value;
  }

  return patch;
}

export function detectDeterministicSiteEditIntent(message: string): DeterministicSiteEditIntent | null {
  const lower = message.toLowerCase();

  if (/\b(create|add)\b/.test(lower) && (/\bnew page\b/.test(lower) || /\bpage called\b/.test(lower))) {
    return "create_custom_page";
  }
  if ((lower.includes("email") || lower.includes("contact")) && EMAIL_IN_TEXT_RE.test(message)) {
    return "update_contact_email";
  }
  if ((lower.includes("phone") || lower.includes("number")) && PHONE_IN_TEXT_RE.test(message)) {
    return "update_contact_phone";
  }
  if (/\b(change|update|set)\b/.test(lower) && /\b(hours|meeting\s+(day|time|schedule)|schedule)\b/.test(lower)) {
    return "update_hours";
  }
  if (/\b(change|update|set)\b/.test(lower) && /\b(cta|call to action|button)\b/.test(lower) && /\b(link|url|href|go(?:es)? to)\b/.test(lower)) {
    return "update_cta_href";
  }
  if (/\b(change|update|set)\b/.test(lower) && /\b(cta|call to action|button)\b/.test(lower) && /\b(label|text|copy|say|says|read|reads)\b/.test(lower)) {
    return "update_cta_label";
  }

  return null;
}

function verified(savedConfig: Record<string, unknown>, expected: Record<string, string>): boolean {
  return Object.entries(expected).every(([key, value]) => text(savedConfig[key]) === value);
}

export async function applyDeterministicSiteEdit(
  orgId: string,
  message: string,
): Promise<DeterministicSiteEditResult | null> {
  const intent = detectDeterministicSiteEditIntent(message);
  if (!intent) return null;

  if (intent === "create_custom_page") {
    const title = extractRequestedPageTitle(message);
    if (!title) {
      return { status: "error", intent, httpStatus: 400, message: "Please include a page title." };
    }

    const currentConfig = await readSiteConfig(orgId);
    const orgName = text(currentConfig.orgName) || "Your organization";
    const sections = extractRequestedSections(message);
    const page = {
      title,
      slug: slugify(title),
      navLabel: title,
      showInNav: /\b(navigation|nav|menu)\b/i.test(message),
      intro: `${orgName} puts service into action through hands-on projects that support Norwin and beyond.`,
      sections: sections.map(sectionTitle => ({
        title: sectionTitle,
        body: servicePageBody(orgName, sectionTitle),
      })),
      cta: {
        label: /get involved/i.test(message) ? "Get Involved" : "Contact Us",
        href: "/contact",
      },
    };

    const currentFeatures = currentConfig.features && typeof currentConfig.features === "object" && !Array.isArray(currentConfig.features)
      ? currentConfig.features as Record<string, unknown>
      : {};
    const existingPages = Array.isArray(currentFeatures.customPages)
      ? (currentFeatures.customPages as Record<string, unknown>[]).filter(p => p.slug !== page.slug)
      : [];
    const saved = await saveSiteConfigPatch(orgId, {
      features: {
        customPages: [...existingPages, page],
      },
    });
    const savedPages = saved.config.features && typeof saved.config.features === "object" && !Array.isArray(saved.config.features)
      ? (saved.config.features as Record<string, unknown>).customPages
      : null;
    if (!Array.isArray(savedPages) || !savedPages.some(p => typeof p === "object" && p !== null && (p as Record<string, unknown>).slug === page.slug)) {
      return { status: "error", intent, httpStatus: 500, message: "Custom page could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: `${title} page created.`,
      data: { customPage: page },
      publicOrgId: saved.publicOrgId,
    };
  }

  if (intent === "update_contact_email") {
    const email = extractEmail(message);
    if (!email) {
      return { status: "error", intent, httpStatus: 400, message: "Please include a valid contact email address." };
    }
    const saved = await saveSiteConfigPatch(orgId, { contactEmail: email });
    if (text(saved.config.contactEmail).toLowerCase() !== email.toLowerCase()) {
      return { status: "error", intent, httpStatus: 500, message: "Contact email could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: `Contact email updated to ${email}.`,
      data: { contactEmail: text(saved.config.contactEmail) },
      publicOrgId: saved.publicOrgId,
    };
  }

  if (intent === "update_contact_phone") {
    const phone = extractPhone(message);
    if (!phone) {
      return { status: "error", intent, httpStatus: 400, message: "Please include a valid contact phone number." };
    }
    const saved = await saveSiteConfigPatch(orgId, { contactPhone: phone });
    if (text(saved.config.contactPhone) !== phone) {
      return { status: "error", intent, httpStatus: 500, message: "Contact phone could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: `Contact phone updated to ${phone}.`,
      data: { contactPhone: text(saved.config.contactPhone) },
      publicOrgId: saved.publicOrgId,
    };
  }

  if (intent === "update_hours") {
    const patch = extractHoursPatch(message);
    if (!patch) {
      return { status: "error", intent, httpStatus: 400, message: "Please include the meeting day, time, or hours to save." };
    }
    const saved = await saveSiteConfigPatch(orgId, patch);
    if (!verified(saved.config, patch)) {
      return { status: "error", intent, httpStatus: 500, message: "Meeting hours could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: "Meeting hours updated.",
      data: Object.fromEntries(Object.keys(patch).map((key) => [key, text(saved.config[key])])),
      publicOrgId: saved.publicOrgId,
    };
  }

  if (intent === "update_cta_label") {
    const label = extractAfterChangeTarget(message);
    if (!label) {
      return { status: "error", intent, httpStatus: 400, message: "Please include the new CTA label." };
    }
    const saved = await saveSiteConfigPatch(orgId, {
      ctaLabel: label,
      features: { ctaLabel: label },
    });
    if (text(saved.config.ctaLabel) !== label) {
      return { status: "error", intent, httpStatus: 500, message: "CTA label could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: `CTA label updated to ${label}.`,
      data: { ctaLabel: text(saved.config.ctaLabel) },
      publicOrgId: saved.publicOrgId,
    };
  }

  const href = extractSafeHref(message);
  if (!href) {
    return { status: "error", intent, httpStatus: 400, message: "Please include a safe CTA link starting with https://, http://, /, or #." };
  }
  const saved = await saveSiteConfigPatch(orgId, {
    ctaHref: href,
    features: { ctaHref: href },
  });
  if (text(saved.config.ctaHref) !== href) {
    return { status: "error", intent, httpStatus: 500, message: "CTA link could not be verified after saving." };
  }
  return {
    status: "completed",
    intent,
    message: `CTA link updated to ${href}.`,
    data: { ctaHref: text(saved.config.ctaHref) },
    publicOrgId: saved.publicOrgId,
  };
}
