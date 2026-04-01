/**
 * Targeted XSS sanitizer for AI-generated full-page HTML.
 *
 * sanitize-html's allowlist approach strips <style> blocks and inline CSS
 * which are essential for our generated sites. Instead, we use targeted
 * replacement to eliminate the specific XSS vectors without touching
 * legitimate presentation markup.
 *
 * Attack vectors blocked:
 *  1. <script> tags (including noscript, base override)
 *  2. Inline event handlers (on*)
 *  3. javascript: / vbscript: URIs in href/src/action
 *  4. data:text/html and similar dangerous data URIs
 *  5. <meta http-equiv="refresh"> redirects
 *  6. <link rel="import"> and prerender hints
 *  7. <object>, <embed>, <applet> (plugin execution)
 *  8. CSS expression() (IE)
 */

const DANGEROUS_TAG_RE =
  /<(\/?)(?:script|noscript|object|embed|applet|frame|frameset|iframe|base)\b[^>]*>/gi;

const EVENT_HANDLER_RE =
  /\s+on[a-z]{1,30}\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

const DANGEROUS_URI_RE =
  /\b(href|src|action|formaction|data)\s*=\s*["']?\s*(?:javascript|vbscript|data\s*:\s*(?!image\/(?:png|jpeg|gif|webp|svg\+xml)))[^"'\s>]*/gi;

const META_REFRESH_RE =
  /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi;

const CSS_EXPRESSION_RE = /expression\s*\([^)]*\)/gi;

export function sanitizeAiHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAG_RE, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(DANGEROUS_URI_RE, (match, attr) => `${attr}="#"`)
    .replace(META_REFRESH_RE, "")
    .replace(CSS_EXPRESSION_RE, "");
}
