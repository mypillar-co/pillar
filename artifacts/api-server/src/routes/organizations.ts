import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  organizationsTable,
  contactsTable,
  vendorsTable,
  sponsorsTable,
  eventsTable,
  ticketTypesTable,
  ticketSalesTable,
  eventVendorsTable,
  eventSponsorsTable,
  eventApprovalsTable,
  eventCommunicationsTable,
  recurringEventTemplatesTable,
  paymentsTable,
  boardApprovalLinksTable,
  boardApprovalVotesTable,
  notificationsTable,
  siteUpdateSchedulesTable,
  sitesTable,
  sitePagesTable,
  siteBlocksTable,
  siteNavItemsTable,
  socialAccountsTable,
  socialPostsTable,
  automationRulesTable,
  contentStrategyTable,
  oauthStatesTable,
  domainsTable,
  studioOutputsTable,
  websiteSpecsTable,
  subscriptionsTable,
} from "@workspace/db";
import { eq, desc, asc, isNotNull, and, sql } from "drizzle-orm";
import { syncOrgConfigPatchToPillar } from "../lib/pillarOrgSync.js";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage.js";
import { AI_UNAVAILABLE_MESSAGE, createOpenAIClient } from "../lib/openaiClient";

const objectStorageService = new ObjectStorageService();

interface UnsplashPhoto {
  id: string;
  urls: { small: string; regular: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
}

type HeroVisualType = "banner_background" | "feature_photo" | "none";
type HeroLayout = "split_framed" | "full_bleed" | null;

function layoutForHeroVisualType(heroVisualType: HeroVisualType): HeroLayout {
  if (heroVisualType === "banner_background") return "full_bleed";
  if (heroVisualType === "feature_photo") return "split_framed";
  return null;
}

function heroFeaturePatch(heroVisualType: HeroVisualType) {
  return {
    heroVisualType,
    heroLayout: layoutForHeroVisualType(heroVisualType),
  };
}

function normalizeHeroVisualType(value: unknown, fallback: HeroVisualType): HeroVisualType {
  return value === "banner_background" || value === "feature_photo" || value === "none"
    ? value
    : fallback;
}

function svgToBase64DataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function bufferToDataUrl(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHexColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{3,6}$/.test(trimmed) ? trimmed : fallback;
}

function getOrgInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "PO";
}

type BannerMotif =
  | "festival"
  | "lodge"
  | "civic"
  | "chamber"
  | "nonprofit"
  | "community";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function scoreKeyword(text: string, keywords: string[], weight: number): number {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? weight : 0), 0);
}

function selectBannerMotif(input: {
  orgName: string;
  orgType?: string | null;
  category?: string | null;
  tagline?: string | null;
}): BannerMotif {
  const text = [
    input.orgName,
    input.orgType,
    input.category,
    input.tagline,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const scores: Record<BannerMotif, number> = {
    festival:
      scoreKeyword(text, ["festival", "fair", "parade", "event", "events", "concert", "market", "car cruise", "cruise"], 5),
    lodge:
      scoreKeyword(text, ["lodge", "masonic", "mason", "masons", "fraternal", "brotherhood", "vfw", "legion", "hall"], 5),
    civic:
      scoreKeyword(text, ["rotary", "kiwanis", "lions", "civic", "service", "volunteer", "community service"], 5),
    chamber:
      scoreKeyword(text, ["chamber", "business", "commerce", "main street", "downtown", "merchant", "networking"], 5),
    nonprofit:
      scoreKeyword(text, ["nonprofit", "foundation", "fund", "mission", "relief", "donate", "charity", "volunteer"], 4),
    community:
      scoreKeyword(text, ["community", "neighborhood", "association", "club", "council"], 3),
  };

  if (scores.festival > 0) scores.festival += 2;
  if (scores.lodge > 0) scores.lodge += 1;

  return (Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] as BannerMotif) || "community";
}

async function getOrgBrandingSnapshot(orgSlug: string) {
  const result = await db.execute(sql`
    SELECT primary_color, accent_color, tagline
    FROM cs_org_configs
    WHERE org_id = ${orgSlug}
    LIMIT 1
  `);
  const row = result.rows[0] as
    | { primary_color?: string | null; accent_color?: string | null; tagline?: string | null }
    | undefined;
  return {
    primaryColor: sanitizeHexColor(row?.primary_color, "#c25038"),
    accentColor: sanitizeHexColor(row?.accent_color, "#2563eb"),
    tagline: row?.tagline ?? null,
  };
}

