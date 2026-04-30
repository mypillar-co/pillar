import { pillarRequest } from "./pillarSync.js";

const HERO_DEBUG = process.env.PILLAR_DEBUG_HERO === "1";

export type OrgConfigPatch = {
  orgId: string;
  orgName?: string;
  shortName?: string;
  primaryColor?: string;
  accentColor?: string;
  tagline?: string;
  mission?: string;
  logoUrl?: string;
  heroImageUrl?: string | null;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingLocation?: string;
  features?: Record<string, unknown>;
};

export async function syncOrgConfigPatchToPillar(payload: OrgConfigPatch) {
  if (HERO_DEBUG) {
    console.log("[hero-debug][api-server] pillar sync payload", {
      orgId: payload.orgId,
      heroImageUrl: payload.heroImageUrl,
      heroLayout:
        payload.features && typeof payload.features === "object"
          ? (payload.features as Record<string, unknown>).heroLayout
          : undefined,
      heroVisualType:
        payload.features && typeof payload.features === "object"
          ? (payload.features as Record<string, unknown>).heroVisualType
          : undefined,
      features: payload.features,
    });
  }
  return pillarRequest("/api/internal/org-config", "PATCH", payload);
}
