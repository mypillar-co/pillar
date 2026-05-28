import type { HomepageSectionBlock, OrgConfig } from "../config-context";

export function customPageSectionKey(slug: string): string {
  return `custom:${slug}`;
}

export function textOr(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function configuredPageSections(
  config: OrgConfig,
  pageKey: string,
  defaults: HomepageSectionBlock[],
): HomepageSectionBlock[] {
  const configured = pageKey === "home"
    ? config.features?.homepageSections ?? config.sections
    : pageKey.startsWith("custom:")
      ? config.features?.pageSections?.[pageKey] ??
        config.features?.customPages?.find(page => customPageSectionKey(page.slug) === pageKey)?.blocks
      : config.features?.pageSections?.[pageKey];

  if (!Array.isArray(configured) || configured.length === 0) return defaults;

  const defaultsByType = new Map(defaults.map(section => [section.type, section]));
  const normalized = configured
    .filter(section => section && typeof section.type === "string")
    .map(section => ({
      ...(defaultsByType.get(section.type) ?? {}),
      ...section,
      id: textOr(section.id) || section.type,
      visible: section.visible !== false,
    }));

  for (const section of defaults) {
    if (!normalized.some(item => item.type === section.type)) normalized.push(section);
  }

  return normalized;
}

export function pageSectionBlock(sections: HomepageSectionBlock[], type: string): HomepageSectionBlock | undefined {
  return sections.find(section => section.type === type);
}

export function pageSectionVisible(sections: HomepageSectionBlock[], type: string): boolean {
  return pageSectionBlock(sections, type)?.visible !== false;
}

export function pageSectionOrder(sections: HomepageSectionBlock[], type: string, fallback: number): number {
  const index = sections.findIndex(section => section.type === type);
  return index === -1 ? fallback : index;
}

export function editableCopySections(sections: HomepageSectionBlock[]): HomepageSectionBlock[] {
  return sections.filter(section => section.visible !== false && ![
    "page_hero",
    "about_intro",
    "programs",
    "find_us",
    "partners",
    "cta",
    "contact_intro",
    "contact_form",
    "contact_details",
    "social_links",
    "gallery_intro",
    "album_grid",
    "members_intro",
    "member_actions",
    "media",
    "form",
  ].includes(section.type));
}

export function editAttrs(
  pageKey: string,
  sectionId: string | undefined,
  field: "title" | "subtitle" | "body",
) {
  if (!sectionId) return {};
  return {
    "data-pillar-edit": "text",
    "data-pillar-page": pageKey,
    "data-pillar-section": sectionId,
    "data-pillar-field": field,
    title: "Click to edit",
  };
}