function buildBrandedBannerSvg(input: {
  orgName: string;
  orgType?: string | null;
  category?: string | null;
  tagline?: string | null;
  primaryColor: string;
  accentColor: string;
}) {
  const primaryColor = sanitizeHexColor(input.primaryColor, "#c25038");
  const accentColor = sanitizeHexColor(input.accentColor, "#2563eb");
  const initials = escapeSvgText(getOrgInitials(input.orgName));
  const motif = selectBannerMotif(input);
  const seed = hashString(`${input.orgName}:${input.orgType ?? ""}:${input.category ?? ""}`);
  const offset = seed % 140;
  const angle = 8 + (seed % 18);
  const motifSvg = {
    festival: `
  <g opacity="0.92">
    <path d="M70 ${680 - offset * 0.2}C214 585 328 566 490 612C658 660 814 792 1030 727C1170 685 1272 606 1440 612V900H70V${680 - offset * 0.2}Z" fill="#030712" opacity="0.48" />
    <path d="M148 588L260 372L372 588H148Z" fill="${accentColor}" opacity="0.28" />
    <path d="M288 588L410 326L532 588H288Z" fill="#ffffff" opacity="0.08" />
    <path d="M472 588L622 286L772 588H472Z" fill="${accentColor}" opacity="0.18" />
    <path d="M108 200C286 278 426 126 602 204C788 286 890 394 1124 238C1216 176 1300 166 1400 198" stroke="${accentColor}" stroke-width="44" stroke-linecap="round" opacity="0.28" />
    <path d="M120 236C302 318 442 162 612 240C790 322 902 430 1134 274C1224 214 1308 204 1392 232" stroke="url(#shine)" stroke-width="16" stroke-linecap="round" opacity="0.8" />
    ${Array.from({ length: 18 }, (_, i) => {
      const x = 120 + i * 72 + ((seed + i * 19) % 28);
      const y = 112 + ((seed + i * 31) % 300);
      const r = 5 + ((seed + i * 7) % 8);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 3 === 0 ? accentColor : "#ffffff"}" opacity="${i % 3 === 0 ? "0.45" : "0.18"}" />`;
    }).join("")}
  </g>`,
    lodge: `
  <g opacity="0.94">
    <path d="M0 708C210 640 412 637 650 682C934 736 1138 724 1400 604V900H0V708Z" fill="#030712" opacity="0.52" />
    <path d="M934 118L1274 458L934 798L594 458L934 118Z" stroke="rgba(255,255,255,0.18)" stroke-width="3" />
    <path d="M934 210L1182 458L934 706L686 458L934 210Z" stroke="${accentColor}" stroke-width="5" opacity="0.38" />
    <path d="M934 310L1082 458L934 606L786 458L934 310Z" fill="#ffffff" opacity="0.06" />
    <path d="M128 150H506" stroke="rgba(255,255,255,0.24)" stroke-width="9" stroke-linecap="round" />
    <path d="M128 186H374" stroke="${accentColor}" stroke-width="9" stroke-linecap="round" opacity="0.76" />
    <path d="M112 750C180 666 250 624 330 624C410 624 480 666 548 750" stroke="${accentColor}" stroke-width="10" opacity="0.36" fill="none" />
    <path d="M102 788C176 698 250 654 330 654C410 654 484 698 558 788" stroke="rgba(255,255,255,0.16)" stroke-width="4" fill="none" />
    <text x="1112" y="646" font-family="Georgia, serif" font-size="220" font-weight="700" text-anchor="middle" fill="rgba(255,255,255,0.1)">${initials}</text>
  </g>`,
    civic: `
  <g opacity="0.92">
    <path d="M-120 706C150 596 312 604 520 680C760 768 968 720 1162 594C1264 528 1344 508 1520 536V900H-120V706Z" fill="#030712" opacity="0.48" />
    <circle cx="1090" cy="332" r="236" fill="${accentColor}" opacity="0.16" />
    <circle cx="1090" cy="332" r="156" stroke="rgba(255,255,255,0.18)" stroke-width="3" />
    <circle cx="1090" cy="332" r="88" stroke="${accentColor}" stroke-width="5" opacity="0.42" />
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 12;
      const x = 1090 + Math.cos(a) * 222;
      const y = 332 + Math.sin(a) * 222;
      return `<path d="M1090 332L${x.toFixed(1)} ${y.toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="2" /><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="18" fill="${i % 2 ? accentColor : "#ffffff"}" opacity="${i % 2 ? "0.4" : "0.16"}" />`;
    }).join("")}
    <path d="M118 176C250 118 384 118 516 176" stroke="${accentColor}" stroke-width="38" stroke-linecap="round" opacity="0.22" />
    <path d="M118 234C302 158 486 158 670 234" stroke="url(#shine)" stroke-width="18" stroke-linecap="round" opacity="0.62" />
    <rect x="116" y="654" width="370" height="8" rx="4" fill="${accentColor}" opacity="0.72" />
  </g>`,
    chamber: `
  <g opacity="0.92">
    <path d="M0 760C248 638 492 650 760 720C978 776 1166 724 1400 596V900H0V760Z" fill="#030712" opacity="0.5" />
    ${Array.from({ length: 9 }, (_, i) => {
      const x = 742 + i * 64;
      const h = 190 + ((seed + i * 43) % 310);
      return `<rect x="${x}" y="${690 - h}" width="42" height="${h}" rx="6" fill="${i % 2 ? accentColor : "#ffffff"}" opacity="${i % 2 ? "0.24" : "0.11"}" />`;
    }).join("")}
    <path d="M116 206H594" stroke="rgba(255,255,255,0.2)" stroke-width="10" stroke-linecap="round" />
    <path d="M116 250H438" stroke="${accentColor}" stroke-width="10" stroke-linecap="round" opacity="0.75" />
    <path d="M146 612C274 510 384 492 506 558C630 626 772 592 896 458C1006 338 1138 296 1298 338" stroke="${accentColor}" stroke-width="18" stroke-linecap="round" opacity="0.46" fill="none" />
    <path d="M146 612C274 510 384 492 506 558C630 626 772 592 896 458C1006 338 1138 296 1298 338" stroke="url(#shine)" stroke-width="7" stroke-linecap="round" opacity="0.62" fill="none" />
  </g>`,
    nonprofit: `
  <g opacity="0.92">
    <path d="M-80 700C118 608 306 594 514 658C742 728 954 786 1480 594V900H-80V700Z" fill="#030712" opacity="0.48" />
    <path d="M1010 232C1118 88 1302 144 1302 314C1302 498 1122 572 1010 684C898 572 718 498 718 314C718 144 902 88 1010 232Z" fill="${accentColor}" opacity="0.16" />
    <path d="M1010 300C1082 204 1206 242 1206 356C1206 480 1084 532 1010 606C936 532 814 480 814 356C814 242 938 204 1010 300Z" stroke="rgba(255,255,255,0.2)" stroke-width="4" fill="none" />
    <circle cx="220" cy="250" r="92" fill="#ffffff" opacity="0.08" />
    <circle cx="330" cy="310" r="74" fill="${accentColor}" opacity="0.2" />
    <circle cx="440" cy="240" r="64" fill="#ffffff" opacity="0.07" />
    <path d="M132 574C228 502 326 480 426 510C534 542 626 522 720 448" stroke="${accentColor}" stroke-width="16" stroke-linecap="round" opacity="0.48" />
    <path d="M132 614C236 548 342 530 454 558C570 588 674 560 778 482" stroke="url(#shine)" stroke-width="8" stroke-linecap="round" opacity="0.64" />
  </g>`,
    community: `
  <g opacity="0.92">
    <path d="M-100 716C126 594 340 602 578 680C830 762 1034 718 1500 572V900H-100V716Z" fill="#030712" opacity="0.5" />
    <path d="M92 612L238 486L384 612V776H92V612Z" fill="#ffffff" opacity="0.08" />
    <path d="M294 612L458 450L622 612V776H294V612Z" fill="${accentColor}" opacity="0.18" />
    <path d="M536 612L704 478L872 612V776H536V612Z" fill="#ffffff" opacity="0.07" />
    <circle cx="1036" cy="292" r="220" fill="${accentColor}" opacity="0.14" />
    ${Array.from({ length: 10 }, (_, i) => {
      const x = 884 + ((seed + i * 83) % 346);
      const y = 154 + ((seed + i * 47) % 260);
      return `<circle cx="${x}" cy="${y}" r="${16 + (i % 4) * 6}" fill="${i % 2 ? accentColor : "#ffffff"}" opacity="${i % 2 ? "0.34" : "0.13"}" />`;
    }).join("")}
    <path d="M112 202H500" stroke="rgba(255,255,255,0.22)" stroke-width="10" stroke-linecap="round" />
    <path d="M112 242H346" stroke="${accentColor}" stroke-width="10" stroke-linecap="round" opacity="0.72" />
  </g>`,
  }[motif];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primaryColor}" />
      <stop offset="48%" stop-color="#182238" />
      <stop offset="100%" stop-color="#07111f" />
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.36" />
      <stop offset="48%" stop-color="#000000" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.28" />
    </linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    </pattern>
  </defs>
  <rect width="1400" height="900" fill="url(#bg)" />
  <rect width="1400" height="900" fill="url(#grid)" opacity="0.55" />
  <g transform="rotate(${angle / 10} 700 450)">
    ${motifSvg}
  </g>
  <rect width="1400" height="900" fill="url(#fade)" />
  <text x="${1120 + offset * 0.2}" y="780" font-family="Arial, sans-serif" font-size="${170 + (seed % 42)}" font-weight="800" text-anchor="middle" fill="rgba(255,255,255,0.07)">${initials}</text>
</svg>`;
}

