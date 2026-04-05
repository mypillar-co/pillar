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
  name: "",
  shortName: "",
  tagline: "",
  type: "organization",
  primaryColor: "#1e3a5f",
  accentColor: "#f59e0b",
  hero: {
    headline: "",
    subtext: "",
    ctaPrimary: "View Events",
    ctaSecondary: "Get Involved",
  },
  stats: [],
  programs: [],
  about: {
    mission: "",
    description1: "",
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

// ── Meta tag helpers ───────────────────────────────────────────────────────────

function setMeta(name: string, content: string, prop = false) {
  const attr = prop ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function applyMetaTags(config: OrgConfig) {
  if (!config.name) return;
  const title = config.tagline
    ? `${config.name} — ${config.tagline}`
    : config.name;
  const description = config.about.description1 || config.hero.subtext || `${config.name} — ${config.tagline}`;

  document.title = title;
  setMeta("description", description);
  setMeta("og:title", config.name, true);
  setMeta("og:description", description, true);
  setMeta("og:type", "website", true);
  if (config.hero.imageUrl) {
    setMeta("og:image", config.hero.imageUrl, true);
  }
  setMeta("twitter:card", "summary_large_image");
  setMeta("twitter:title", title);
  setMeta("twitter:description", description);
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
        const merged = { ...DEFAULT_CONFIG, ...data };
        setConfig(merged);
        applyMetaTags(merged);
      })
      .catch(() => {
        // Keep blank defaults on error — never show filler text
      })
      .finally(() => setLoading(false));
  }, [orgSlug]);

  // Inject dynamic CSS custom properties so colors work everywhere
  useEffect(() => {
    if (loading) return;
    const primary = config.primaryColor ?? "#1e3a5f";
    const accent = config.accentColor ?? "#f59e0b";

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
