export interface SectionDefinition {
  type: string;
  label: string;
  description: string;
  /**
   * Where this section is allowed to live.
   * - public: can be added to the public homepage / public site sections array
   * - portal: can be added to the members-portal sections array
   * Both flags can be true (e.g. documents, meeting_schedule).
   */
  surfaces: { public: boolean; portal: boolean };
  example: Record<string, unknown>;
}

export const SECTION_REGISTRY: Record<string, SectionDefinition> = {
  // ── Public-only sections ─────────────────────────────────────────────────────
  leadership: {
    type: "leadership",
    label: "Board of Directors / Leadership",
    description: "Displays org officers and board members with name, title, and optional photo",
    surfaces: { public: true, portal: false },
    example: {
      type: "leadership",
      title: "Our Leadership Team",
      members: [
        { name: "Jane Smith", title: "President", email: "jane@example.org", photoUrl: null },
        { name: "Bob Jones", title: "Treasurer", email: "bob@example.org", photoUrl: null },
      ],
    },
  },
  gallery: {
    type: "gallery",
    label: "Photo Gallery",
    description: "Grid of photos from events or org activities",
    surfaces: { public: true, portal: false },
    example: {
      type: "gallery",
      title: "Event Photos",
      photos: [
        { url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800", caption: "Annual Gala 2024" },
      ],
    },
  },
  sponsors_showcase: {
    type: "sponsors_showcase",
    label: "Sponsors Showcase",
    description: "Public-facing display of sponsors with logos and links",
    surfaces: { public: true, portal: false },
    example: {
      type: "sponsors_showcase",
      title: "Our Sponsors",
      sponsors: [
        { name: "Acme Corp", logoUrl: null, website: "https://acme.com", tier: "Gold" },
      ],
    },
  },
  history: {
    type: "history",
    label: "Our History",
    description: "Timeline or narrative of the organization founding and milestones",
    surfaces: { public: true, portal: false },
    example: {
      type: "history",
      title: "Our History",
      foundedYear: "1952",
      narrative: "Founded in 1952 by dedicated community leaders.",
      milestones: [{ year: "1952", event: "Organization founded" }],
    },
  },
  volunteer_opportunities: {
    type: "volunteer_opportunities",
    label: "Volunteer Opportunities",
    description: "List of current volunteer needs and how to get involved",
    surfaces: { public: true, portal: false },
    example: {
      type: "volunteer_opportunities",
      title: "Get Involved",
      intro: "We are always looking for passionate community members.",
      opportunities: [
        { title: "Event Volunteer", description: "Help run our annual fundraiser", commitment: "1 weekend/year", contact: "events@example.org" },
      ],
    },
  },

  // ── Portal-only sections ─────────────────────────────────────────────────────
  welcome_message: {
    type: "welcome_message",
    label: "Welcome message",
    description: "Members-portal welcome blurb in the org's voice. Pulls from site_config.about_mission by default.",
    surfaces: { public: false, portal: true },
    example: {
      type: "welcome_message",
      title: "Welcome, members",
      body: "Thanks for being part of our community. Here is everything you need to stay involved.",
    },
  },
  notices: {
    type: "notices",
    label: "Member notices",
    description: "Time-sensitive notices for members (meeting changes, dues reminders, lodge announcements). Most recent first.",
    surfaces: { public: false, portal: true },
    example: {
      type: "notices",
      title: "Notices",
      notices: [
        { date: "2026-04-12", title: "April meeting moved to the 22nd", body: "Hall is unavailable on the 15th. We'll meet at the same time on Wednesday the 22nd." },
      ],
    },
  },
  dues_info: {
    type: "dues_info",
    label: "Dues & payments",
    description: "Placeholder card explaining current dues amount and how members pay. Real online payment flow is wired separately.",
    surfaces: { public: false, portal: true },
    example: {
      type: "dues_info",
      title: "Annual dues",
      amountText: "$120 / year",
      body: "Annual dues are due each January. Pay online once we have payments enabled, or mail a check to the treasurer.",
      payUrl: null,
    },
  },
  committee_signups: {
    type: "committee_signups",
    label: "Committees & sign-ups",
    description: "List of standing committees or working groups members can join, with a contact for each.",
    surfaces: { public: false, portal: true },
    example: {
      type: "committee_signups",
      title: "Get involved",
      committees: [
        { name: "Membership Committee", description: "Welcomes new members and runs orientation.", contact: "membership@example.org" },
      ],
    },
  },
  member_roster: {
    type: "member_roster",
    label: "Member roster",
    description: "Live directory of current members. Reads from the members table — no manual data entry. Members who opt out of the directory are hidden.",
    surfaces: { public: false, portal: true },
    example: {
      type: "member_roster",
      title: "Member roster",
    },
  },

  // ── Both-surface sections ────────────────────────────────────────────────────
  documents: {
    type: "documents",
    label: "Documents and Resources",
    description: "Downloadable files like bylaws, meeting minutes, annual reports, and forms",
    surfaces: { public: true, portal: true },
    example: {
      type: "documents",
      title: "Resources",
      documents: [
        { name: "2024 Annual Report", url: "https://example.org/report.pdf", description: "Year in review", category: "Reports" },
      ],
    },
  },
  meeting_schedule: {
    type: "meeting_schedule",
    label: "Meeting schedule",
    description: "Recurring meeting cadence and the next few upcoming dates. Useful on both the public site and the members portal.",
    surfaces: { public: true, portal: true },
    example: {
      type: "meeting_schedule",
      title: "When we meet",
      cadence: "Second Thursday of every month, 7:00 PM",
      location: "Lodge Hall, 123 Main St.",
      upcoming: [
        { date: "2026-05-14", note: "Officer elections" },
      ],
    },
  },
};

export type Surface = "public" | "portal";

function sectionsForSurface(surface: Surface): SectionDefinition[] {
  return Object.values(SECTION_REGISTRY).filter((s) => s.surfaces[surface]);
}

function buildPromptBlocks(defs: SectionDefinition[]): string {
  return defs
    .map(
      (s) =>
        `TYPE: "${s.type}" — ${s.label}\n${s.description}\nExample:\n${JSON.stringify(s.example, null, 2)}`,
    )
    .join("\n\n");
}

/**
 * Prompt block for the public-site AI editor. Only includes section types that
 * are tagged for the public surface — keeps the AI from accidentally adding
 * portal-only sections (like member_roster) to the public homepage.
 */
export function getSectionRegistryPrompt(): string {
  const blocks = buildPromptBlocks(sectionsForSurface("public"));
  return `AVAILABLE SECTION TYPES — you can add any of these to the public site by including them in the sections array of the config:\n\n${blocks}\n\nWhen adding a new section append it to the existing sections array in the config. Never remove existing sections unless explicitly asked. Always use the exact type string shown above.`;
}

/**
 * Prompt block for the members-portal AI suggester.
 */
export function getPortalSectionRegistryPrompt(): string {
  const blocks = buildPromptBlocks(sectionsForSurface("portal"));
  return `AVAILABLE PORTAL SECTION TYPES — these can be added to the members portal:\n\n${blocks}\n\nReturn only sections from this list. Use the exact type string shown above.`;
}

/**
 * Validate a section payload for a given surface. A section is valid when its
 * type exists in the registry AND that type is allowed on the requested surface.
 */
export function validateSection(
  section: Record<string, unknown>,
  surface: Surface = "public",
): boolean {
  if (typeof section.type !== "string") return false;
  const def = SECTION_REGISTRY[section.type];
  if (!def) return false;
  return def.surfaces[surface] === true;
}