async function getCurrentOrgForUser(userId: string) {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId))
    .orderBy(desc(isNotNull(organizationsTable.tier)), asc(organizationsTable.createdAt))
    .limit(1);
  return org ?? null;
}

async function saveHeroImageUrl(
  orgSlug: string,
  imageUrl: string | null,
  heroVisualType: HeroVisualType,
): Promise<void> {
  const heroLayout = layoutForHeroVisualType(heroVisualType);
  const featuresPatch = heroFeaturePatch(heroVisualType);
  const orgResult = await db.execute(sql`
    SELECT name
    FROM organizations
    WHERE slug = ${orgSlug}
    LIMIT 1
  `);
  const orgName =
    (orgResult.rows[0] as { name?: string | null } | undefined)?.name ?? null;

  if (!orgName) {
    throw new Error(`Organization not found for slug: ${orgSlug}`);
  }

  await db.execute(sql`
    INSERT INTO cs_org_configs (org_id, org_name, hero_image_url, features)
    VALUES (
      ${orgSlug},
      ${orgName},
      ${imageUrl},
      ${JSON.stringify(featuresPatch)}::jsonb
    )
    ON CONFLICT (org_id) DO UPDATE SET
      org_name = EXCLUDED.org_name,
      hero_image_url = EXCLUDED.hero_image_url,
      features = COALESCE(cs_org_configs.features, '{}'::jsonb) || ${JSON.stringify(featuresPatch)}::jsonb
  `);

  await db.execute(sql`
    UPDATE organizations
    SET site_config = COALESCE(site_config, '{}'::jsonb) || jsonb_build_object(
      'heroImageUrl', ${JSON.stringify(imageUrl)}::jsonb,
      'heroLayout', ${JSON.stringify(heroLayout)}::jsonb,
      'heroVisualType', ${JSON.stringify(heroVisualType)}::jsonb,
      'features', COALESCE(site_config->'features', '{}'::jsonb) || ${JSON.stringify(featuresPatch)}::jsonb
    )
    WHERE slug = ${orgSlug}
  `);

  try {
    await syncOrgConfigPatchToPillar({
      orgId: orgSlug,
      heroImageUrl: imageUrl,
      features: featuresPatch,
    });
  } catch (error) {
    console.warn("Hero visual saved locally; community sync skipped", {
      reason: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const router: IRouter = Router();

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

// generateCleanOrgSlug now lives in ../lib/slugUtils so unit tests can
// import it without pulling in this whole route file.
import { generateCleanOrgSlug } from "../lib/slugUtils";

function isAdminUser(req: Request): boolean {
  if (!req.isAuthenticated()) return false;
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const adminIds = new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return (
    adminEmails.has((req.user.email ?? "").toLowerCase()) ||
    adminIds.has(req.user.id)
  );
}

// GET /api/organizations
router.get("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const devOrgId = req.headers["x-dev-org-id"] as string | undefined;
  if (devOrgId && isAdminUser(req)) {
    const [overrideOrg] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, devOrgId))
      .limit(1);
    if (overrideOrg) {
      const overrideExtra = await db.execute(
        sql`SELECT community_site_url FROM organizations WHERE id = ${overrideOrg.id} LIMIT 1`
      );
      const overrideCommunitySiteUrl = (overrideExtra.rows[0] as { community_site_url?: string | null } | undefined)?.community_site_url ?? null;
      res.json({
        organization: {
          ...overrideOrg,
          createdAt: overrideOrg.createdAt.toISOString(),
          communitySiteUrl: overrideCommunitySiteUrl,
        },
      });
      return;
    }
  }

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id))
    .orderBy(
      desc(isNotNull(organizationsTable.tier)),
      asc(organizationsTable.createdAt),
    )
    .limit(1);

  if (!org) {
    res.json({ organization: null });
    return;
  }

  const extraResult = await db.execute(
    sql`SELECT community_site_url FROM organizations WHERE id = ${org.id} LIMIT 1`
  );
  const communitySiteUrl = (extraResult.rows[0] as { community_site_url?: string | null } | undefined)?.community_site_url ?? null;

  res.json({
    organization: {
      ...org,
      createdAt: org.createdAt.toISOString(),
      communitySiteUrl,
    },
  });
});

