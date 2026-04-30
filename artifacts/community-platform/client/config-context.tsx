import { createContext, useContext, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HeroVisualType } from "./lib/heroVisual";

export interface OrgConfig {
  orgId: string;
  orgName: string;
  shortName?: string | null;
  orgType?: string | null;
  tagline?: string | null;
  mission?: string | null;
  location?: string | null;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  heroVisualType?: HeroVisualType | null;
  heroLayout?: "split_framed" | "full_bleed" | "split" | "background" | null;
  memberCount?: number;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  mailingAddress?: string | null;
  website?: string | null;
  socialFacebook?: string | null;
  socialInstagram?: string | null;
  socialTwitter?: string | null;
  socialLinkedin?: string | null;
  meetingDay?: string | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  footerText?: string | null;
  metaDescription?: string | null;
  stats?: { value: string; label: string }[];
  programs?: { icon: string; title: string; description: string }[];
  partners?: { name: string; description: string; website?: string }[];
  sponsorshipLevels?: { name: string; price: string; benefits: string[] }[];
  features?: {
    blog?: boolean;
    newsletter?: boolean;
    vendors?: boolean;
    sponsors?: boolean;
    businessDirectory?: boolean;
    ticketedEvents?: boolean;
    members?: boolean;
    membersPortal?: unknown;
    heroVisualType?: HeroVisualType | null;
    heroLayout?: "split_framed" | "full_bleed" | "split" | "background" | null;
  };
  _empty?: boolean;
}

const ConfigContext = createContext<OrgConfig | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<OrgConfig>({ queryKey: ["/api/org-config"] });

  useEffect(() => {
    if (data && !data._empty) {
      document.documentElement.style.setProperty("--primary-hex", data.primaryColor || "#c25038");
      document.documentElement.style.setProperty("--accent-hex", data.accentColor || "#2563eb");
      if (data.metaDescription) {
        const meta = document.querySelector('meta[name="description"]') || document.createElement("meta");
        meta.setAttribute("name", "description");
        meta.setAttribute("content", data.metaDescription);
        document.head.appendChild(meta);
      }
      document.title = data.orgName || "Community Platform";
    }
  }, [data]);

  return <ConfigContext.Provider value={data || null}>{children}</ConfigContext.Provider>;
}

export function useConfig(): OrgConfig | null {
  return useContext(ConfigContext);
}
