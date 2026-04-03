export type PageClassification =
  | "home"
  | "about"
  | "programs"
  | "events"
  | "membership"
  | "contact"
  | "faq"
  | "sponsors"
  | "vendors"
  | "join"
  | "donate"
  | "announcements"
  | "gallery"
  | "unknown";

const SLUG_PATTERNS: Array<[RegExp, PageClassification]> = [
  [/^(\/|home|index)$/i, "home"],
  [/about/i, "about"],
  [/program|service|activit|initiative/i, "programs"],
  [/event|calendar|schedule/i, "events"],
  [/member|membership|join|dues/i, "membership"],
  [/contact|reach|location/i, "contact"],
  [/faq|question|help|support/i, "faq"],
  [/sponsor|partner/i, "sponsors"],
  [/vendor|exhibitor|booth/i, "vendors"],
  [/join|volunteer|signup|sign-up/i, "join"],
  [/donat|give|contribut|fund/i, "donate"],
  [/news|announcement|update|blog/i, "announcements"],
  [/gallery|photo|media|image/i, "gallery"],
];

export function classifyPage(slug: string, label: string): PageClassification {
  const combined = `${slug} ${label}`.toLowerCase();

  for (const [pattern, classification] of SLUG_PATTERNS) {
    if (pattern.test(combined)) {
      return classification;
    }
  }

  return "unknown";
}
