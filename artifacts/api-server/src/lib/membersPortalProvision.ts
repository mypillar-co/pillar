import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { syncOrgConfigPatchToPillar } from "./pillarOrgSync";
import {
  buildStarterPortalConfig,
  type MembersPortalConfig,
  type PortalSection,
} from "./membersPortalDefaults";

interface OrgRowForProvisioning {
  id: string;
  slug: string | null;
  name: string | null;
  type: string | null;
  site_config: Record<string, unknown> | null;
}

function getExistingPortal(
  siteConfig: Record<string, unknown> | null | undefined,
): MembersPortalConfig | null {
  if (!siteConfig || typeof siteConfig !== "object") return null;
  const portal = siteConfig.membersPortal as
    | MembersPortalConfig
    | null
    | undefined;
  if (!portal || typeof portal !== "object") return null;
  if (!Array.isArray(portal.sections) || portal.sections.length === 0) return null;
  return portal;
}

/**
 * Patch the welcome_message section's body with the org's about_mission so
 * the portal speaks in the org's already-established voice instead of a
 * generic blurb. No-op if about_mission isn't set or there's no
 * welcome_message section.
 */
function applyAboutMissionToWelcome(
  sections: PortalSection[],
  aboutMission: string | null | undefined,
): PortalSection[] {
  if (!aboutMission || !aboutMission.trim()) return sections;
  return sections.map((section) => {
    if (section.type !== "welcome_message") return section;
    return { ...section, body: aboutMission.trim() };
  });
}

async function persistPortalToOrg(orgId: string, portal: MembersPortalConfig): Promise<void> {
  const portalJson = JSON.stringify(portal);
  await db.execute(sql`
    UPDATE organizations
    SET site_config = jsonb_set(
      COALESCE(site_config, '{}'::jsonb) ||
      jsonb_build_object(
        'features',
        COALESCE(site_config -> 'features', '{}'::jsonb) || '{"members": true}'::jsonb
      ),
      '{membersPortal}',
      ${portalJson}::jsonb,
      true
    )
    WHERE id = ${orgId}
  `);
}

async function mirrorPortalToCommunityPlatform(
  org: OrgRowForProvisioning,
  portal: MembersPortalConfig,
): Promise<string | undefined> {
  const cpOrgId = org.slug ?? org.id;
  try {
    const featuresRow = await db.execute(sql`
      SELECT features FROM cs_org_configs WHERE org_id = ${cpOrgId} LIMIT 1
    `);
    const currentFeatures = (featuresRow.rows[0]?.features ?? {}) as Record<string, unknown>;

    await syncOrgConfigPatchToPillar({
      orgId: cpOrgId,
      // syncOrgConfigPatchToPillar's typed payload only declares known fields;
      // the underlying CP /api/internal/org-config patch handler accepts any
      // column on cs_org_configs and merges the existing JSONB `features`.
      ...(({
        features: { ...currentFeatures, members: true, membersPortal: portal },
      } as unknown) as Record<string, never>),
    });
    return undefined;
  } catch (cpErr) {
    const cpMirrorError = cpErr instanceof Error ? cpErr.message : String(cpErr);
    logger.warn(
      { err: cpErr, orgId: org.id, cpOrgId },
      "[members-portal] could not mirror portal config to CP — site may not be provisioned yet",
    );
    return cpMirrorError;
  }
}

/**
 * Provision the members portal for an org if it doesn't have one yet.
 *
 * Best-effort and idempotent:
 *   - If the portal config already exists with at least one section, mirrors it
 *     back to the public site and turns on the members nav flag.
 *   - If anything fails (DB error, CP sync 404 because the site hasn't been
 *     generated yet, etc.) we log a warning and return — never throw.
 *     Member creation must succeed regardless of portal provisioning.
 */
export interface ProvisionResult {
  ok: boolean;
  /** Set when the api-server-side write to organizations.site_config failed. */
  error?: string;
  /** Set when the CP-side mirror failed but the api-server-side write succeeded. */
  cpMirrorError?: string;
  /** True when the function short-circuited because the portal was already provisioned. */
  alreadyProvisioned?: boolean;
}

export async function ensureMembersPortalProvisioned(orgId: string): Promise<ProvisionResult> {
  let cpMirrorError: string | undefined;
  try {
    const result = await db.execute(sql`
      SELECT id, slug, name, type, site_config
      FROM organizations
      WHERE id = ${orgId}
      LIMIT 1
    `);
    const org = result.rows[0] as OrgRowForProvisioning | undefined;
    if (!org) {
      logger.warn({ orgId }, "[members-portal] org not found, skipping provision");
      return { ok: false, error: "org not found" };
    }

    const existingPortal = getExistingPortal(org.site_config);
    const alreadyProvisioned = Boolean(existingPortal);

    const orgName = org.name ?? "your organization";
    let portal: MembersPortalConfig;
    if (existingPortal) {
      portal = existingPortal;
    } else {
      portal = buildStarterPortalConfig(org.type, orgName);
      const aboutMission =
        (org.site_config as Record<string, unknown> | null | undefined)?.about_mission as
          | string
          | null
          | undefined;
      portal.sections = applyAboutMissionToWelcome(portal.sections, aboutMission);
    }

    // Merge into existing site_config so we don't clobber other fields, and keep
    // the source-of-truth org config aligned with the public-site feature flag.
    await persistPortalToOrg(orgId, portal);

    // Mirror to the community-platform side. Stored under features.membersPortal
    // to avoid a schema change on cs_org_configs — features is already JSONB.
    cpMirrorError = await mirrorPortalToCommunityPlatform(org, portal);

    logger.info(
      { orgId, orgType: org.type, sectionCount: portal.sections.length, alreadyProvisioned, cpMirrorError },
      alreadyProvisioned
        ? "[members-portal] mirrored existing portal sections"
        : "[members-portal] provisioned starter portal sections",
    );
    return { ok: true, cpMirrorError, alreadyProvisioned };
  } catch (err) {
    logger.warn(
      { err, orgId },
      "[members-portal] portal provisioning failed (non-fatal)",
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      cpMirrorError,
    };
  }
}