// GET /api/organizations/check-slug — check if a slug is available
router.get("/organizations/check-slug", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const slug = (req.query.slug as string ?? "").toLowerCase().trim();
  if (!slug) {
    res.status(400).json({ error: "slug is required" });
    return;
  }

  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
  if (!SLUG_RE.test(slug)) {
    res.json({ available: false, reason: "invalid_format" });
    return;
  }

  const RESERVED = new Set(["api", "www", "admin", "pillar", "app", "mail", "smtp", "ftp", "cdn", "static", "assets", "dashboard", "login", "register", "onboard", "sites"]);
  if (RESERVED.has(slug)) {
    res.json({ available: false, reason: "reserved" });
    return;
  }

  const [taken] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug))
    .limit(1);

  res.json({ available: !taken });
});

// POST /api/organizations
router.post("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, type, category, slug: requestedSlug } = req.body as {
    name?: string;
    type?: string;
    category?: string;
    slug?: string;
  };
  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }

  const userId = req.user.id;
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId))
    .orderBy(
      desc(isNotNull(organizationsTable.tier)),
      asc(organizationsTable.createdAt),
    )
    .limit(1);

  let org;
  if (existing) {
    [org] = await db
      .update(organizationsTable)
      .set({ name, type, category: category ?? null })
      .where(eq(organizationsTable.userId, userId))
      .returning();
  } else {
    let slug: string;

    if (requestedSlug) {
      const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
      if (!SLUG_RE.test(requestedSlug)) {
        res.status(400).json({ error: "Invalid slug format" });
        return;
      }
      const [taken] = await db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(eq(organizationsTable.slug, requestedSlug))
        .limit(1);
      if (taken) {
        res.status(409).json({ error: "That URL is already taken. Please choose a different one." });
        return;
      }
      slug = requestedSlug;
    } else {
      slug = await generateCleanOrgSlug(name);
    }

    [org] = await db
      .insert(organizationsTable)
      .values({
        id: crypto.randomUUID(),
        userId,
        name,
        type,
        category: category ?? null,
        slug,
      })
      .returning();
  }

  res.json({
    organization: { ...org, createdAt: org.createdAt.toISOString() },
  });
});

