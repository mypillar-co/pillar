import { pillarRequest } from "./pillarSync.js";

export type OrgConfigPatch = {
  orgId: string;
  orgName?: string;
  shortName?: string;
  primaryColor?: string;
  accentColor?: string;
  tagline?: string;
  mission?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingLocation?: string;
  features?: Record<string, unknown>;
};

export async function syncOrgConfigPatchToPillar(payload: OrgConfigPatch) {
  console.log(`[pillar-sync] org-config patch org=${payload.orgId}`);
  return pillarRequest("/api/internal/org-config", "PATCH", payload);
}
