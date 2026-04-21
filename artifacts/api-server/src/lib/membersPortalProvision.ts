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

/**
 * Returns true if `siteConfig.membersPortal.sections` is a non-empty array,
 * meaning the portal has already been provisioned for this org.
 */
function portalAlreadyProvisioned(
  siteConfig: Record<string, unknown> | null | undefined,
): boolean {
  if (!siteConfig || typeof siteConfig !== "object") return false;
  const portal = siteConfig.membersPortal as
    | { sections?: unknown }
    | null
    | undefined;
  if (!portal || typeof portal !== "object") return false;
  return Array.isArray(portal.sections) && portal.sections.length > 0;
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

/**
 * Provision the members portal for an org if it doesn't have one yet.
 *
 * Best-effort and idempotent:
 *   - If the portal config already exists with at least one section, returns
 *     immediately without writing anything.
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

    if (portalAlreadyProvisioned(org.site_config)) {
      return { ok: true, alreadyProvisioned: true };
    }

    const orgName = org.name ?? "your organization";
    const starter: MembersPortalConfig = buildStarterPortalConfig(org.type, orgName);

    const aboutMission =
      (org.site_config as Record<string, unknown> | null | undefined)?.about_mission as
        | string
        | null
        | undefined;
    starter.sections = applyAboutMissionToWelcome(starter.sections, aboutMission);

    // Merge into existing site_config so we don't clobber other fields.
    // jsonb_set with create_missing=true builds the path if needed.
    const portalJson = JSON.stringify(starter);
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

    // Mirror to the community-platform side. Stored under features.membersPortal
    // to avoid a schema change on cs_org_configs — features is already JSONB
    // and ensureMembersFeatureEnabled patches it through the same path.
    const cpOrgId = org.slug ?? orgId;
    try {
      const featuresRow = await db.execute(sql`
        SELECT features FROM cs_org_configs WHERE org_id = ${cpOrgId} LIMIT 1
      `);
      const currentFeatures = (featuresRow.rows[0]?.features ?? {}) as Record<string, unknown>;

      await syncOrgConfigPatchToPillar({
        orgId: cpOrgId,
        // syncOrgConfigPatchToPillar's typed payload only declares known
        // fields; the underlying CP /api/internal/org-config patch handler
        // accepts any column on cs_org_configs and we're patching the
        // existing JSONB `features` column with a merged object.
        ...(({
          features: { ...currentFeatures, membersPortal: starter, members: true },
        } as unknown) as Record<string, never>),
      });
    } catch (cpErr) {
      // Site may not be provisioned on CP yet — that's OK. The portal config
      // is already in organizations.site_config and will be pushed the next
      // time the site is published. Surface the partial-failure to the caller
      // so route handlers can include it in their response/log line.
      cpMirrorError = cpErr instanceof Error ? cpErr.message : String(cpErr);
      logger.warn(
        { err: cpErr, orgId, cpOrgId },
        "[members-portal] could not mirror portal config to CP — site may not be provisioned yet",
      );
    }

    logger.info(
      { orgId, orgType: org.type, sectionCount: starter.sections.length, cpMirrorError },
      "[members-portal] provisioned starter portal sections",
    );
    return { ok: true, cpMirrorError };
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
