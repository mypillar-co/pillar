import { readSiteConfig, saveSiteConfigPatch } from "./siteConfigPersistence";

type SiteEditStatus = "completed" | "error";

export type DeterministicSiteEditIntent =
  | "update_contact_email"
  | "update_contact_phone"
  | "update_hours"
  | "update_cta_label"
  | "update_cta_href"
  | "clear_logo"
  | "update_about_page"
  | "create_custom_page"
  | "delete_custom_page";

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
const TIME_RE = /\b((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)|noon|midnight)(?:\s*[-\u2013\u2014]\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)))?/i;

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
  const quoted = message.match(/new page called\s+["'`\u201c]?([^"'`\u201d]+?)["'`\u201d]?(?:\s+and|\s+with|\.|$)/i);
  if (quoted?.[1]) return sentenceCase(quoted[1]);
  const named = message.match(/page\s+(?:called|named)\s+["'`\u201c]?([^"'`\u201d.]+?)["'`\u201d]?(?:\s+and|\s+with|\.|$)/i);
  if (named?.[1]) return sentenceCase(named[1]);
  const titled = message.match(/new page\s+["'`\u201c]?([^"'`\u201d.]+?)["'`\u201d]?(?:\s+and|\s+with|\.|$)/i);
  if (titled?.[1]) return sentenceCase(titled[1]);
  const natural = message.match(/\b(?:create|add)\s+(?:a\s+|an\s+)?([^."']+?)\s+page\b/i);
  return natural?.[1] ? sentenceCase(natural[1].replace(/\bnew\b/i, "").trim()) : null;
}

function extractTargetPageTitle(message: string): string | null {
  const quoted = message.match(/["\u201c]([^"\u201d]+)["\u201d]/)?.[1]?.trim();
  if (quoted) return sentenceCase(quoted);

  const beforePage = message.match(/\b(?:delete|remove)\s+(?:the\s+)?([^."']+?)\s+page\b/i);
  if (beforePage?.[1]) return sentenceCase(beforePage[1]);

  const afterPage = message.match(/\b(?:delete|remove)\s+(?:the\s+)?page\s+(?:called|named)?\s*([^."']+?)(?:\s+from|\s+and|\.|$)/i);
  if (afterPage?.[1]) return sentenceCase(afterPage[1]);

  return extractRequestedPageTitle(message);
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

type CustomPageSection = { title: string; body: string };

function extractDollarAmounts(message: string): string[] {
  return Array.from(message.matchAll(/\$\s?([0-9][0-9,]*)/g))
    .map(match => `$${match[1].replace(/\s/g, "").replace(/,+$/g, "")}`);
}

function extractScholarshipNames(message: string): string[] {
  const match =
    message.match(/(?:scholarship\s+info\s+into\s+there|scholarship\s+information\s+into\s+there|scholarships?|levels?)\s*:\s*([^.]*)/i) ??
    (/\bscholar/i.test(message) ? message.match(/:\s*([^.]*)/i) : null);
  if (!match?.[1]) return [];
  const namePart = match[1].split(/\s+for\s+\$/i)[0] ?? "";
  return namePart
    .replace(/\band\b/gi, ",")
    .split(",")
    .map(part => sentenceCase(part))
    .filter(Boolean);
}

function buildScholarshipSections(orgName: string, message: string): CustomPageSection[] {
  const names = extractScholarshipNames(message);
  if (names.length === 0) return [];
  const amounts = extractDollarAmounts(message);
  return names.map((name, index) => {
    const amount = amounts[index] ?? null;
    return {
      title: amount ? `${name} (${amount})` : name,
      body: amount
        ? `${name} is a ${amount} scholarship opportunity from ${orgName}. Use the request form below to ask for details about eligibility, timing, and next steps.`
        : `${name} is a scholarship opportunity from ${orgName}. Use the request form below to ask for eligibility details and next steps.`,
    };
  });
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

function buildRequestedSections(orgName: string, message: string): CustomPageSection[] {
  const scholarshipSections = buildScholarshipSections(orgName, message);
  if (scholarshipSections.length > 0) return scholarshipSections;

  const sections = extractRequestedSections(message);
  if (/\bscholar/i.test(message) && sections.length > 0) {
    return sections.map(sectionTitle => ({
      title: sectionTitle,
      body: `${sectionTitle} is a scholarship opportunity from ${orgName}. Use the request form below to ask for eligibility details, timing, and next steps.`,
    }));
  }
  return sections.map(sectionTitle => ({
    title: sectionTitle,
    body: servicePageBody(orgName, sectionTitle),
  }));
}

function extractRequestedIntro(message: string, orgName: string, title: string): string {
  const explicit = message.match(/(?:intro|introduction|opening copy|page copy)\s*:\s*([^.]*)/i)?.[1];
  if (explicit?.trim()) return sentenceCase(explicit);

  if (/\bscholar/i.test(`${title} ${message}`)) {
    return `${orgName} supports local students through scholarship opportunities. Review the options below and request more information about the scholarship that fits your goals.`;
  }

  return `${orgName} puts service into action through hands-on projects that support Norwin and beyond.`;
}

function currentSiteContent(config: Record<string, unknown>): Record<string, unknown> {
  return config.siteContent && typeof config.siteContent === "object" && !Array.isArray(config.siteContent)
    ? config.siteContent as Record<string, unknown>
    : {};
}

function currentFeatures(config: Record<string, unknown>): Record<string, unknown> {
  return config.features && typeof config.features === "object" && !Array.isArray(config.features)
    ? config.features as Record<string, unknown>
    : {};
}

function extractExplicitAboutCopy(message: string): string | null {
  const afterColon = message.match(/\babout\s+page\b[^:]*:\s*([\s\S]+)$/i)?.[1]?.trim();
  if (afterColon && afterColon.length > 12) return afterColon;

  const quoted = message.match(/\babout\s+page\b[\s\S]*?["\u201c]([^"\u201d]{20,})["\u201d]/i)?.[1]?.trim();
  return quoted || null;
}

function aboutBodyFromConfig(config: Record<string, unknown>, message: string): string {
  const explicit = extractExplicitAboutCopy(message);
  if (explicit) return explicit;

  const siteContent = currentSiteContent(config);
  const orgName = text(config.orgName) || "Your organization";
  const mission = text(config.mission) || text(siteContent.about_mission) || text(siteContent.home_intro);
  const programs = Array.isArray(config.programs)
    ? (config.programs as Record<string, unknown>[])
        .map(program => text(program.title) || text(program.name))
        .filter(Boolean)
    : [];

  if (mission && /\b(service|work|project|program|impact|latest)\b/i.test(message)) {
    return `${orgName} puts service into action through practical work in the community.\n\n${mission}`;
  }

  if (programs.length > 0) {
    return `${orgName} serves the community through ${programs.slice(0, 4).join(", ")}. These efforts help neighbors find support, connection, and opportunities to get involved.`;
  }

  return mission || `${orgName} brings neighbors together for service, fellowship, and local impact.`;
}

function mergeAboutPageSections(
  config: Record<string, unknown>,
  heading: string,
  body: string,
): Record<string, unknown> {
  const features = currentFeatures(config);
  const pageSections = features.pageSections && typeof features.pageSections === "object" && !Array.isArray(features.pageSections)
    ? features.pageSections as Record<string, unknown>
    : {};
  const existing = Array.isArray(pageSections.about)
    ? pageSections.about as Record<string, unknown>[]
    : [];
  const hasIntro = existing.some(section => section.type === "about_intro");
  const nextAbout = hasIntro
    ? existing.map(section => section.type === "about_intro" ? { ...section, title: heading, body, visible: true } : section)
    : [
        { id: "about-hero", type: "page_hero", title: text(config.orgName) || "About Us", body: text(config.tagline), visible: true },
        { id: "about-intro", type: "about_intro", title: heading, body, visible: true },
        ...existing.filter(section => section.type !== "page_hero"),
      ];

  return { ...pageSections, about: nextAbout };
}

function shouldAddRequestInfoForm(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("form") && /\b(request|ask|contact|get)\b/.test(lower) && /\b(info|information|details|inquiry|inquiries)\b/.test(lower);
}

function shouldAddPictureArea(message: string): boolean {
  return /\b(photo|picture|image)\b/i.test(message);
}

function buildRequestInfoForm(sections: CustomPageSection[]) {
  const options = sections.length > 0 ? sections.map(section => section.title) : ["General information"];
  return {
    type: "request_info",
    title: "Request Information",
    description: "Tell us what you would like to learn more about and someone will follow up.",
    submitLabel: "Request Information",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "interest", label: "I am interested in", type: "select", required: true, options },
      { name: "message", label: "Message", type: "textarea", required: false },
    ],
  };
}

function shouldShowPageInNav(message: string): boolean {
  return !/\b(do not|don't|dont|hide|hidden)\b[^.]*\b(nav|navigation|menu)\b/i.test(message);
}

function getCustomPages(config: Record<string, unknown>): Record<string, unknown>[] {
  const features = config.features && typeof config.features === "object" && !Array.isArray(config.features)
    ? config.features as Record<string, unknown>
    : {};
  return Array.isArray(features.customPages)
    ? (features.customPages as Record<string, unknown>[])
    : [];
}

function extractAfterChangeTarget(message: string): string | null {
  const quoted = message.match(/["\u201c]([^"\u201d]+)["\u201d]/)?.[1]?.trim();
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
  const asksToCreatePage =
    /\b(?:create|add)\s+(?:a\s+|an\s+)?(?:new\s+)?[^.]{1,80}?\s+page\b/.test(lower) ||
    /\bnew page\b/.test(lower) ||
    /\bpage\s+(?:called|named)\b/.test(lower);

  if (/\b(delete|remove|clear)\b/.test(lower) && /\b(logo|site logo|top left|upper left)\b/.test(lower)) {
    return "clear_logo";
  }
  if (/\b(delete|remove)\b/.test(lower) && /\bpage\b/.test(lower)) {
    return "delete_custom_page";
  }
  if (asksToCreatePage && !/\babout\s+page\b/.test(lower)) {
    return "create_custom_page";
  }
  if (/\b(update|change|add|include|put|rewrite)\b/.test(lower) && /\babout\s+page\b/.test(lower)) {
    return "update_about_page";
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
    const sections = buildRequestedSections(orgName, message);
    const page = {
      title,
      slug: slugify(title),
      navLabel: title,
      showInNav: shouldShowPageInNav(message),
      intro: extractRequestedIntro(message, orgName, title),
      sections,
      ...(shouldAddRequestInfoForm(message) ? { form: buildRequestInfoForm(sections) } : {}),
      ...(shouldAddPictureArea(message) ? { media: { type: "image", alt: title, caption: "Photo coming soon" } } : {}),
      cta: {
        label: /get involved/i.test(message) ? "Get Involved" : shouldAddRequestInfoForm(message) ? "Request Information" : "Contact Us",
        href: "/contact",
      },
    };

    const existingPages = getCustomPages(currentConfig).filter(p => p.slug !== page.slug);
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

  if (intent === "delete_custom_page") {
    const title = extractTargetPageTitle(message);
    if (!title) {
      return { status: "error", intent, httpStatus: 400, message: "Please include the page name to delete." };
    }

    const currentConfig = await readSiteConfig(orgId);
    const targetSlug = slugify(title);
    const existingPages = getCustomPages(currentConfig);
    const remainingPages = existingPages.filter(page => {
      const pageSlug = text(page.slug);
      const pageTitle = text(page.title);
      const pageNavLabel = text(page.navLabel);
      return pageSlug !== targetSlug && pageTitle.toLowerCase() !== title.toLowerCase() && pageNavLabel.toLowerCase() !== title.toLowerCase();
    });

    if (remainingPages.length === existingPages.length) {
      return { status: "error", intent, httpStatus: 404, message: `I couldn't find a custom page named ${title}.` };
    }

    const saved = await saveSiteConfigPatch(orgId, {
      features: {
        customPages: remainingPages,
      },
    });
    const savedPages = getCustomPages(saved.config);
    if (savedPages.some(page => text(page.slug) === targetSlug || text(page.title).toLowerCase() === title.toLowerCase())) {
      return { status: "error", intent, httpStatus: 500, message: `${title} could not be verified as deleted.` };
    }
    return {
      status: "completed",
      intent,
      message: `${title} page deleted.`,
      data: { deletedPage: title, customPages: savedPages },
      publicOrgId: saved.publicOrgId,
    };
  }

  if (intent === "update_about_page") {
    const currentConfig = await readSiteConfig(orgId);
    const heading = /\b(service|work|project|impact)\b/i.test(message) ? "Our Service" : "Our Mission";
    const body = aboutBodyFromConfig(currentConfig, message);
    const currentSiteContentValue = currentSiteContent(currentConfig);
    const saved = await saveSiteConfigPatch(orgId, {
      siteContent: {
        ...currentSiteContentValue,
        about_heading: heading,
        about_mission: body,
      },
      features: {
        pageSections: mergeAboutPageSections(currentConfig, heading, body),
      },
    });
    const savedFeatures = currentFeatures(saved.config);
    const savedPageSections = savedFeatures.pageSections && typeof savedFeatures.pageSections === "object" && !Array.isArray(savedFeatures.pageSections)
      ? savedFeatures.pageSections as Record<string, unknown>
      : {};
    const savedAbout = Array.isArray(savedPageSections.about) ? savedPageSections.about as Record<string, unknown>[] : [];
    const savedIntro = savedAbout.find(section => section.type === "about_intro");
    if (text(savedIntro?.body) !== body) {
      return { status: "error", intent, httpStatus: 500, message: "About page could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: "About page updated.",
      data: { aboutHeading: heading, aboutMission: body },
      publicOrgId: saved.publicOrgId,
    };
  }

  if (intent === "clear_logo") {
    const saved = await saveSiteConfigPatch(orgId, { logoUrl: null });
    if (saved.config.logoUrl !== null) {
      return { status: "error", intent, httpStatus: 500, message: "Site logo could not be verified after saving." };
    }
    return {
      status: "completed",
      intent,
      message: "Site logo removed.",
      data: { logoUrl: null },
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
