import type { SiteProfile } from "../types/site-profile.js";
import type { LayoutSignals } from "../types/layout-strategy.js";
import type { ThemePreset } from "../types/site-bindings.js";

const THEME_PRESETS: Record<string, ThemePreset> = {
  // ── Official org-brand presets (always take priority when org type matches) ──
  "rotary-official": {
    presetKey: "rotary-official",
    colorPrimary: "#003DA5",    // Rotary Royal Blue
    colorSecondary: "#002880",
    colorAccent: "#F7A81B",     // Rotary Gold
    colorSurface: "#f8fafc",
    colorText: "#111827",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "12px",
    shadowStyle: "soft",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  "lions-official": {
    presetKey: "lions-official",
    colorPrimary: "#002B7F",    // Lions International Blue
    colorSecondary: "#001F5E",
    colorAccent: "#F5D300",     // Lions Gold
    colorSurface: "#f8fafc",
    colorText: "#111827",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "12px",
    shadowStyle: "soft",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  "vfw-official": {
    presetKey: "vfw-official",
    colorPrimary: "#003366",    // VFW Navy
    colorSecondary: "#002244",
    colorAccent: "#BF0A30",     // VFW Red
    colorSurface: "#f8fafc",
    colorText: "#111827",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "10px",
    shadowStyle: "crisp",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "sharp",
  },
  "elks-official": {
    presetKey: "elks-official",
    colorPrimary: "#4B0082",    // Elks Purple
    colorSecondary: "#380060",
    colorAccent: "#D4A843",     // Elks Gold
    colorSurface: "#faf8ff",
    colorText: "#111827",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "12px",
    shadowStyle: "soft",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  // ── Generic presets ──────────────────────────────────────────────────────
  "navy-gold": {
    presetKey: "navy-gold",
    colorPrimary: "#1e3a5f",
    colorSecondary: "#2d5080",
    colorAccent: "#f59e0b",
    colorSurface: "#f8fafc",
    colorText: "#111827",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "14px",
    shadowStyle: "soft",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  "forest-amber": {
    presetKey: "forest-amber",
    colorPrimary: "#14532d",
    colorSecondary: "#166534",
    colorAccent: "#d97706",
    colorSurface: "#f0fdf4",
    colorText: "#111827",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "12px",
    shadowStyle: "soft",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  "slate-teal": {
    presetKey: "slate-teal",
    colorPrimary: "#1e293b",
    colorSecondary: "#334155",
    colorAccent: "#0d9488",
    colorSurface: "#f8fafc",
    colorText: "#111827",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "14px",
    shadowStyle: "crisp",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "sharp",
  },
  "warm-earth": {
    presetKey: "warm-earth",
    colorPrimary: "#7c2d12",
    colorSecondary: "#9a3412",
    colorAccent: "#f97316",
    colorSurface: "#fef3c7",
    colorText: "#1c1917",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "16px",
    shadowStyle: "warm",
    heroStyleDefault: "warm-overlay",
    buttonStyle: "rounded",
  },
  "midnight-indigo": {
    presetKey: "midnight-indigo",
    colorPrimary: "#312e81",
    colorSecondary: "#4338ca",
    colorAccent: "#818cf8",
    colorSurface: "#eef2ff",
    colorText: "#1e1b4b",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "14px",
    shadowStyle: "dramatic",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  "autumn-civic": {
    presetKey: "autumn-civic",
    colorPrimary: "#78350f",
    colorSecondary: "#92400e",
    colorAccent: "#fbbf24",
    colorSurface: "#fffbeb",
    colorText: "#1c1917",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "12px",
    shadowStyle: "soft",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  "cool-professional": {
    presetKey: "cool-professional",
    colorPrimary: "#1d4ed8",
    colorSecondary: "#1e40af",
    colorAccent: "#60a5fa",
    colorSurface: "#eff6ff",
    colorText: "#1e3a8a",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "10px",
    shadowStyle: "crisp",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "sharp",
  },
  "terra-cotta": {
    presetKey: "terra-cotta",
    colorPrimary: "#be123c",
    colorSecondary: "#9f1239",
    colorAccent: "#fb7185",
    colorSurface: "#fff1f2",
    colorText: "#1c1917",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "14px",
    shadowStyle: "warm",
    heroStyleDefault: "gradient-dark",
    buttonStyle: "rounded",
  },
  "sage-linen": {
    presetKey: "sage-linen",
    colorPrimary: "#3d6b4f",
    colorSecondary: "#4a7c5f",
    colorAccent: "#a16207",
    colorSurface: "#f5f0e8",
    colorText: "#1c2918",
    fontHeadingKey: "DM Serif Display",
    fontBodyKey: "DM Sans",
    radiusScale: "16px",
    shadowStyle: "soft",
    heroStyleDefault: "warm-overlay",
    buttonStyle: "rounded",
  },
};

const HUE_DISTANCE_THRESHOLD = 30;

function hexToHsl(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function isNeutral(hex: string): boolean {
  const hsl = hexToHsl(hex);
  if (!hsl) return true;
  const [, s, l] = hsl;
  return s < 15 || l < 10 || l > 90;
}

function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2);
  return Math.min(d, 360 - d);
}

export function deriveTheme(
  profile: SiteProfile,
  signals: LayoutSignals,
  importedColors: string[]
): ThemePreset {
  // ── Step 1: Official org-brand presets — always override everything else ──
  const orgTypeLower = (profile.orgType ?? "").toLowerCase();
  const orgNameLower = (profile.orgName ?? "").toLowerCase();

  if (orgTypeLower.includes("rotary") || orgNameLower.includes("rotary")) {
    return THEME_PRESETS["rotary-official"];
  }
  if (orgTypeLower.includes("lions") || orgNameLower.includes("lions club")) {
    return THEME_PRESETS["lions-official"];
  }
  if (orgTypeLower.includes("vfw") || orgNameLower.includes("vfw") || orgNameLower.includes("veterans of foreign wars")) {
    return THEME_PRESETS["vfw-official"];
  }
  if (orgTypeLower.includes("elks") || orgNameLower.includes("elks lodge") || orgNameLower.includes("bpoe")) {
    return THEME_PRESETS["elks-official"];
  }

  const nonNeutralColors = importedColors.filter(c => !isNeutral(c));

  if (nonNeutralColors.length > 0) {
    const dominantHsl = hexToHsl(nonNeutralColors[0]);
    if (dominantHsl) {
      const [dominantHue] = dominantHsl;

      let bestPreset = "navy-gold";
      let bestDistance = Infinity;

      for (const [key, preset] of Object.entries(THEME_PRESETS)) {
        const accentHsl = hexToHsl(preset.colorAccent);
        const primaryHsl = hexToHsl(preset.colorPrimary);
        if (accentHsl && primaryHsl) {
          const dist = Math.min(
            hueDistance(dominantHue, accentHsl[0]),
            hueDistance(dominantHue, primaryHsl[0])
          );
          if (dist < bestDistance) {
            bestDistance = dist;
            bestPreset = key;
          }
        }
      }

      if (bestDistance < HUE_DISTANCE_THRESHOLD) {
        return THEME_PRESETS[bestPreset];
      }
    }
  }

  const orgType = profile.orgType?.toLowerCase() ?? "";

  if (orgType === "civic" || orgType === "government") {
    return THEME_PRESETS["cool-professional"];
  }

  if (orgType === "arts" || orgType === "culture") {
    return THEME_PRESETS["midnight-indigo"];
  }

  if (orgType === "nature" || orgType === "outdoors" || orgType === "environmental") {
    return THEME_PRESETS["forest-amber"];
  }

  if (signals.missionStrength === "strong" && nonNeutralColors.length === 0) {
    return THEME_PRESETS["slate-teal"];
  }

  return THEME_PRESETS["navy-gold"];
}
