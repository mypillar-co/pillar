import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";
import { logger } from "../lib/logger";
import { syncOrgConfigPatchToPillar } from "../lib/pillarOrgSync";
import {
  SECTION_REGISTRY,
  validateSection,
  getPortalSectionRegistryPrompt,
} from "../lib/sectionRegistry";
import {
  buildStarterPortalConfig,
  type MembersPortalConfig,
  type PortalSection,
} from "../lib/membersPortalDefaults";

const router = Router();

interface OrgRow {
  id: string;
  slug: string | null;
  name: string | null;
  type: string | null;
  site_config: Record<string, unknown> | null;
}

async function loadOrgRow(orgId: string): Promise<OrgRow | null> {
  const r = await db.execute(sql`
    SELECT id, slug, name, type, site_config
    FROM organizations
    WHERE id = ${orgId}
    LIMIT 1
  `);
  return (r.rows[0] as OrgRow | undefined) ?? null;
}

function getCurrentPortal(org: OrgRow): MembersPortalConfig {
  const sc = (org.site_config ?? {}) as Record<string, unknown>;
  const portal = sc.membersPortal as MembersPortalConfig | undefined;
  if (portal && Array.isArray(portal.sections)) return portal;
  return { sections: [] };
}

async function persistPortal(
  org: OrgRow,
  portal: MembersPortalConfig,
): Promise<void> {
  const json = JSON.stringify(portal);
  await db.execute(sql`
    UPDATE organizations
    SET site_config = jsonb_set(
      COALESCE(site_config, '{}'::jsonb),
      '{membersPortal}',
      ${json}::jsonb,
      true
    )
    WHERE id = ${org.id}
  `);

  // Mirror into cs_org_configs.features.membersPortal so CP read-side stays in sync.
  const cpOrgId = org.slug ?? org.id;
  try {
    const featuresRow = await db.execute(sql`
      SELECT features FROM cs_org_configs WHERE org_id = ${cpOrgId} LIMIT 1
    `);
    const currentFeatures = (featuresRow.rows[0]?.features ?? {}) as Record<string, unknown>;
    await syncOrgConfigPatchToPillar({
      orgId: cpOrgId,
      ...(({
        features: { ...currentFeatures, membersPortal: portal },
      } as unknown) as Record<string, never>),
    });
  } catch (cpErr) {
    logger.warn(
      { err: cpErr, orgId: org.id, cpOrgId },
      "[members-portal] could not mirror updated portal to CP",
    );
  }
}

// GET /api/members-portal — current portal config (auto-provisions on first read)
router.get("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const row = await loadOrgRow(org.id);
  if (!row) return res.status(404).json({ error: "Org not found" });
  let portal = getCurrentPortal(row);
  if (portal.sections.length === 0) {
    // Build a default starter so the dashboard tab has something to show
    // even before the first member is added. Don't persist until the admin
    // makes their first edit (or until ensureMembersPortalProvisioned fires).
    portal = buildStarterPortalConfig(row.type, row.name ?? "your organization");
  }
  res.json({
    sections: portal.sections,
    provisionedAt: portal.provisionedAt ?? null,
    available: Object.values(SECTION_REGISTRY)
      .filter((s) => s.surfaces.portal)
      .map((s) => ({ type: s.type, label: s.label, description: s.description, example: s.example })),
  });
});

// PATCH /api/members-portal — replace sections array
router.patch("/", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const { sections } = (req.body ?? {}) as { sections?: unknown };
  if (!Array.isArray(sections)) {
    return res.status(400).json({ error: "sections must be an array" });
  }
  const cleaned: PortalSection[] = [];
  for (const s of sections) {
    if (!s || typeof s !== "object") continue;
    const section = s as Record<string, unknown>;
    if (!validateSection(section, "portal")) {
      return res.status(400).json({ error: `Invalid portal section type: ${String(section.type)}` });
    }
    cleaned.push(section as PortalSection);
  }
  const row = await loadOrgRow(org.id);
  if (!row) return res.status(404).json({ error: "Org not found" });
  const existing = getCurrentPortal(row);
  const portal: MembersPortalConfig = {
    sections: cleaned,
    provisionedAt: existing.provisionedAt ?? new Date().toISOString(),
  };
  await persistPortal(row, portal);
  logger.info({ orgId: row.id, sectionCount: cleaned.length }, "[members-portal] sections updated");
  res.json({ sections: portal.sections, provisionedAt: portal.provisionedAt });
});

// POST /api/members-portal/ai-suggest — ask Claude for additional sections
router.post("/ai-suggest", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "AI suggestions unavailable (ANTHROPIC_API_KEY not set)" });
  }
  const row = await loadOrgRow(org.id);
  if (!row) return res.status(404).json({ error: "Org not found" });
  const current = getCurrentPortal(row);
  const currentTypes = new Set(current.sections.map((s) => s.type));

  const client = new Anthropic({ apiKey });
  const registryPrompt = getPortalSectionRegistryPrompt();

  const userPrompt = `Organization: ${row.name ?? "Unknown"} (type: ${row.type ?? "unknown"}).
The members portal currently has these section types: ${
    [...currentTypes].join(", ") || "(none)"
  }.

Suggest 1-3 additional portal sections that would be useful for this organization
that aren't already in the portal. For each suggestion, return a complete section
object that follows the example shape exactly. Use realistic placeholder content
appropriate for this org's vertical.

Return ONLY a JSON object of the form:
{ "sections": [ { "type": "...", "title": "...", ...payload } ] }
No commentary, no markdown fences.`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1500,
      system: registryPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = message.content.find((c) => c.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < jsonStart) {
      return res.status(502).json({ error: "AI did not return valid JSON" });
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as { sections?: unknown };
    const suggestions: PortalSection[] = [];
    if (Array.isArray(parsed.sections)) {
      for (const s of parsed.sections) {
        if (!s || typeof s !== "object") continue;
        const section = s as Record<string, unknown>;
        if (!validateSection(section, "portal")) continue;
        if (currentTypes.has(String(section.type))) continue; // skip dupes
        suggestions.push(section as PortalSection);
      }
    }
    res.json({ suggestions });
  } catch (err: any) {
    logger.warn({ err, orgId: row.id }, "[members-portal] AI suggest failed");
    res.status(502).json({ error: err?.message ?? "AI suggestion failed" });
  }
});

export default router;