// PUT /api/organizations — update name, type, slug, and branding fields
router.put("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    name,
    type,
    slug,
    primaryColor,
    accentColor,
    tagline,
    mission,
    logoUrl,
    contactEmail,
    contactPhone,
    contactAddress,
    meetingDay,
    meetingTime,
    meetingLocation,
  } = req.body as Record<string, string | undefined>;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const userId = req.user.id;
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (!existing) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  // Validate slug if provided and changed
  if (slug && slug !== existing.slug) {
    if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(slug)) {
      res
        .status(400)
        .json({
          error:
            "URL must be 3-50 characters, lowercase letters, numbers, and hyphens only",
        });
      return;
    }
    const [taken] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(
        and(
          eq(organizationsTable.slug, slug),
          sql`${organizationsTable.id} != ${existing.id}`,
        ),
      )
      .limit(1);
    if (taken) {
      res
        .status(409)
        .json({ error: "That URL is already taken. Please choose another." });
      return;
    }
  }

  const updates: Record<string, unknown> = { name };
  if (type) updates.type = type;
  if (slug && slug !== existing.slug) updates.slug = slug;

  const [org] = await db
    .update(organizationsTable)
    .set(updates)
    .where(eq(organizationsTable.userId, userId))
    .returning();

  // If slug changed, update community_site_url and all cs_* references
  const slugChanged = !!(slug && slug !== existing.slug);
  if (slugChanged) {
    const newUrl = `https://${slug}.mypillar.co`;
    await db.execute(
      sql`UPDATE organizations SET community_site_url = ${newUrl} WHERE id = ${existing.id}`,
    );
    await db.execute(
      sql`UPDATE cs_org_configs SET org_id = ${slug} WHERE org_id = ${existing.slug}`,
    );
    await db.execute(
      sql`UPDATE cs_events SET org_id = ${slug} WHERE org_id = ${existing.slug}`,
    );
    await db.execute(
      sql`UPDATE cs_admin_users SET org_id = ${slug} WHERE org_id = ${existing.slug}`,
    );
    await db.execute(
      sql`UPDATE sites SET org_slug = ${slug} WHERE org_slug = ${existing.slug}`,
    );
  }

  // Sync branding/profile to live community tenant when provisioned.
  const effectiveSlug = slugChanged ? slug! : org.slug;
  if (effectiveSlug) {
    const configResult = await db.execute(sql`
      SELECT org_id
      FROM cs_org_configs
      WHERE org_id = ${effectiveSlug}
      LIMIT 1
    `);
    if (configResult.rows.length > 0) {
      const patch: Record<string, string | undefined> = {
        orgName: name,
        shortName: getOrgInitials(name),
      };
      if (type) patch.orgType = type;
      if (primaryColor) patch.primaryColor = primaryColor;
      if (accentColor) patch.accentColor = accentColor;
      if (tagline) patch.tagline = tagline;
      if (mission) patch.mission = mission;
      if (logoUrl) patch.logoUrl = logoUrl;
      if (contactEmail) patch.contactEmail = contactEmail;
      if (contactPhone) patch.contactPhone = contactPhone;
      if (contactAddress) patch.contactAddress = contactAddress;
      if (meetingDay) patch.meetingDay = meetingDay;
      if (meetingTime) patch.meetingTime = meetingTime;
      if (meetingLocation) patch.meetingLocation = meetingLocation;
      try {
        await syncOrgConfigPatchToPillar({ orgId: effectiveSlug, ...patch });
      } catch (syncErr: any) {
        console.error("[organizations] sync failed", syncErr);
        return res
          .status(502)
          .json({
            error: "Settings saved but failed to sync to live site",
            localOnly: true,
          });
      }
    }
  }

  res.json({
    organization: { ...org, createdAt: org.createdAt.toISOString() },
  });
});

