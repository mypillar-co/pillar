import { randomUUID } from "crypto";
import type { SiteProfile } from "../types/site-profile.js";
import type { LayoutSignals, LayoutStrategy } from "../types/layout-strategy.js";
import type { PlannedBlock, PlannedPage, PagePlan } from "../types/page-plan.js";
import type { UpdatePolicy, LockLevel } from "../types/block-types.js";

export function determineLayoutStrategy(profile: SiteProfile, signals: LayoutSignals): LayoutStrategy {
  let effectiveEventCount = signals.eventCount;
  let effectiveSponsorCount = signals.sponsorCount;
  let effectiveImageRichness = signals.imageRichness;
  let effectiveMissionStrength = signals.missionStrength;

  if (signals.importEventHeavy) effectiveEventCount += 3;
  if (signals.importHasHeroImage && signals.aiSignals.imageRich) effectiveImageRichness = "high";
  if (signals.importHasStrongMission) effectiveMissionStrength = "strong";

  if (effectiveEventCount >= 3 && effectiveSponsorCount >= 1) return "event-driven";
  if (effectiveEventCount >= 2 && (signals.ctaType === "register" || signals.ctaType === "buy_tickets")) return "event-driven";
  // Membership-driven: import membership signal alone is sufficient (confirmed from site structure)
  // Without import, require at least a weak mission so the hero has something to say
  if (signals.membershipPresence && (effectiveMissionStrength !== "none" || signals.aiSignals.membershipDriven)) return "membership-driven";
  if (signals.programCount >= 3) return "program-driven";
  if (effectiveImageRichness === "high" && effectiveEventCount < 2) return "visual-first";
  if (effectiveMissionStrength === "none" && effectiveEventCount < 2 && signals.programCount < 2) return "minimal";
  return "balanced";
}

function block(
  blockType: string,
  variantKey: string,
  lockLevel: LockLevel,
  sortOrder: number,
  updatePolicy: UpdatePolicy = "manual_only",
  bindingSpec?: PlannedBlock["bindingSpec"],
): PlannedBlock {
  return {
    id: randomUUID(),
    blockType: blockType as PlannedBlock["blockType"],
    variantKey,
    sortOrder,
    lockLevel,
    sourceMode: bindingSpec ? "dynamic" : "generated",
    contentJson: {},
    settingsJson: {},
    bindingSpec,
  };
}

const EVENTS_BINDING = {
  bindingType: "events_list",
  sourceType: "events",
  queryConfigJson: { showOnPublicSite: true, orderBy: "startDate", limit: 6 },
  displayConfigJson: {},
  updatePolicy: "auto_apply" as UpdatePolicy,
};

const SPONSOR_BINDING = {
  bindingType: "sponsors",
  sourceType: "sponsors",
  queryConfigJson: { siteVisible: true, status: "active" },
  displayConfigJson: {},
  updatePolicy: "auto_apply" as UpdatePolicy,
};

const FEATURED_EVENT_BINDING = {
  bindingType: "featured_event",
  sourceType: "events",
  queryConfigJson: { featuredOnSite: true, limit: 1 },
  displayConfigJson: {},
  updatePolicy: "auto_apply" as UpdatePolicy,
};

const ANNOUNCEMENTS_BINDING = {
  bindingType: "announcements",
  sourceType: "announcements",
  queryConfigJson: { siteStatus: "approved", limit: 5 },
  displayConfigJson: {},
  updatePolicy: "auto_apply" as UpdatePolicy,
};

function buildHomeBlocks(strategy: LayoutStrategy, profile: SiteProfile, signals: LayoutSignals, hasAnnouncementsFlag: boolean): PlannedBlock[] {
  let blocks: PlannedBlock[] = [];

  switch (strategy) {
    case "event-driven":
      blocks = [
        // hero-centered: org identity hero. The featured_event block below is the event showcase.
        block("hero", "hero-centered", "review_required", 0),
        block("featured_event", "featured-event-banner", "editable", 1, "auto_apply", FEATURED_EVENT_BINDING),
        block("events_list", "events-list-featured-first", "editable", 2, "auto_apply", EVENTS_BINDING),
        block("cta_band", "cta-register", "review_required", 3),
        block("sponsor_grid", "sponsor-grid-tiered", "editable", 4, "auto_apply", SPONSOR_BINDING),
        block("about", "about-simple", "locked", 5),
        block("contact", "contact-simple", "editable", 6),
      ];
      break;

    case "program-driven":
      blocks = [
        block("hero", "hero-split", "review_required", 0),
        block("about", "about-centered", "locked", 1),
        block("cards", "cards-3up", "locked", 2),
        block("events_list", "events-list-standard", "editable", 3, "auto_apply", EVENTS_BINDING),
        block("cta_band", "cta-join", "review_required", 4),
        block("contact", "contact-two-column", "editable", 5),
      ];
      break;

    case "membership-driven":
      blocks = [
        block("hero", "hero-mission", "review_required", 0),
        block("cards", "cards-icon", "locked", 1),
        block("cta_band", "cta-join", "review_required", 2),
        block("events_list", "events-list-compact", "editable", 3, "auto_apply", EVENTS_BINDING),
        block("about", "about-split", "locked", 4),
        block("contact", "contact-two-column", "editable", 5),
      ];
      break;

    case "visual-first":
      blocks = [
        block("hero", "hero-image", "review_required", 0),
        block("gallery", "gallery-grid", "editable", 1),
        block("cards", "cards-image", "locked", 2),
        block("events_list", "events-list-standard", "editable", 3, "auto_apply", EVENTS_BINDING),
        block("contact", "contact-simple", "editable", 4),
      ];
      break;

    case "minimal":
      blocks = [
        block("hero", "hero-centered", "review_required", 0),
        block("about", "about-simple", "locked", 1),
        block("contact", "contact-simple", "editable", 2),
      ];
      break;

    default:
    case "balanced":
      blocks = [
        block("hero", "hero-centered", "review_required", 0),
        block("about", "about-split", "locked", 1),
        block("events_list", "events-list-standard", "editable", 2, "auto_apply", EVENTS_BINDING),
        block("cta_band", "cta-contact", "review_required", 3),
        block("contact", "contact-two-column", "editable", 4),
      ];
      break;
  }

  let nextSort = blocks.length;

  if (profile.hasRealStats) {
    blocks.push(block("stats", "stats-strip", "locked", nextSort++));
  }

  const hasSponsorGrid = blocks.some(b => b.blockType === "sponsor_grid");
  if (signals.sponsorCount >= 1 && !hasSponsorGrid) {
    blocks.push(block("sponsor_grid", "sponsor-grid-standard", "editable", nextSort++, "auto_apply", SPONSOR_BINDING));
  }

  if (hasAnnouncementsFlag) {
    blocks.push(block("announcements", "announcements-list", "editable", nextSort++, "auto_apply", ANNOUNCEMENTS_BINDING));
  }

  return blocks;
}

