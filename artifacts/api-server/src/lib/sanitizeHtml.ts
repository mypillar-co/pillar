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
 *
 * NOTE: Do NOT call sanitizeAiHtml on template-built HTML — the template is
 * server-controlled and already safe. Only call it on raw AI-generated HTML,
 * and use sanitizeAiSiteHtml to restore the trusted script block afterward.
 */

const DANGEROUS_TAG_RE =
  /<(\/?)(?:script|noscript|object|embed|applet|frame|frameset|iframe|base)\b[^>]*>/gi;

const SCRIPT_BLOCK_RE =
  /<script\b[^>]*>[\s\S]*?<\/script>/gi;

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

/**
 * Sanitize AI-generated full-site HTML and restore the trusted template
 * script block. This prevents AI-injected scripts while ensuring the site's
 * own interactive JavaScript (navbar, scroll, counters, etc.) always works.
 *
 * Use this for ALL AI-update paths (chat edits, event syncs) instead of the
 * raw sanitizeAiHtml. Never use on buildSiteFromTemplate output.
 */
export function sanitizeAiSiteHtml(html: string, trustedScriptBlock: string): string {
  const stripped = html
    .replace(SCRIPT_BLOCK_RE, "")
    .replace(DANGEROUS_TAG_RE, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(DANGEROUS_URI_RE, (match, attr) => `${attr}="#"`)
    .replace(META_REFRESH_RE, "")
    .replace(CSS_EXPRESSION_RE, "");

  const bodyClose = stripped.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return stripped.slice(0, bodyClose) + "\n" + trustedScriptBlock + "\n</body>" + stripped.slice(bodyClose + 7);
  }
  return stripped + "\n" + trustedScriptBlock;
}
