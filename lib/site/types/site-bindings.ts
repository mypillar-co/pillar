export interface SiteEventItem {
  id: string;
  slug: string;
  name: string;
  date?: string;
  time?: string;
  location?: string;
  description?: string;
  imageUrl?: string;
  ctaLabel: string;
  ctaUrl: string;
  eventMode: string;
  showPricing: boolean;
  price?: number;
  isSoldOut: boolean;
  isRegistrationClosed: boolean;
  siteDisplayVariant: string;
  featuredOnSite: boolean;
}

export interface SiteSponsorItem {
  id: string;
  name: string;
  logoUrl?: string | null;
  website?: string | null;
  tierRank: number;
}

export interface SiteVendorItem {
  id: string;
  name: string;
  siteCategory?: string | null;
  siteDisplayPriority: number;
}

export interface SiteContactItem {
  id: string;
  firstName: string;
  lastName?: string | null;
  siteRole?: string | null;
  siteBio?: string | null;
  sitePhotoUrl?: string | null;
}

export interface SiteAnnouncementItem {
  id: string;
  title: string;
  body?: string | null;
  createdAt: Date;
  siteBlockTarget?: string | null;
}

export interface SiteSocialHandle {
  platform: string;
  accountName: string;
  siteLabelOverride?: string | null;
}

export interface OrgSiteProfile {
  name: string;
  mission: string;
  tagline?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  hours?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  type?: string | null;
  slug?: string | null;
}

export interface EventPublicMetricsSite {
  ticketsSold: number;
  ticketsRemaining?: number | null;
}

export type SiteDataMap = Record<string, unknown>;

export interface BlockContentMap {
  [blockId: string]: Record<string, unknown> | null;
}

export interface BlockContentResult {
  contentMap: BlockContentMap;
  signals: {
    eventHeavy: boolean;
    strongMission: boolean;
    membershipDriven: boolean;
    imageRich: boolean;
    minimalContent: boolean;
  };
}

export interface ThemePreset {
  presetKey: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorSurface: string;
  colorText: string;
  fontHeadingKey: string;
  fontBodyKey: string;
  radiusScale: string;
  shadowStyle: string;
  heroStyleDefault: string;
  buttonStyle: string;
}

export interface AutoUpdateResult {
  updatedBlocks: string[];
  suggestedBlocks: string[];
  skippedBlocks: string[];
  compiledHtml: string | null;
}
