import { SECTION_REGISTRY, type SectionDefinition } from "./sectionRegistry";

/**
 * A portal section as stored on `site_config.membersPortal.sections[]`.
 * Loosely typed so per-section payload shapes can vary; runtime validation
 * happens via `validateSection(section, "portal")`.
 */
export type PortalSection = Record<string, unknown> & { type: string };

/**
 * Build a starter section by cloning the registry example and applying
 * any per-vertical text overrides.
 */
function starter(
  type: keyof typeof SECTION_REGISTRY,
  overrides: Record<string, unknown> = {},
): PortalSection {
  const def: SectionDefinition | undefined = SECTION_REGISTRY[type];
  if (!def) {
    throw new Error(`[membersPortalDefaults] unknown section type: ${type}`);
  }
  // Deep-clone the example so callers can't mutate the registry by accident.
  const example = JSON.parse(JSON.stringify(def.example)) as Record<string, unknown>;
  return { ...example, ...overrides, type } as PortalSection;
}

const fraternalSet = (orgName: string): PortalSection[] => [
  starter("welcome_message", {
    title: `Welcome, brothers`,
    body: `This is your private members area for ${orgName}. Check here first for notices, dues information, and the latest from the lodge.`,
  }),
  starter("notices", { title: "Lodge notices" }),
  starter("meeting_schedule", { title: "When we meet" }),
  starter("dues_info", {
    title: "Annual dues",
    body: "Dues keep the lodge running and fund our charitable work. Pay online once we have payments enabled, or mail a check to the treasurer.",
  }),
  starter("documents", {
    title: "Lodge documents",
    documents: [],
  }),
  starter("member_roster", { title: "Brother roster" }),
];

const civicClubSet = (orgName: string): PortalSection[] => [
  starter("welcome_message", {
    title: "Welcome, members",
    body: `Thanks for being part of ${orgName}. Use this portal to stay on top of meetings, committees, and dues.`,
  }),
  starter("meeting_schedule", { title: "Upcoming meetings" }),
  starter("committee_signups", { title: "Committees & projects" }),
  starter("dues_info", { title: "Annual dues" }),
  starter("member_roster", { title: "Member roster" }),
  starter("documents", { title: "Member documents", documents: [] }),
];

const ptaSet = (orgName: string): PortalSection[] => [
  starter("welcome_message", {
    title: "Welcome, families",
    body: `Welcome to the ${orgName} members portal. Find volunteer opportunities, school dates, and the family directory here.`,
  }),
  starter("notices", { title: "Notices for families" }),
  starter("committee_signups", { title: "Volunteer sign-ups" }),
  starter("meeting_schedule", { title: "PTA meetings" }),
  starter("member_roster", { title: "Family directory" }),
  starter("documents", { title: "Forms & resources", documents: [] }),
];

const chamberSet = (orgName: string): PortalSection[] => [
  starter("welcome_message", {
    title: "Welcome, members",
    body: `${orgName} member portal — the home of your membership benefits, peer directory, and member-only resources.`,
  }),
  starter("notices", { title: "Member announcements" }),
  starter("meeting_schedule", { title: "Member events & mixers" }),
  starter("member_roster", { title: "Business directory" }),
  starter("documents", { title: "Member resources", documents: [] }),
];

const veteransSet = (orgName: string): PortalSection[] => [
  starter("welcome_message", {
    title: "Welcome, comrades",
    body: `Your private space for ${orgName} — post notices, meeting changes, dues, and roster.`,
  }),
  starter("notices", { title: "Post notices" }),
  starter("meeting_schedule", { title: "Meetings" }),
  starter("dues_info", { title: "Dues" }),
  starter("documents", { title: "Post documents", documents: [] }),
  starter("member_roster", { title: "Roster" }),
];

const neighborhoodSet = (orgName: string): PortalSection[] => [
  starter("welcome_message", {
    title: "Welcome, neighbors",
    body: `${orgName} member portal. Stay current on neighborhood meetings, notices, and your neighbor directory.`,
  }),
  starter("notices", { title: "Neighborhood notices" }),
  starter("meeting_schedule", { title: "Association meetings" }),
  starter("member_roster", { title: "Neighbor directory" }),
  starter("documents", { title: "Documents", documents: [] }),
];

const defaultSet = (orgName: string): PortalSection[] => [
  starter("welcome_message", {
    title: "Welcome, members",
    body: `Welcome to the ${orgName} members area. Use the sections below to stay involved.`,
  }),
  starter("notices", { title: "Member notices" }),
  starter("meeting_schedule", { title: "When we meet" }),
  starter("member_roster", { title: "Member roster" }),
  starter("documents", { title: "Documents", documents: [] }),
];

/**
 * Map an organization's `type` value (as stored on the `organizations` table —
 * e.g. "Lions Club", "Fraternal Organization") to a starter portal section
 * list appropriate for that vertical.
 *
 * Type matching is case-insensitive and looks for keywords so future variants
 * ("Free & Accepted Masons", "Loyal Order of Moose", etc.) still get the
 * fraternal template.
 */
export function getPortalStarterSections(
  orgType: string | null | undefined,
  orgName: string,
): PortalSection[] {
  const t = (orgType || "").toLowerCase();
  const safeName = orgName?.trim() || "your organization";

  // Fraternal-style orgs (lodges, masons, eagles, elks, moose, oddfellows…) +
  // Lions Club + veterans posts: notices + dues are the headline sections.
  if (
    t.includes("fraternal") ||
    t.includes("lodge") ||
    t.includes("mason") ||
    t.includes("eagles") ||
    t.includes("elks") ||
    t.includes("moose") ||
    t.includes("oddfellow")
  ) {
    return fraternalSet(safeName);
  }
  if (t.includes("vfw") || t.includes("legion") || t.includes("veteran")) {
    return veteransSet(safeName);
  }
  if (t.includes("lions")) {
    // Lions clubs treat notices & dues like fraternal orgs.
    return fraternalSet(safeName);
  }
  if (t.includes("rotary") || t.includes("kiwanis") || t.includes("optimist")) {
    return civicClubSet(safeName);
  }
  if (t.includes("pta") || t.includes("pto") || t.includes("parent")) {
    return ptaSet(safeName);
  }
  if (
    t.includes("chamber") ||
    t.includes("downtown") ||
    t.includes("main street") ||
    t.includes("business")
  ) {
    return chamberSet(safeName);
  }
  if (t.includes("neighborhood") || t.includes("homeowners") || t.includes("hoa")) {
    return neighborhoodSet(safeName);
  }
  // Foundation / Arts / Other / unknown all get the safe default.
  return defaultSet(safeName);
}

/**
 * The shape stored at `site_config.membersPortal`.
 */
export interface MembersPortalConfig {
  sections: PortalSection[];
  /** ISO timestamp of when the portal was first auto-provisioned. */
  provisionedAt?: string;
}

export function buildStarterPortalConfig(
  orgType: string | null | undefined,
  orgName: string,
): MembersPortalConfig {
  return {
    sections: getPortalStarterSections(orgType, orgName),
    provisionedAt: new Date().toISOString(),
  };
}
