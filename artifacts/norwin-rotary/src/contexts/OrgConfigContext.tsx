import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getOrgSlug } from "@/lib/orgSlug";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OrgProgram {
  icon: string;
  title: string;
  description: string;
}

export interface OrgStat {
  value: string;
  label: string;
}

export interface OrgConfig {
  name: string;
  shortName: string;
  tagline: string;
  type: string;
  parentOrg?: string;
  primaryColor: string;
  accentColor: string;
  hero: {
    headline: string;
    subtext: string;
    eyebrow?: string;
    imageUrl?: string;
    ctaPrimary?: string;
    ctaSecondary?: string;
  };
  stats: OrgStat[];
  programs: OrgProgram[];
  about: {
    mission: string;
    description1: string;
    description2?: string;
    imageUrl?: string;
  };
  contact: {
    address?: string;
    phone?: string;
    email?: string;
    membershipText?: string;
  };
  meeting?: {
    schedule?: string;
    venue?: string;
    address?: string;
    duration?: string;
    guestsWelcome?: boolean;
  };
  footer?: {
    badge?: string;
    parentUrl?: string;
    parentName?: string;
  };
  social?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    website?: string;
  };
}

const DEFAULT_CONFIG: OrgConfig = {
  name: "Our Organization",
  shortName: "ORG",
  tagline: "Serving our community",
  type: "organization",
  primaryColor: "#1e3a5f",
  accentColor: "#f59e0b",
  hero: {
    headline: "Serving our community",
    subtext: "Welcome to our organization. Join us in making a difference.",
    ctaPrimary: "View Events",
    ctaSecondary: "Get Involved",
  },
  stats: [],
  programs: [],
  about: {
    mission: "Serving our community",
    description1: "We are dedicated to making a positive impact in our community.",
  },
  contact: {},
};

// ── Context ────────────────────────────────────────────────────────────────────

interface OrgConfigContextValue {
  config: OrgConfig;
  loading: boolean;
  orgSlug: string;
}

const OrgConfigContext = createContext<OrgConfigContextValue>({
  config: DEFAULT_CONFIG,
  loading: true,
  orgSlug: "",
});

export function useOrgConfig() {
  return useContext(OrgConfigContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function OrgConfigProvider({ children }: { children: ReactNode }) {
  const orgSlug = getOrgSlug();
  const [config, setConfig] = useState<OrgConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/org/${orgSlug}/config`)
      .then((r) => r.json())
      .then((data: OrgConfig) => {
        setConfig({ ...DEFAULT_CONFIG, ...data });
      })
      .catch(() => {
        // Keep defaults on error
      })
      .finally(() => setLoading(false));
  }, [orgSlug]);

  // Inject dynamic CSS custom properties so colors work everywhere
  useEffect(() => {
    if (loading) return;
    const primary = config.primaryColor ?? "#1e3a5f";
    const accent = config.accentColor ?? "#f59e0b";

    // Compute light/dark variants automatically
    const style = document.getElementById("pillar-org-vars") ?? document.createElement("style");
    style.id = "pillar-org-vars";
    style.textContent = `
      :root {
        --primary: ${primary};
        --primary-dark: color-mix(in srgb, ${primary} 80%, black);
        --primary-light: color-mix(in srgb, ${primary} 80%, white);
        --accent: ${accent};
        --accent-dark: color-mix(in srgb, ${accent} 80%, black);
      }
    `;
    document.head.appendChild(style);
  }, [loading, config.primaryColor, config.accentColor]);

  return (
    <OrgConfigContext.Provider value={{ config, loading, orgSlug }}>
      {children}
    </OrgConfigContext.Provider>
  );
}
