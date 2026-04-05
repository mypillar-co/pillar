/**
 * Detect the current org's slug.
 *
 * In production: extracted from the subdomain of the current hostname.
 *   norwin-rotary-club.mypillar.co  →  "norwin-rotary-club"
 *
 * In development (Replit): falls back to the VITE_ORG_SLUG environment variable.
 *   VITE_ORG_SLUG=norwin-rotary-club  →  "norwin-rotary-club"
 */
export function detectOrgSlug(): string {
  const hostname = window.location.hostname;

  // Production: *.mypillar.co subdomain
  const prodMatch = hostname.match(/^([a-z0-9][a-z0-9-]+)\.mypillar\.co$/);
  if (prodMatch) return prodMatch[1];

  // Dev fallback via env var
  const devSlug = import.meta.env.VITE_ORG_SLUG as string | undefined;
  if (devSlug) return devSlug;

  // Last resort: use "norwin-rotary-club" as default for NRC dev environment
  return "norwin-rotary-club";
}

/** Singleton so we don't re-compute on every call */
let _slug: string | null = null;
export function getOrgSlug(): string {
  if (!_slug) _slug = detectOrgSlug();
  return _slug;
}
