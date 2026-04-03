import type { RankedImage } from "../types/import-types.js";

const HERO_URL_PATTERNS = /hero|banner|header|cover|main|splash|featured/i;
const LOGO_URL_PATTERNS = /logo|brand|icon|emblem|seal/i;
const GALLERY_URL_PATTERNS = /gallery|photo|image|pic|media/i;
const PROGRAM_URL_PATTERNS = /program|service|activit|event/i;

const JUNK_PATTERNS = /icon|sprite|pixel|badge|1x1|blank|placeholder|avatar|thumb/i;

export function rankImages(imageUrls: string[], heroUrl?: string, logoUrl?: string): RankedImage[] {
  const seen = new Set<string>();
  const results: RankedImage[] = [];

  const allUrls = [
    ...(heroUrl ? [{ url: heroUrl, priority: 100 }] : []),
    ...(logoUrl ? [{ url: logoUrl, priority: 90 }] : []),
    ...imageUrls.map(url => ({ url, priority: 0 })),
  ];

  for (const { url, priority } of allUrls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const lower = url.toLowerCase();
    if (JUNK_PATTERNS.test(lower)) continue;

    let score = priority;
    let role: RankedImage["role"] = "unknown";

    if (url === heroUrl) {
      score = Math.max(score, 90);
      role = "hero";
    } else if (url === logoUrl) {
      score = Math.max(score, 80);
      role = "logo";
    } else if (HERO_URL_PATTERNS.test(lower)) {
      score += 70;
      role = "hero";
    } else if (LOGO_URL_PATTERNS.test(lower)) {
      score += 60;
      role = "logo";
    } else if (PROGRAM_URL_PATTERNS.test(lower)) {
      score += 40;
      role = "program";
    } else if (GALLERY_URL_PATTERNS.test(lower)) {
      score += 30;
      role = "gallery";
    } else {
      score += 20;
    }

    if (lower.includes(".jpg") || lower.includes(".jpeg") || lower.includes(".png") || lower.includes(".webp")) {
      score += 10;
    }

    results.push({ url, score, role });
  }

  return results.sort((a, b) => b.score - a.score);
}
