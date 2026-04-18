// src/lib/membersPortalProvision.ts
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// src/lib/logger.ts
import pino from "pino";
var isProduction = process.env.NODE_ENV === "production";
var logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']"
  ],
  ...isProduction ? {} : {
    transport: {
      target: "pino-pretty",
      options: { colorize: true }
    }
  }
});

// src/lib/pillarSync.ts
async function pillarRequest(path, method, body) {
  const baseUrl = (process.env.COMMUNITY_PLATFORM_URL || "http://localhost:5001").replace(/\/$/, "");
  const serviceKey = process.env.PILLAR_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("PILLAR_SERVICE_KEY is not set");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-pillar-service-key": serviceKey
    },
    body: body !== void 0 ? JSON.stringify(body) : void 0,
    signal: AbortSignal.timeout(1e4)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(
      `Pillar sync ${method} ${path} \u2192 ${response.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

// src/lib/pillarOrgSync.ts
async function syncOrgConfigPatchToPillar(payload) {
  console.log(`[pillar-sync] org-config patch org=${payload.orgId}`);
  return pillarRequest("/api/internal/org-config", "PATCH", payload);
}

// src/lib/sectionRegistry.ts
var SECTION_REGISTRY = {
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
        { name: "Bob Jones", title: "Treasurer", email: "bob@example.org", photoUrl: null }
      ]
    }
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
        { url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800", caption: "Annual Gala 2024" }
      ]
    }
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
        { name: "Acme Corp", logoUrl: null, website: "https://acme.com", tier: "Gold" }
      ]
    }
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
      milestones: [{ year: "1952", event: "Organization founded" }]
    }
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
        { title: "Event Volunteer", description: "Help run our annual fundraiser", commitment: "1 weekend/year", contact: "events@example.org" }
      ]
    }
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
      body: "Thanks for being part of our community. Here is everything you need to stay involved."
    }
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
        { date: "2026-04-12", title: "April meeting moved to the 22nd", body: "Hall is unavailable on the 15th. We'll meet at the same time on Wednesday the 22nd." }
      ]
    }
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
      payUrl: null
    }
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
        { name: "Membership Committee", description: "Welcomes new members and runs orientation.", contact: "membership@example.org" }
      ]
    }
  },
  member_roster: {
    type: "member_roster",
    label: "Member roster",
    description: "Live directory of current members. Reads from the members table \u2014 no manual data entry. Members who opt out of the directory are hidden.",
    surfaces: { public: false, portal: true },
    example: {
      type: "member_roster",
      title: "Member roster"
    }
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
        { name: "2024 Annual Report", url: "https://example.org/report.pdf", description: "Year in review", category: "Reports" }
      ]
    }
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
        { date: "2026-05-14", note: "Officer elections" }
      ]
    }
  }
};

// src/lib/membersPortalDefaults.ts
function starter(type, overrides = {}) {
  const def = SECTION_REGISTRY[type];
  if (!def) {
    throw new Error(`[membersPortalDefaults] unknown section type: ${type}`);
  }
  const example = JSON.parse(JSON.stringify(def.example));
  return { ...example, ...overrides, type };
}
var fraternalSet = (orgName) => [
  starter("welcome_message", {
    title: `Welcome, brothers`,
    body: `This is your private members area for ${orgName}. Check here first for notices, dues information, and the latest from the lodge.`
  }),
  starter("notices", { title: "Lodge notices" }),
  starter("meeting_schedule", { title: "When we meet" }),
  starter("dues_info", {
    title: "Annual dues",
    body: "Dues keep the lodge running and fund our charitable work. Pay online once we have payments enabled, or mail a check to the treasurer."
  }),
  starter("documents", {
    title: "Lodge documents",
    documents: []
  }),
  starter("member_roster", { title: "Brother roster" })
];
var civicClubSet = (orgName) => [
  starter("welcome_message", {
    title: "Welcome, members",
    body: `Thanks for being part of ${orgName}. Use this portal to stay on top of meetings, committees, and dues.`
  }),
  starter("meeting_schedule", { title: "Upcoming meetings" }),
  starter("committee_signups", { title: "Committees & projects" }),
  starter("dues_info", { title: "Annual dues" }),
  starter("member_roster", { title: "Member roster" }),
  starter("documents", { title: "Member documents", documents: [] })
];
var ptaSet = (orgName) => [
  starter("welcome_message", {
    title: "Welcome, families",
    body: `Welcome to the ${orgName} members portal. Find volunteer opportunities, school dates, and the family directory here.`
  }),
  starter("notices", { title: "Notices for families" }),
  starter("committee_signups", { title: "Volunteer sign-ups" }),
  starter("meeting_schedule", { title: "PTA meetings" }),
  starter("member_roster", { title: "Family directory" }),
  starter("documents", { title: "Forms & resources", documents: [] })
];
var chamberSet = (orgName) => [
  starter("welcome_message", {
    title: "Welcome, members",
    body: `${orgName} member portal \u2014 the home of your membership benefits, peer directory, and member-only resources.`
  }),
  starter("notices", { title: "Member announcements" }),
  starter("meeting_schedule", { title: "Member events & mixers" }),
  starter("member_roster", { title: "Business directory" }),
  starter("documents", { title: "Member resources", documents: [] })
];
var veteransSet = (orgName) => [
  starter("welcome_message", {
    title: "Welcome, comrades",
    body: `Your private space for ${orgName} \u2014 post notices, meeting changes, dues, and roster.`
  }),
  starter("notices", { title: "Post notices" }),
  starter("meeting_schedule", { title: "Meetings" }),
  starter("dues_info", { title: "Dues" }),
  starter("documents", { title: "Post documents", documents: [] }),
  starter("member_roster", { title: "Roster" })
];
var neighborhoodSet = (orgName) => [
  starter("welcome_message", {
    title: "Welcome, neighbors",
    body: `${orgName} member portal. Stay current on neighborhood meetings, notices, and your neighbor directory.`
  }),
  starter("notices", { title: "Neighborhood notices" }),
  starter("meeting_schedule", { title: "Association meetings" }),
  starter("member_roster", { title: "Neighbor directory" }),
  starter("documents", { title: "Documents", documents: [] })
];
var defaultSet = (orgName) => [
  starter("welcome_message", {
    title: "Welcome, members",
    body: `Welcome to the ${orgName} members area. Use the sections below to stay involved.`
  }),
  starter("notices", { title: "Member notices" }),
  starter("meeting_schedule", { title: "When we meet" }),
  starter("member_roster", { title: "Member roster" }),
  starter("documents", { title: "Documents", documents: [] })
];
function getPortalStarterSections(orgType, orgName) {
  const t = (orgType || "").toLowerCase();
  const safeName = orgName?.trim() || "your organization";
  if (t.includes("fraternal") || t.includes("lodge") || t.includes("mason") || t.includes("eagles") || t.includes("elks") || t.includes("moose") || t.includes("oddfellow")) {
    return fraternalSet(safeName);
  }
  if (t.includes("vfw") || t.includes("legion") || t.includes("veteran")) {
    return veteransSet(safeName);
  }
  if (t.includes("lions")) {
    return fraternalSet(safeName);
  }
  if (t.includes("rotary") || t.includes("kiwanis") || t.includes("optimist")) {
    return civicClubSet(safeName);
  }
  if (t.includes("pta") || t.includes("pto") || t.includes("parent")) {
    return ptaSet(safeName);
  }
  if (t.includes("chamber") || t.includes("downtown") || t.includes("main street") || t.includes("business")) {
    return chamberSet(safeName);
  }
  if (t.includes("neighborhood") || t.includes("homeowners") || t.includes("hoa")) {
    return neighborhoodSet(safeName);
  }
  return defaultSet(safeName);
}
function buildStarterPortalConfig(orgType, orgName) {
  return {
    sections: getPortalStarterSections(orgType, orgName),
    provisionedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/lib/membersPortalProvision.ts
function portalAlreadyProvisioned(siteConfig) {
  if (!siteConfig || typeof siteConfig !== "object") return false;
  const portal = siteConfig.membersPortal;
  if (!portal || typeof portal !== "object") return false;
  return Array.isArray(portal.sections) && portal.sections.length > 0;
}
function applyAboutMissionToWelcome(sections, aboutMission) {
  if (!aboutMission || !aboutMission.trim()) return sections;
  return sections.map((section) => {
    if (section.type !== "welcome_message") return section;
    return { ...section, body: aboutMission.trim() };
  });
}
async function ensureMembersPortalProvisioned(orgId) {
  try {
    const result = await db.execute(sql`
      SELECT id, slug, name, type, site_config
      FROM organizations
      WHERE id = ${orgId}
      LIMIT 1
    `);
    const org = result.rows[0];
    if (!org) {
      logger.warn({ orgId }, "[members-portal] org not found, skipping provision");
      return;
    }
    if (portalAlreadyProvisioned(org.site_config)) return;
    const orgName = org.name ?? "your organization";
    const starter2 = buildStarterPortalConfig(org.type, orgName);
    const aboutMission = org.site_config?.about_mission;
    starter2.sections = applyAboutMissionToWelcome(starter2.sections, aboutMission);
    const portalJson = JSON.stringify(starter2);
    await db.execute(sql`
      UPDATE organizations
      SET site_config = jsonb_set(
        COALESCE(site_config, '{}'::jsonb),
        '{membersPortal}',
        ${portalJson}::jsonb,
        true
      )
      WHERE id = ${orgId}
    `);
    const cpOrgId = org.slug ?? orgId;
    try {
      const featuresRow = await db.execute(sql`
        SELECT features FROM cs_org_configs WHERE org_id = ${cpOrgId} LIMIT 1
      `);
      const currentFeatures = featuresRow.rows[0]?.features ?? {};
      await syncOrgConfigPatchToPillar({
        orgId: cpOrgId,
        // syncOrgConfigPatchToPillar's typed payload only declares known
        // fields; the underlying CP /api/internal/org-config patch handler
        // accepts any column on cs_org_configs and we're patching the
        // existing JSONB `features` column with a merged object.
        ...{
          features: { ...currentFeatures, membersPortal: starter2, members: true }
        }
      });
    } catch (cpErr) {
      logger.warn(
        { err: cpErr, orgId, cpOrgId },
        "[members-portal] could not mirror portal config to CP \u2014 site may not be provisioned yet"
      );
    }
    logger.info(
      { orgId, orgType: org.type, sectionCount: starter2.sections.length },
      "[members-portal] provisioned starter portal sections"
    );
  } catch (err) {
    logger.warn(
      { err, orgId },
      "[members-portal] portal provisioning failed (non-fatal)"
    );
  }
}
export {
  ensureMembersPortalProvisioned
};
