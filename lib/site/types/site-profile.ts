export interface SiteProfile {
  orgId: string;
  orgName: string;
  orgType: string;
  siteType: string;
  mission: string;
  tagline: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  hours: string;
  audience: string;
  programs: string[];
  tone: string;
  logoUrl?: string;
  heroImageUrl?: string;
  importedColors?: string[];
  primaryCtaType: string;
  hasRealStats: boolean;
  isEventFirstOrg: boolean;
  foundingYear?: string;
  memberCount?: string;
  socialHandles?: { platform: string; accountName: string; siteLabelOverride?: string | null }[];
}

export interface SiteProfileInputs {
  org: Record<string, unknown>;
  interviewBody?: string;
  importRunId?: string;
  importFindings?: Array<Record<string, unknown>>;
  contentStrategy?: { tone?: string };
  socialHandles?: Array<{ platform: string; accountName: string; siteLabelOverride?: string | null }>;
}