// DELETE /api/organizations
router.delete("/organizations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user.id;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const orgId = org.id;
  const linkIds = await db
    .select({ id: boardApprovalLinksTable.id })
    .from(boardApprovalLinksTable)
    .where(eq(boardApprovalLinksTable.orgId, orgId));

  await db.transaction(async (tx) => {
    for (const { id: lid } of linkIds) {
      await tx
        .delete(boardApprovalVotesTable)
        .where(eq(boardApprovalVotesTable.linkId, lid));
    }
    await tx
      .delete(boardApprovalLinksTable)
      .where(eq(boardApprovalLinksTable.orgId, orgId));
    await tx.delete(ticketSalesTable).where(eq(ticketSalesTable.orgId, orgId));
    await tx.delete(ticketTypesTable).where(eq(ticketTypesTable.orgId, orgId));
    await tx
      .delete(eventVendorsTable)
      .where(eq(eventVendorsTable.orgId, orgId));
    await tx
      .delete(eventSponsorsTable)
      .where(eq(eventSponsorsTable.orgId, orgId));
    await tx
      .delete(eventApprovalsTable)
      .where(eq(eventApprovalsTable.orgId, orgId));
    await tx
      .delete(eventCommunicationsTable)
      .where(eq(eventCommunicationsTable.orgId, orgId));
    await tx.delete(paymentsTable).where(eq(paymentsTable.orgId, orgId));
    await tx
      .delete(recurringEventTemplatesTable)
      .where(eq(recurringEventTemplatesTable.orgId, orgId));
    await tx.delete(eventsTable).where(eq(eventsTable.orgId, orgId));
    await tx.delete(socialPostsTable).where(eq(socialPostsTable.orgId, orgId));
    await tx
      .delete(automationRulesTable)
      .where(eq(automationRulesTable.orgId, orgId));
    await tx
      .delete(contentStrategyTable)
      .where(eq(contentStrategyTable.orgId, orgId));
    await tx.delete(oauthStatesTable).where(eq(oauthStatesTable.orgId, orgId));
    await tx
      .delete(socialAccountsTable)
      .where(eq(socialAccountsTable.orgId, orgId));
    await tx
      .delete(siteNavItemsTable)
      .where(eq(siteNavItemsTable.orgId, orgId));
    await tx.delete(siteBlocksTable).where(eq(siteBlocksTable.orgId, orgId));
    await tx.delete(sitePagesTable).where(eq(sitePagesTable.orgId, orgId));
    await tx.delete(sitesTable).where(eq(sitesTable.orgId, orgId));
    await tx
      .delete(siteUpdateSchedulesTable)
      .where(eq(siteUpdateSchedulesTable.orgId, orgId));
    await tx
      .delete(websiteSpecsTable)
      .where(eq(websiteSpecsTable.orgId, orgId));
    await tx
      .delete(studioOutputsTable)
      .where(eq(studioOutputsTable.orgId, orgId));
    await tx
      .delete(notificationsTable)
      .where(eq(notificationsTable.orgId, orgId));
    await tx.delete(contactsTable).where(eq(contactsTable.orgId, orgId));
    await tx.delete(vendorsTable).where(eq(vendorsTable.orgId, orgId));
    await tx.delete(sponsorsTable).where(eq(sponsorsTable.orgId, orgId));
    await tx.delete(domainsTable).where(eq(domainsTable.orgId, orgId));
    await tx
      .delete(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    await tx
      .delete(organizationsTable)
      .where(eq(organizationsTable.userId, userId));
  });

  res.json({ success: true });
});

