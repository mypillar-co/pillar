import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const CANONICAL_SITE_CONFIG_KEYS = [
  "primaryColor",
  "accentColor",
  "tagline",
  "mission",
  "contactEmail",
  "contactPhone",
  "contactAddress",
  "meetingDay",
  "meetingTime",
  "meetingLocation",
  "ctaLabel",
  "ctaHref",
  "socialFacebook",
  "socialInstagram",
  "footerText",
] as const;

export type CanonicalSiteConfigKey = (typeof CANONICAL_SITE_CONFIG_KEYS)[number];
export const CANONICAL_SITE_CONFIG_KEY_SET: ReadonlySet<string> = new Set(CANONICAL_SITE_CONFIG_KEYS);

export const TOGGLEABLE_SITE_FEATURES = [
  "blog",
  "newsletter",
  "businessDirectory",
  "sponsors",
  "vendors",
  "ticketedEvents",
] as const;

type SiteConfigPatch = Record<string, unknown> & {
  features?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export async function readSiteConfig(orgId: string): Promise<Record<string, unknown>> {
  const result = await db.execute(sql`
    SELECT site_config
    FROM organizations
    WHERE id = ${orgId}
    LIMIT 1
  `);
  const row = result.rows[0] as { site_config?: unknown } | undefined;
  return jsonObject(row?.site_config);
}

export async function saveSiteConfigPatch(
  orgId: string,
  patch: SiteConfigPatch,
): Promise<{ config: Record<string, unknown>; publicOrgId: string }> {
  const orgResult = await db.execute(sql`
    SELECT id, name, slug, type, site_config
    FROM organizations
    WHERE id = ${orgId}
    LIMIT 1
  `);
  const org = orgResult.rows[0] as
    | { id: string; name: string; slug?: string | null; type?: string | null; site_config?: unknown }
    | undefined;

  if (!org) {
    throw new Error("Organization not found");
  }

  const publicOrgId = org.slug || org.id;
  const existingPublicResult = await db.execute(sql`
    SELECT *
    FROM cs_org_configs
    WHERE org_id = ${publicOrgId} OR org_id = ${org.id}
    LIMIT 1
  `);
  const publicRow = existingPublicResult.rows[0] as Record<string, unknown> | undefined;
  const publicConfig: Record<string, unknown> = publicRow
    ? {
        orgName: publicRow.org_name,
        shortName: publicRow.short_name,
        orgType: publicRow.org_type,
        tagline: publicRow.tagline,
        mission: publicRow.mission,
        location: publicRow.location,
        primaryColor: publicRow.primary_color,
        accentColor: publicRow.accent_color,
        logoUrl: publicRow.logo_url,
        heroImageUrl: publicRow.hero_image_url,
        contactEmail: publicRow.contact_email,
        contactPhone: publicRow.contact_phone,
        contactAddress: publicRow.contact_address,
        mailingAddress: publicRow.mailing_address,
        website: publicRow.website,
        socialFacebook: publicRow.social_facebook,
        socialInstagram: publicRow.social_instagram,
        socialTwitter: publicRow.social_twitter,
        socialLinkedin: publicRow.social_linkedin,
        meetingDay: publicRow.meeting_day,
        meetingTime: publicRow.meeting_time,
        meetingLocation: publicRow.meeting_location,
        footerText: publicRow.footer_text,
        metaDescription: publicRow.meta_description,
        stats: publicRow.stats,
        programs: publicRow.programs,
        partners: publicRow.partners,
        sponsorshipLevels: publicRow.sponsorship_levels,
        features: publicRow.features,
      }
    : {};

  const currentConfig = { ...publicConfig, ...jsonObject(org.site_config) };
  const currentFeatures = {
    ...jsonObject(publicConfig.features),
    ...jsonObject(currentConfig.features),
  };
  const patchFeatures = jsonObject(patch.features);
  const { features: _features, ...topLevelPatch } = patch;
  void _features;

  const nextFeatures =
    Object.keys(patchFeatures).length > 0
      ? { ...currentFeatures, ...patchFeatures }
      : currentFeatures;
  const nextConfig: Record<string, unknown> = {
    ...currentConfig,
    ...topLevelPatch,
    ...(Object.keys(nextFeatures).length > 0 ? { features: nextFeatures } : {}),
  };

  await db.execute(sql`
    UPDATE organizations
    SET site_config = ${JSON.stringify(nextConfig)}::jsonb
    WHERE id = ${org.id}
  `);

  const orgName = textValue(nextConfig.orgName) || org.name || "My Organization";
  const shortName = textValue(nextConfig.shortName);
  const orgType = textValue(nextConfig.orgType) || org.type || "community";
  const primaryColor = textValue(nextConfig.primaryColor) || "#c25038";
  const accentColor = textValue(nextConfig.accentColor) || "#2563eb";

  await db.execute(sql`
    INSERT INTO cs_org_configs (
      org_id,
      org_name,
      short_name,
      org_type,
      tagline,
      mission,
      location,
      primary_color,
      accent_color,
      logo_url,
      hero_image_url,
      contact_email,
      contact_phone,
      contact_address,
      mailing_address,
      website,
      social_facebook,
      social_instagram,
      social_twitter,
      social_linkedin,
      meeting_day,
      meeting_time,
      meeting_location,
      footer_text,
      meta_description,
      stats,
      programs,
      partners,
      sponsorship_levels,
      features,
      updated_at
    )
    VALUES (
      ${publicOrgId},
      ${orgName},
      ${shortName},
      ${orgType},
      ${textValue(nextConfig.tagline)},
      ${textValue(nextConfig.mission)},
      ${textValue(nextConfig.location)},
      ${primaryColor},
      ${accentColor},
      ${textValue(nextConfig.logoUrl)},
      ${textValue(nextConfig.heroImageUrl)},
      ${textValue(nextConfig.contactEmail)},
      ${textValue(nextConfig.contactPhone)},
      ${textValue(nextConfig.contactAddress)},
      ${textValue(nextConfig.mailingAddress)},
      ${textValue(nextConfig.website)},
      ${textValue(nextConfig.socialFacebook)},
      ${textValue(nextConfig.socialInstagram)},
      ${textValue(nextConfig.socialTwitter)},
      ${textValue(nextConfig.socialLinkedin)},
      ${textValue(nextConfig.meetingDay)},
      ${textValue(nextConfig.meetingTime)},
      ${textValue(nextConfig.meetingLocation)},
      ${textValue(nextConfig.footerText)},
      ${textValue(nextConfig.metaDescription)},
      ${JSON.stringify(jsonArray(nextConfig.stats))}::jsonb,
      ${JSON.stringify(jsonArray(nextConfig.programs))}::jsonb,
      ${JSON.stringify(jsonArray(nextConfig.partners))}::jsonb,
      ${JSON.stringify(jsonArray(nextConfig.sponsorshipLevels))}::jsonb,
      ${JSON.stringify(nextFeatures)}::jsonb,
      NOW()
    )
    ON CONFLICT (org_id) DO UPDATE SET
      org_name = EXCLUDED.org_name,
      short_name = EXCLUDED.short_name,
      org_type = EXCLUDED.org_type,
      tagline = EXCLUDED.tagline,
      mission = EXCLUDED.mission,
      location = EXCLUDED.location,
      primary_color = EXCLUDED.primary_color,
      accent_color = EXCLUDED.accent_color,
      logo_url = EXCLUDED.logo_url,
      hero_image_url = EXCLUDED.hero_image_url,
      contact_email = EXCLUDED.contact_email,
      contact_phone = EXCLUDED.contact_phone,
      contact_address = EXCLUDED.contact_address,
      mailing_address = EXCLUDED.mailing_address,
      website = EXCLUDED.website,
      social_facebook = EXCLUDED.social_facebook,
      social_instagram = EXCLUDED.social_instagram,
      social_twitter = EXCLUDED.social_twitter,
      social_linkedin = EXCLUDED.social_linkedin,
      meeting_day = EXCLUDED.meeting_day,
      meeting_time = EXCLUDED.meeting_time,
      meeting_location = EXCLUDED.meeting_location,
      footer_text = EXCLUDED.footer_text,
      meta_description = EXCLUDED.meta_description,
      stats = EXCLUDED.stats,
      programs = EXCLUDED.programs,
      partners = EXCLUDED.partners,
      sponsorship_levels = EXCLUDED.sponsorship_levels,
      features = EXCLUDED.features,
      updated_at = NOW()
  `);

  return { config: nextConfig, publicOrgId };
}