function buildInnerPages(strategy: LayoutStrategy, orgId: string, siteId: string): PlannedPage[] {
  const pages: PlannedPage[] = [];

  const addPage = (title: string, slug: string, pageType: string, blocks: PlannedBlock[], sortOrder: number) => {
    pages.push({
      id: randomUUID(),
      title,
      slug,
      pageType: pageType as PlannedPage["pageType"],
      isHomepage: false,
      sortOrder,
      blocks,
    });
  };

  switch (strategy) {
    case "event-driven":
      addPage("Events", "events", "events", [
        block("events_list", "events-list-card-grid", "editable", 0, "auto_apply", EVENTS_BINDING),
      ], 1);
      addPage("Sponsors", "sponsors", "sponsors", [
        block("sponsor_grid", "sponsor-grid-tiered", "editable", 0, "auto_apply", SPONSOR_BINDING),
      ], 2);
      addPage("Contact", "contact", "contact", [
        block("contact", "contact-two-column", "editable", 0),
      ], 3);
      break;

    case "program-driven":
      addPage("Programs", "programs", "programs", [
        block("cards", "cards-3up", "locked", 0),
      ], 1);
      addPage("Events", "events", "events", [
        block("events_list", "events-list-standard", "editable", 0, "auto_apply", EVENTS_BINDING),
      ], 2);
      addPage("Contact", "contact", "contact", [
        block("contact", "contact-two-column", "editable", 0),
      ], 3);
      break;

    case "membership-driven":
      addPage("About", "about", "about", [
        block("about", "about-centered", "locked", 0),
      ], 1);
      addPage("Membership", "membership", "membership", [
        block("membership", "membership-benefits", "editable", 0),
        block("cta_band", "cta-join", "review_required", 1),
      ], 2);
      addPage("Events", "events", "events", [
        block("events_list", "events-list-standard", "editable", 0, "auto_apply", EVENTS_BINDING),
      ], 3);
      addPage("Contact", "contact", "contact", [
        block("contact", "contact-two-column", "editable", 0),
      ], 4);
      break;

    case "visual-first":
      addPage("Gallery", "gallery", "gallery", [
        block("gallery", "gallery-feature", "editable", 0),
      ], 1);
      addPage("Events", "events", "events", [
        block("events_list", "events-list-standard", "editable", 0, "auto_apply", EVENTS_BINDING),
      ], 2);
      addPage("Contact", "contact", "contact", [
        block("contact", "contact-simple", "editable", 0),
      ], 3);
      break;

    case "minimal":
      addPage("Contact", "contact", "contact", [
        block("contact", "contact-simple", "editable", 0),
      ], 1);
      break;

    default:
    case "balanced":
      addPage("About", "about", "about", [
        block("about", "about-columns", "locked", 0),
      ], 1);
      addPage("Events", "events", "events", [
        block("events_list", "events-list-standard", "editable", 0, "auto_apply", EVENTS_BINDING),
      ], 2);
      addPage("Contact", "contact", "contact", [
        block("contact", "contact-two-column", "editable", 0),
      ], 3);
      break;
  }

  return pages;
}

export function buildPagePlan(
  orgId: string,
  siteId: string,
  profile: SiteProfile,
  strategy: LayoutStrategy,
  signals: LayoutSignals,
  hasAnnouncementsFlag: boolean = false,
): PagePlan {
  const homeBlocks = buildHomeBlocks(strategy, profile, signals, hasAnnouncementsFlag);

  const homepage: PlannedPage = {
    id: randomUUID(),
    title: "Home",
    slug: "home",
    pageType: "home",
    isHomepage: true,
    sortOrder: 0,
    blocks: homeBlocks,
  };

  const innerPages = buildInnerPages(strategy, orgId, siteId);

  const allPages = [homepage, ...innerPages];

  const navItems = allPages
    .filter(p => !p.isHomepage || allPages.length > 1)
    .map((p, i) => ({
      label: p.title,
      slug: p.slug,
      navLocation: "header" as const,
      sortOrder: i,
    }));

  return {
    orgId,
    siteId,
    strategy,
    pages: allPages,
    navItems,
  };
}