// ── Hero image routes ─────────────────────────────────────────────────────────

// Curated civic/community Unsplash photo IDs — pre-approved, accessible without an API key
const HERO_PHOTO_LIBRARY = [
  { id: "1522202176988-66273c2fd55f", description: "People gathered around a community meeting table" },
  { id: "1517048676732-d65bc937f952", description: "Diverse team collaborating and smiling" },
  { id: "1454165804606-c3d57bc86b40", description: "Professional group discussion at a bright table" },
  { id: "1557804506-669a67965ba0", description: "Engaged professionals in a bright office meeting" },
  { id: "1491438590914-bc09fcaaf77a", description: "Energetic crowd at an outdoor community event" },
  { id: "1497366216548-37526070297c", description: "Networking event with engaged professionals" },
  { id: "1509099836639-18ba1795216d", description: "Community gathering — people connecting outdoors" },
  { id: "1543269865-cbf427effbad", description: "People volunteering together in the community" },
  { id: "1521791136064-7986c2920216", description: "Civic leaders addressing a community audience" },
  { id: "1573496359142-b8d87734a5a2", description: "Collaborative team session with whiteboards" },
  { id: "1552664730-d307ca884978", description: "Diverse group united around a common purpose" },
  { id: "1523240795612-9a054b0db644", description: "Vibrant town square with community life" },
];

// GET /api/organizations/hero-image/suggest
// Uses AI to rank the curated photo library for this org, then returns options.
// No Unsplash API key required.
router.get("/organizations/hero-image/suggest", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    const openai = createOpenAIClient();

    // Library photos are hardcoded, curated Unsplash CDN URLs — no runtime
    // verification needed. Outbound HEAD checks were unreliable in this
    // environment and caused the route to return zero photos.
    const livePhotos = HERO_PHOTO_LIBRARY;

    // Step 2: AI ranks only the live photos — guarantees top-6 are all reachable
    const libraryJson = livePhotos.map((p, i) => `${i}: ${p.description}`).join("\n");
    const prompt = `You are picking hero background photos for a community website. The organization is "${org.name}" (type: ${org.type || "civic"})${org.category ? `, tagline: "${org.category}"` : ""}.\n\nAvailable photos (by index):\n${libraryJson}\n\nReturn exactly ${Math.min(6, livePhotos.length)} indices (0–${livePhotos.length - 1}), comma-separated, ordered best-to-worst fit. Return ONLY numbers, e.g.: 2,0,5,3,7,1`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const aiIndices: number[] = raw
      .split(",")
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n < livePhotos.length);

    // Deduplicate AI picks and pad with remaining live photos
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const idx of aiIndices) { if (!seen.has(idx)) { seen.add(idx); ordered.push(idx); } }
    for (let i = 0; i < livePhotos.length && ordered.length < 6; i++) {
      if (!seen.has(i)) { seen.add(i); ordered.push(i); }
    }

    const photos = ordered.slice(0, 6).map(idx => {
      const p = livePhotos[idx];
      return {
        id: p.id,
        thumb: `https://images.unsplash.com/photo-${p.id}?auto=format&fit=crop&w=400&q=70`,
        full:  `https://images.unsplash.com/photo-${p.id}?auto=format&fit=crop&w=1920&q=80`,
        description: p.description,
        credit: "Unsplash",
      };
    });

    res.json({ query: `${org.type || "community"} background`, photos });
  } catch (err) {
    console.error("Hero image suggest error:", err);
    res.status(500).json({ error: AI_UNAVAILABLE_MESSAGE });
  }
});

