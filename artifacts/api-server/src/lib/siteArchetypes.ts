export type SiteArchetype =
  | "lodge_fraternal"
  | "civic_service"
  | "business_chamber"
  | "event_festival"
  | "membership_association"
  | "nonprofit_service"
  | "generic_community";

export type StylePreset =
  | "heritage"
  | "modern_civic"
  | "bold_event"
  | "warm_community"
  | "classic";

export type HomepagePlan = {
  archetype: SiteArchetype;
  stylePreset: StylePreset;
  homepageGoal: string;
  tone: string;
  primaryCTA: { label: string; href: string };
  secondaryCTA: { label: string; href: string };
  sections: string[];
  imageStrategy: string;
  avoidGenericPhrases: string[];
};

type HomepagePlanInput = {
  orgName: string;
  orgType?: string | null;
  orgCategory?: string | null;
  tagline?: string | null;
  mission?: string | null;
  location?: string | null;
  services?: string[];
  events?: Array<{
    name: string;
    description?: string | null;
    location?: string | null;
    startDate?: string | null;
    hasRegistration?: boolean | null;
  }>;
};

const GENERIC_HERO_PHRASES = [
  "welcome to our community",
  "building a better future",
  "empowering our community",
  "serving our community",
  "making a difference together",
  "creating lasting impact",
  "bringing people together",
];

const ARCHETYPE_IMAGE_POOLS: Record<
  SiteArchetype,
  { hero: string[]; about: string[] }
> = {
  lodge_fraternal: {
    hero: [
      "1511578314322-379afb476865",
      "1460661419201-fd4cecdf8a8b",
      "1500530855697-b586d89ba3ee",
      "1506744038136-46273834b3fb",
      "1517457373958-b7bdd4587205",
      "1520854221256-17451cc331bf",
    ],
    about: [
      "1518998053901-5348d3961a04",
      "1489515217757-5fd1be406fef",
      "1504384308090-c894fdcc538d",
      "1497366754035-f200968a6e72",
    ],
  },
  civic_service: {
    hero: [
      "1529156069898-aa78f52d3b87",
      "1521737604082-f4eb08bd4e18",
      "1573497491765-57b4f23b3624",
      "1531545514256-b1400bc00f31",
      "1521791055366-0d553872952f",
      "1573164574572-cb89e39749b4",
    ],
    about: [
      "1488521787991-ed7bbaae773c",
      "1559027615-cd4628902d4a",
      "1582213782179-e0d53f98f2ca",
      "1552664730-d307ca884978",
    ],
  },
  business_chamber: {
    hero: [
      "1520607162513-77705c0f0d4a",
      "1497366811353-6870744d04b2",
      "1517048676732-d65bc937f952",
      "1486406146926-c627a92ad1ab",
      "1517048676732-d65bc937f952",
      "1497366216548-37526070297c",
    ],
    about: [
      "1520607162513-77705c0f0d4a",
      "1515169067868-5387ec356754",
      "1486406146926-c627a92ad1ab",
      "1552664730-d307ca884978",
    ],
  },
  event_festival: {
    hero: [
      "1492684223066-81342ee5ff30",
      "1505236858219-8359eb29e329",
      "1511578314322-379afb476865",
      "1472653431158-6364773b2a56",
      "1507878866276-a947ef722fee",
      "1493225457124-a3eb161ffa5f",
    ],
    about: [
      "1493225457124-a3eb161ffa5f",
      "1514525253161-7a46d19cd819",
      "1505236858219-8359eb29e329",
      "1517457373958-b7bdd4587205",
    ],
  },
  membership_association: {
    hero: [
      "1488521787991-ed7bbaae773c",
      "1521791055366-0d553872952f",
      "1517457373958-b7bdd4587205",
      "1500534314209-a25ddb2bd429",
      "1511578314322-379afb476865",
      "1497366754035-f200968a6e72",
    ],
    about: [
      "1504384308090-c894fdcc538d",
      "1497366754035-f200968a6e72",
      "1489515217757-5fd1be406fef",
      "1518998053901-5348d3961a04",
    ],
  },
  nonprofit_service: {
    hero: [
      "1529156069898-aa78f52d3b87",
      "1573497491765-57b4f23b3624",
      "1521737604082-f4eb08bd4e18",
      "1517486808906-6ca8b3f04846",
      "1509099836639-18ba1795216d",
      "1559027615-cd4628902d4a",
    ],
    about: [
      "1517486808906-6ca8b3f04846",
      "1509099836639-18ba1795216d",
      "1552664730-d307ca884978",
      "1582213782179-e0d53f98f2ca",
    ],
  },
  generic_community: {
    hero: [
      "1529156069898-aa78f52d3b87",
      "1531545514256-b1400bc00f31",
      "1488521787991-ed7bbaae773c",
      "1521737604082-f4eb08bd4e18",
      "1559425036-3b9ba2e45e93",
      "1573164574572-cb89e39749b4",
    ],
    about: [
      "1559425036-3b9ba2e45e93",
      "1582213782179-e0d53f98f2ca",
      "1552664730-d307ca884978",
      "1489515217757-5fd1be406fef",
    ],
  },
};

