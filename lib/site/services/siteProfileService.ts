import type { SiteProfile, SiteProfileInputs } from "../types/site-profile.js";

function extractFromInterview(interviewBody: string, field: string): string {
  if (!interviewBody) return "";
  const patterns: Record<string, RegExp[]> = {
    mission: [/mission[:\s]+(.{20,300})/i, /purpose[:\s]+(.{20,300})/i, /we are[:\s]+(.{10,300})/i],
    location: [/location[:\s]+(.{5,200})/i, /address[:\s]+(.{5,200})/i, /based in[:\s]+(.{5,100})/i],
    contact: [/email[:\s]+([^\s,]{5,100})/i, /phone[:\s]+([0-9\-\(\)\s+]{7,20})/i],
    audience: [/audience[:\s]+(.{10,200})/i, /serve[:\s]+(.{10,200})/i, /reach[:\s]+(.{10,200})/i],
    founding: [/founded[:\s]+(\d{4})/i, /established[:\s]+(\d{4})/i, /since[:\s]+(\d{4})/i],
    members: [/(\d+)[+]?\s*members/i, /(\d+)[+]?\s*families/i, /(\d+)[+]?\s*households/i],
  };

  const fieldPatterns = patterns[field] ?? [];
  for (const pattern of fieldPatterns) {
    const match = interviewBody.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

/**
 * Extract named programs from free text using multiple patterns.
 * Returns actual program names when found.
 */
function extractProgramNames(text: string): string[] {
  const names: string[] = [];

  // "Program: X", "Service: Y", "Initiative: Z" — explicit labels
  const labeled = text.match(/(?:Program|Service|Initiative|Activity|Project|Workshop|Class|Course|Camp|Clinic|League|Ministry)s?[:\-]\s*([^\n.,;]{5,60})/gi) ?? [];
  for (const m of labeled) {
    const colonIdx = m.search(/[:\-]/);
    if (colonIdx < 0) continue;
    const name = m.slice(colonIdx + 1).trim();
    if (name && !names.includes(name)) names.push(name);
  }

  // "We offer X, Y, and Z" — enumeration pattern
  const offerMatch = text.match(/we offer[:\s]+([^\n.]{10,160})/i);
  if (offerMatch?.[1]) {
    offerMatch[1]
      .split(/,\s*|\s+and\s+/)
      .map(s => s.trim().replace(/^(a|an|the)\s+/i, ""))
      .filter(s => s.length > 3 && s.length < 60 && !names.includes(s))
      .slice(0, 4)
      .forEach(n => names.push(n));
  }

  // "Our programs include X, Y" — include pattern
  const includeMatch = text.match(/(?:programs?|services?|initiatives?)[:\s]+(?:include[s]?[:\s]+)?([^\n.]{10,160})/i);
  if (includeMatch?.[1]) {
    includeMatch[1]
      .split(/,\s*|\s+and\s+/)
      .map(s => s.trim().replace(/^(a|an|the)\s+/i, ""))
      .filter(s => s.length > 3 && s.length < 60 && !names.includes(s))
      .slice(0, 4)
      .forEach(n => names.push(n));
  }

  return names.slice(0, 6);
}

/**
 * Count how many distinct program-type concepts appear in org data.
 * Used as a signal floor when no named programs are extractable.
 */
function countProgramKeywords(text: string): number {
  const KEYWORDS = [
    "program", "initiative", "service", "workshop", "class",
    "training", "clinic", "camp", "league", "ministry",
    "activity", "course", "outreach", "project",
  ];
  const lower = text.toLowerCase();
  return KEYWORDS.filter(k => lower.includes(k)).length;
}

export function buildSiteProfile(orgId: string, inputs: SiteProfileInputs): SiteProfile {
  const org = inputs.org as Record<string, unknown>;
  const interview = inputs.interviewBody ?? "";
  const findings = inputs.importFindings ?? [];

  const preservedMission = findings.find(f =>
    (f as Record<string, unknown>).findingType === "mission" &&
    (f as Record<string, unknown>).preserveVerbatim === true
  );

  const mission =
    (org.siteMissionOverride as string | null) ??
    (preservedMission ? ((preservedMission as Record<string, unknown>).contentJson as Record<string, unknown>)?.text as string : undefined) ??
    extractFromInterview(interview, "mission") ??
    (org.sitePublicDescription as string | null) ??
    (org.description as string | null) ??
    "";

  const contactEmail =
    (org.siteContactEmail as string | null) ??
    extractFromInterview(interview, "contact") ??
    (org.senderEmail as string | null) ??
    "";

  const contactPhone =
    (org.siteContactPhone as string | null) ??
    "";

  const address =
    (org.sitePublicAddress as string | null) ??
    extractFromInterview(interview, "location") ??
    "";

  const hours =
    (org.sitePublicHours as string | null) ??
    "";

  const audience =
    extractFromInterview(interview, "audience") ??
    "";

  const tone =
    (inputs.contentStrategy?.tone) ??
    "professional";

  const foundingYear = extractFromInterview(interview, "founding") || undefined;
  const memberCount = extractFromInterview(interview, "members") || undefined;

  const hasRealStats = !!(foundingYear || memberCount);

  const eventTypes = ["festival", "market", "fair", "conference"];
  const isEventFirstOrg =
    eventTypes.some(t => (org.type as string ?? "").toLowerCase().includes(t)) ||
    (org.siteType as string ?? "") === "festival";

  const tagline =
    (org.siteTagline as string | null) ??
    (org.tagline as string | null) ??
    "";

  // ── Programs: from import findings first, then org text ──────────────
  const programs: string[] = [];

  const programFindings = findings.filter(f => (f as Record<string, unknown>).findingType === "program");
  programFindings.forEach(f => {
    const title = (f as Record<string, unknown>).title as string;
    if (title && !programs.includes(title)) programs.push(title);
  });

  // If import gave us nothing, extract from org description + interview
  if (programs.length === 0) {
    const orgText = [
      org.description as string ?? "",
      org.sitePublicDescription as string ?? "",
      interview,
    ].filter(Boolean).join("\n");

    if (orgText.length > 10) {
      const extracted = extractProgramNames(orgText);
      extracted.forEach(n => programs.push(n));
    }

    // If still nothing but org type implies programs, infer count from keywords
    if (programs.length === 0) {
      const orgType = (org.type as string ?? "").toLowerCase();
      const isProgramOrg = orgType.includes("service") || orgType.includes("program") || orgType.includes("social") || orgType.includes("youth") || orgType.includes("health");
      if (isProgramOrg) {
        const kwCount = countProgramKeywords([
          org.description as string ?? "",
          org.sitePublicDescription as string ?? "",
          interview,
        ].join(" "));
        // Push synthetic placeholders so programCount reflects reality
        for (let i = 0; i < Math.min(kwCount, 3); i++) {
          programs.push(`__kw_${i}`);
        }
      }
    }
  }

  const importedColors: string[] = [];

  return {
    orgId,
    orgName: org.name as string ?? "",
    orgType: org.type as string ?? "organization",
    siteType: (org.siteType as string | null) ?? "default",
    mission,
    tagline,
    description: (org.sitePublicDescription as string | null) ?? "",
    contactEmail,
    contactPhone,
    address,
    hours,
    audience,
    programs,
    tone,
    logoUrl: (org.logoUrl as string | null) ?? undefined,
    importedColors,
    primaryCtaType: (org.sitePrimaryCtaOverride as string | null) ?? "contact",
    hasRealStats,
    isEventFirstOrg,
    foundingYear,
    memberCount,
    socialHandles: inputs.socialHandles,
  };
}