// POST /api/organizations/hero-image/upload
// Accepts a raw image body (Content-Type: image/*) and saves it to object storage.
router.post("/organizations/hero-image/upload", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) {
    res.status(400).json({ error: "Image content-type required" });
    return;
  }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
    const imageBuffer = Buffer.concat(chunks);
    if (imageBuffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    let heroImageUrl: string;
    try {
      const privateDir = objectStorageService.getPrivateObjectDir().replace(/\/$/, "");
      const objectId = randomUUID();
      const objectPath = `${privateDir}/uploads/${objectId}.${ext}`;
      const parts = objectPath.startsWith("/") ? objectPath.slice(1).split("/") : objectPath.split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      const bucket = objectStorageClient.bucket(bucketName);
      await bucket.file(objectName).save(imageBuffer, { contentType, resumable: false });
      heroImageUrl = `/api/storage/objects/uploads/${objectId}.${ext}`;
    } catch (storageError) {
      console.warn("Hero image upload falling back to data URL");
      heroImageUrl = bufferToDataUrl(imageBuffer, contentType);
    }

    await saveHeroImageUrl(org.slug, heroImageUrl, "feature_photo");

    res.json({ heroImageUrl, heroVisualType: "feature_photo" });
  } catch (err) {
    console.error("Hero image upload error:", err);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// POST /api/organizations/hero-image/apply-unsplash
// Downloads chosen photo into object storage and saves the URL to cs_org_configs.
// Accepts: { photoUrl, credit } — photoUrl is the full-resolution image URL.
router.post("/organizations/hero-image/apply-unsplash", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Accept both old (previewUrl) and new (photoUrl) key names for compatibility
  const { photoUrl, previewUrl } = req.body as { photoUrl?: string; previewUrl?: string; credit?: string };
  const imageSourceUrl = photoUrl ?? previewUrl;
  if (!imageSourceUrl) { res.status(400).json({ error: "photoUrl is required" }); return; }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    // Download the image with a browser-like User-Agent (some CDNs require it)
    const imageRes = await fetch(imageSourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Pillar/1.0)" },
      signal: AbortSignal.timeout(15000),
    });

    if (!imageRes.ok) {
      // If download fails, persist the external URL directly as a fallback
      console.warn(`Hero image download returned ${imageRes.status} — saving URL directly`);
      await saveHeroImageUrl(org.slug, imageSourceUrl, "banner_background");
      res.json({ heroImageUrl: imageSourceUrl, heroVisualType: "banner_background" });
      return;
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";

    // Upload to object storage
    const privateDir = objectStorageService.getPrivateObjectDir().replace(/\/$/, "");
    const objectId = randomUUID();
    const objectPath = `${privateDir}/uploads/${objectId}.${ext}`;
    const parts = objectPath.startsWith("/") ? objectPath.slice(1).split("/") : objectPath.split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).save(imageBuffer, { contentType, resumable: false });

    const heroImageUrl = `/api/storage/objects/uploads/${objectId}.${ext}`;
    await saveHeroImageUrl(org.slug, heroImageUrl, "banner_background");

    res.json({ heroImageUrl, heroVisualType: "banner_background" });
  } catch (err) {
    console.error("Hero image apply error:", err);
    // Last-resort fallback: save the URL directly so the user isn't blocked
    try {
      await saveHeroImageUrl(org.slug, imageSourceUrl, "banner_background");
      res.json({ heroImageUrl: imageSourceUrl, heroVisualType: "banner_background" });
    } catch {
      res.status(500).json({ error: "Failed to save hero image" });
    }
  }
});

// POST /api/organizations/hero-image/brand
// Creates a generated banner asset and saves it as a background hero visual.
router.post("/organizations/hero-image/brand", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    const branding = await getOrgBrandingSnapshot(org.slug);
    const svg = buildBrandedBannerSvg({
      orgName: org.name,
      orgType: org.type,
      category: org.category,
      tagline: branding.tagline,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
    });
    const heroImageUrl = svgToBase64DataUrl(svg);
    await saveHeroImageUrl(org.slug, heroImageUrl, "banner_background");
    res.json({ heroImageUrl, heroVisualType: "banner_background" });
  } catch (err) {
    console.error("Hero image branding error:", err);
    res.status(500).json({ error: "Failed to create branded banner" });
  }
});

// POST /api/organizations/hero-image
// Saves (or clears) the hero image URL. Accepts { heroImageUrl } — null to remove.
router.post("/organizations/hero-image", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Accept both heroImageUrl (frontend) and imageUrl (legacy) keys
  const body = req.body as {
    heroImageUrl?: string | null;
    imageUrl?: string | null;
    heroVisualType?: HeroVisualType;
  };
  const heroImageUrl = "heroImageUrl" in body ? body.heroImageUrl : body.imageUrl;
  const heroVisualType = heroImageUrl
    ? normalizeHeroVisualType(body.heroVisualType, "banner_background")
    : "none";

  const org = await getCurrentOrgForUser(req.user.id);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }

  try {
    await saveHeroImageUrl(org.slug, heroImageUrl ?? null, heroVisualType);
    res.json({
      heroImageUrl: heroImageUrl ?? null,
      heroVisualType,
    });
  } catch (err) {
    console.error("Hero image save error:", err);
    res.status(500).json({ error: "Failed to save hero image" });
  }
});

export default router;