function normalize(text: string | null | undefined): string {
  return (text ?? "").toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

export function classifySiteArchetype(input: HomepagePlanInput): SiteArchetype {
  const text = [
    input.orgName,
    input.orgType,
    input.orgCategory,
    input.tagline,
    input.mission,
    input.location,
    ...(input.services ?? []),
    ...(input.events ?? []).flatMap((event) => [event.name, event.description, event.location]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const events = input.events ?? [];
  const services = input.services ?? [];

  const lodgeScore = countMatches(text, [
    /\bmason(ic|ry)?\b/,
    /\blodge\b/,
    /\bfraternal\b/,
    /\bfree\s*(and|&)\s*accepted\b/,
    /\bknights of columbus\b/,
    /\belks\b/,
    /\bmoose\b/,
    /\bshriners?\b/,
    /\bodd fellows?\b/,
    /\beagles\b/,
  ]);

  const civicScore = countMatches(text, [
    /\brotary\b/,
    /\blions\b/,
    /\bkiwanis\b/,
    /\boptimist\b/,
    /\bciv(ic|itan)\b/,
    /\bservice club\b/,
    /\bcommunity service\b/,
  ]);

  const businessScore = countMatches(text, [
    /\bchamber\b/,
    /\bmain street\b/,
    /\bdowntown\b/,
    /\bbusiness alliance\b/,
    /\bmerchant(s)?\b/,
    /\beconomic development\b/,
  ]);

  const nonprofitScore = countMatches(text, [
    /\bnonprofit\b/,
    /\bfoundation\b/,
    /\bcharity\b/,
    /\bfood pantry\b/,
    /\brescue\b/,
    /\bdonate\b/,
    /\bvolunteer\b/,
    /\bmission\b/,
  ]);

  const membershipScore = countMatches(text, [
    /\bassociation\b/,
    /\bsociety\b/,
    /\bguild\b/,
    /\balumni\b/,
    /\bhomeowners?\b/,
    /\bneighborhood association\b/,
    /\bmembership\b/,
  ]);

  const ticketedOrVendor = events.some(
    (event) =>
      !!event.hasRegistration ||
      /ticket|vendor|booth|sponsor|festival|fair|parade|gala|market|expo/i.test(
        `${event.name} ${event.description ?? ""}`,
      ),
  );
  const hasFestivalSignals =
    hasAny(text, [/\bfestival\b/, /\bfair\b/, /\bparade\b/, /\bmarket\b/, /\bgala\b/, /\bexpo\b/]) ||
    ticketedOrVendor ||
    services.some((service) => /\bfestival\b|\bfair\b|\bparade\b|\bmarket\b/i.test(service));

  if (lodgeScore > 0) return "lodge_fraternal";
  if (hasFestivalSignals && (events.length >= 1 || /event/.test(text))) {
    return "event_festival";
  }
  if (civicScore > 0) return "civic_service";
  if (businessScore > 0) return "business_chamber";
  if (nonprofitScore > 0) return "nonprofit_service";
  if (membershipScore > 0) return "membership_association";
  if ((input.orgType ?? "").toLowerCase().includes("association")) return "membership_association";
  return "generic_community";
}

export function archetypeStylePreset(archetype: SiteArchetype): StylePreset {
  switch (archetype) {
    case "lodge_fraternal":
      return "heritage";
    case "civic_service":
      return "modern_civic";
    case "business_chamber":
      return "classic";
    case "event_festival":
      return "bold_event";
    case "nonprofit_service":
      return "warm_community";
    case "membership_association":
      return "classic";
    case "generic_community":
    default:
      return "warm_community";
  }
}

export function getArchetypeImagePool(archetype: SiteArchetype): {
  hero: string[];
  about: string[];
} {
  return ARCHETYPE_IMAGE_POOLS[archetype];
}

export function containsGenericHeroPhrase(text: string | null | undefined): boolean {
  const lower = normalize(text);
  return GENERIC_HERO_PHRASES.some((phrase) => lower.includes(phrase));
}

export function ensureSpecificLine(
  text: string | null | undefined,
  fallback: string,
): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return fallback;
  if (containsGenericHeroPhrase(trimmed)) return fallback;
  return trimmed;
}

export function buildHomepagePlan(input: HomepagePlanInput): HomepagePlan {
  const archetype = classifySiteArchetype(input);
  const stylePreset = archetypeStylePreset(archetype);
  const location = (input.location ?? "").trim();
  const place = location || "your community";
  const events = input.events ?? [];
  const hasTicketed = events.some((event) => !!event.hasRegistration);
  const hasVendorEvent = events.some((event) =>
    /vendor|booth|market|festival|fair|expo/i.test(`${event.name} ${event.description ?? ""}`),
  );
  const text = [
    input.orgName,
    input.orgType,
    input.orgCategory,
    input.tagline,
    input.mission,
    ...(input.services ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  const isLionsClub = /\blions?\b|\bleos?\b|\blcif\b/.test(text);

  switch (archetype) {
    case "lodge_fraternal":
      return {
        archetype,
        stylePreset,
        homepageGoal: "Present the lodge as a grounded local institution with clear paths to visit, join, attend events, book the hall, and reach members-only resources.",
        tone: "formal but approachable, heritage-aware, specific about fellowship, meetings, community work, membership, and hall use",
        primaryCTA: { label: "Visit a Meeting", href: "#contact" },
        secondaryCTA: { label: "Learn Our Story", href: "#programs" },
        sections: [
          "split_hero",
          "lodge_identity_cards",
          "meeting_info",
          "events_calendar",
          "hall_or_venue_details",
          "community_service",
          "membership",
          "members_portal",
          "contact",
        ],
        imageStrategy: "Prefer real lodge buildings, halls, interiors, historic architecture, fellowship, member service, and community moments. Never use generic corporate office imagery for lodge/fraternal sites.",
        avoidGenericPhrases: GENERIC_HERO_PHRASES,
      };
    case "civic_service":
      if (isLionsClub) {
        return {
          archetype,
          stylePreset,
          homepageGoal:
            "Present a Lions-style service club homepage with clear join, donate/support, find-a-project, and member-resource pathways, plus a strong explanation of local service impact.",
          tone: "direct, compassionate, service-minded, donor-aware, practical",
          primaryCTA: { label: "Join the Club", href: "#contact" },
          secondaryCTA: { label: "Support Our Service", href: events.length > 0 ? "#events" : "#programs" },
          sections: ["service_hero", "join_donate_ctas", "support_pathway", "cause_cards", "impact_numbers", "foundation_promo", "member_resources", "contact"],
          imageStrategy: "Prefer Lions members serving in the community, donation or supply drives, vision and health service, youth work, disaster response, and real local project moments. Avoid copying Lions International assets or generic corporate philanthropy imagery.",
          avoidGenericPhrases: GENERIC_HERO_PHRASES,
        };
      }
      return {
        archetype,
        stylePreset,
        homepageGoal:
          "Present an action-forward service club homepage with visible impact, current projects, meeting access, and clear paths to volunteer, join, or support the work.",
        tone: "confident, service-oriented, neighborly, action-focused",
        primaryCTA: { label: "Take Action", href: "#contact" },
        secondaryCTA: { label: events.length > 0 ? "Upcoming Service" : "See Our Work", href: events.length > 0 ? "#events" : "#programs" },
        sections: ["action_hero", "feature_mosaic", "impact_numbers", "service_areas", "meetings", "upcoming_events", "get_involved"],
        imageStrategy: "Prefer volunteers in action, local gatherings, hands-on service, community projects, and real town settings. Favor documentary, human-centered images over abstract civic icons.",
        avoidGenericPhrases: GENERIC_HERO_PHRASES,
      };
    case "business_chamber":
      return {
        archetype,
        stylePreset,
        homepageGoal: "Clarify member benefits, networking value, and the next way local businesses can plug in.",
        tone: "professional, local, business-forward, pragmatic",
        primaryCTA: { label: "Join the Chamber", href: "#contact" },
        secondaryCTA: { label: events.length > 0 ? "Upcoming Networking Events" : "Member Benefits", href: events.length > 0 ? "#events" : "#programs" },
        sections: ["hero", "business_stats", "benefits", "events", "partners", "contact"],
        imageStrategy: "Use vibrant downtown scenes, storefronts, networking, ribbon cuttings, and local business life. Generic office photos are only acceptable when the org clearly reads as professional-services-first.",
        avoidGenericPhrases: GENERIC_HERO_PHRASES,
      };
    case "event_festival":
      return {
        archetype,
        stylePreset,
        homepageGoal: "Drive visitors toward the next event action: tickets, vendors, sponsors, or plan-your-visit details.",
        tone: "energetic, specific, date-forward, crowd-ready",
        primaryCTA: { label: hasTicketed ? "Buy Tickets" : hasVendorEvent ? "Become a Vendor" : "Plan Your Visit", href: "#events" },
        secondaryCTA: { label: hasVendorEvent ? "Sponsor the Event" : "See Event Details", href: "#events" },
        sections: ["hero", "dates", "featured_event", "tickets_vendors", "schedule", "contact"],
        imageStrategy: "Use crowd energy, stages, booths, downtown festivals, parades, and outdoor moments. Avoid generic office or handshake imagery.",
        avoidGenericPhrases: GENERIC_HERO_PHRASES,
      };
    case "membership_association":
      return {
        archetype,
        stylePreset,
        homepageGoal: "Explain belonging, member value, and what someone should do next to join or attend.",
        tone: "clear, credible, welcoming, member-centered",
        primaryCTA: { label: "Become a Member", href: "#contact" },
        secondaryCTA: { label: events.length > 0 ? "Upcoming Gatherings" : "What We Offer", href: events.length > 0 ? "#events" : "#programs" },
        sections: ["hero", "member_value", "programs", "events", "contact"],
        imageStrategy: "Prefer real member gatherings, community rooms, local settings, and practical association imagery. Avoid polished enterprise-office stock.",
        avoidGenericPhrases: GENERIC_HERO_PHRASES,
      };
    case "nonprofit_service":
      return {
        archetype,
        stylePreset,
        homepageGoal: "Translate mission into visible outcomes and direct visitors toward volunteering, giving, or contacting the team.",
        tone: "warm, urgent, human, impact-focused",
        primaryCTA: { label: "Volunteer With Us", href: "#contact" },
        secondaryCTA: { label: "Support the Mission", href: "#programs" },
        sections: ["hero", "impact_stats", "mission", "programs", "events", "contact"],
        imageStrategy: "Show real service, volunteers, recipients, neighborhood scenes, and grounded mission moments. Avoid sleek corporate boardroom imagery.",
        avoidGenericPhrases: GENERIC_HERO_PHRASES,
      };
    case "generic_community":
    default:
      return {
        archetype,
        stylePreset,
        homepageGoal: `Make ${input.orgName} feel specific to ${place} and give visitors one obvious next step.`,
        tone: "friendly, grounded, community-focused",
        primaryCTA: { label: "Get Involved", href: "#contact" },
        secondaryCTA: { label: events.length > 0 ? "Upcoming Events" : "Learn More", href: events.length > 0 ? "#events" : "#about" },
        sections: ["hero", "stats", "programs", "events", "contact"],
        imageStrategy: "Prefer real towns, volunteers, gatherings, and local landmarks over generic business imagery.",
        avoidGenericPhrases: GENERIC_HERO_PHRASES,
      };
  }
}
