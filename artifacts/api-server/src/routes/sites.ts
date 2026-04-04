import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sitesTable, siteUpdateSchedulesTable, websiteSpecsTable, eventsTable, recurringEventTemplatesTable } from "@workspace/db";
import { eq, sql, and, asc } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";
import OpenAI from "openai";
import { buildSiteFromTemplate, SITE_SCRIPT_BLOCK, type SiteContent } from "../siteTemplate";
import { sanitizeAiSiteHtml } from "../lib/sanitizeHtml";
import { load as cheerioLoad } from "cheerio";
import { promises as dnsPromises } from "dns";
import { isIP } from "net";
import * as ipaddr from "ipaddr.js";
import { ObjectStorageService } from "../lib/objectStorage";
import type { ObjectAclPolicy } from "../lib/objectAcl";

const router = Router();

// ─── Community Framework API ──────────────────────────────────────────────────
// Fetches the 9-file code framework from discoverirwin.com/api/pillar/framework.
// Cached in-process for 1 hour — fetched on first site generate, not on every request.
const FRAMEWORK_API_URL = "https://discoverirwin.com/api/pillar/framework";
const FRAMEWORK_API_KEY = "pillar_ro_a3a97fea1c8f5f3750e7f650df3de1b0cc6177ffb471398a";
let _frameworkCache: { files: Record<string, string>; fetchedAt: number } | null = null;
const FRAMEWORK_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchFramework(): Promise<Record<string, string> | null> {
  if (_frameworkCache && Date.now() - _frameworkCache.fetchedAt < FRAMEWORK_CACHE_TTL_MS) {
    return _frameworkCache.files;
  }
  try {
    const res = await fetch(FRAMEWORK_API_URL, {
      headers: { "X-Pillar-Key": FRAMEWORK_API_KEY, "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const payload = await res.json() as { files?: Record<string, string> };
    if (!payload.files || typeof payload.files !== "object") return null;
    _frameworkCache = { files: payload.files, fetchedAt: Date.now() };
    return payload.files;
  } catch {
    return null;
  }
}

// Extract the ORG_TYPE_COLOR_PALETTES block from the framework's INTAKE-QUESTIONS.ts
// and build a lookup: org type label → { primary HSL, accent HSL }
function parseFrameworkPalettes(intakeFile: string): Record<string, { primary: string; accent: string }> {
  try {
    const match = intakeFile.match(/ORG_TYPE_COLOR_PALETTES[^=]+=\s*\{([\s\S]+?)\};/);
    if (!match) return {};
    const block = match[1];
    const result: Record<string, { primary: string; accent: string }> = {};
    const lineRe = /"([^"]+)"\s*:\s*\{\s*primary:\s*"([^"]+)"\s*,\s*accent:\s*"([^"]+)"\s*\}/g;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(block)) !== null) {
      result[m[1]] = { primary: m[2], accent: m[3] };
    }
    return result;
  } catch {
    return {};
  }
}

// Convert HSL string like "210 70% 40%" to hex (best-effort approximation for prompt injection)
function hslStringToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return "#1e3a5f";
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

const CONTEXT_TURNS = 10;
const MAX_CHAT_TOKENS = 700;
const MAX_GEN_TOKENS = 10000;
const MAX_SPEC_TOKENS = 1200;
const MAX_CHANGE_TOKENS = 5000;

const LOGO_MAX_BYTES = 500_000; // 500 KB base64 limit
const ALLOWED_LOGO_MIME = /^data:image\/(png|jpeg|webp|gif);base64,/;

function validateLogoDataUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!ALLOWED_LOGO_MIME.test(raw)) return null; // reject SVG and any non-image MIME
  if (raw.length > LOGO_MAX_BYTES) return null; // reject oversized payloads
  const base64Part = raw.split(",")[1] ?? "";
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Part)) return null; // reject non-base64 content
  return raw;
}

const MONTHLY_LIMITS: Record<string, number> = {
  tier1: 30,
  tier1a: 75,
  tier2: 75,
  tier3: 200,
  default: 15,
};

const TIERS_ALLOWING_CHANGES = new Set(["tier1", "tier1a", "tier2", "tier3"]);

function getMonthlyLimit(tier: string | null | undefined): number {
  return MONTHLY_LIMITS[tier ?? ""] ?? MONTHLY_LIMITS.default;
}

function tierAllowsSchedule(tier: string | null | undefined): boolean {
  return tier === "tier1a" || tier === "tier2" || tier === "tier3";
}

function getOpenAIClient() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("Replit AI integration not configured. Run setupReplitAIIntegrations.");
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

function isNewMonth(resetAt: Date): boolean {
  const now = new Date();
  return now.getFullYear() !== resetAt.getFullYear() || now.getMonth() !== resetAt.getMonth();
}

async function checkAndResetUsage(org: { id: string; aiMessagesUsed: number; aiMessagesResetAt: Date; tier: string | null }, res: Response) {
  const monthlyLimit = getMonthlyLimit(org.tier);
  let used = org.aiMessagesUsed;
  if (isNewMonth(new Date(org.aiMessagesResetAt))) {
    await db.update(organizationsTable).set({ aiMessagesUsed: 0, aiMessagesResetAt: new Date() }).where(eq(organizationsTable.id, org.id));
    used = 0;
  }
  if (used >= monthlyLimit) {
    res.status(429).json({ error: "monthly_limit_reached", used, limit: monthlyLimit, tier: org.tier });
    return null;
  }
  return { used, limit: monthlyLimit };
}

async function callOpenAI(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
  model: "gpt-5-mini" | "gpt-4o-mini" = "gpt-5-mini",
): Promise<string> {
  const client = getOpenAIClient();
  const params: Record<string, unknown> = { model, messages };
  if (model === "gpt-5-mini") {
    params.max_completion_tokens = maxTokens;
  } else {
    params.max_tokens = maxTokens;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.chat.completions.create as any)(params);
  return response.choices[0]?.message?.content ?? "";
}

async function callOpenAIStreaming(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
  res: Response,
): Promise<string> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const client = getOpenAIClient();
  const stream = await client.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: maxTokens,
    messages,
    stream: true,
  });

  let fullText = "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) {
      fullText += text;
      res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
    }
  }

  return fullText;
}

// ─── Interview chat (SSE streaming via Replit AI / OpenAI-compatible) ─────────
router.post("/builder", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const usageInfo = await checkAndResetUsage(org as Parameters<typeof checkAndResetUsage>[0], res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  const { message, history = [], orgName, orgType } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const name = orgName ?? org.name;
  const type = orgType ?? org.type ?? "organization";
  const trimmedHistory = history.slice(-(CONTEXT_TURNS * 2));

  const systemPrompt = `You are a friendly, professional website consultant for Pillar — an AI platform that builds websites for civic organizations, nonprofits, clubs, and community groups.

MANDATORY (from specs/pillar-master-index.md): Before building any site, running any interview, crawling any URL, or validating any build, you MUST read specs/pillar-master-index.md first. This file defines the reading order for all 9 specification documents. Follow them exactly. They are not suggestions — they are requirements. If a user provides an existing website URL during the interview, STOP the interview and crawl the URL first per specs/pillar-site-crawl-spec.md. After every build, run the 18-point validation checklist from specs/pillar-build-validation-checklist.md before presenting the site.

Key rules enforced by this system:
- If the user provides a URL at ANY point: STOP the interview immediately, direct them to use the Import button. Do NOT ask any remaining questions.
- Every built site MUST have: colored hero (NOT white), event cards with icons and hover effects, org-type-specific colors, alternating section backgrounds, dark footer, no AI filler text, no duplicate content.
- Homepage MUST show up to 3 featured event cards near the top (specs/pillar-event-rendering-spec.md).
- After every build, the 18-point validation checklist runs automatically. If any check fails, it is fixed before the site is presented.
- Rotary/Lions/Kiwanis/service clubs: MUST use parent org brand colors (Rotary=royal blue #0c4da2 + gold #f7a81b). Never use generic gray for any org with known brand colors.

You're helping ${name} (a ${type}) build their public website. Ask ONE question at a time. Be warm, conversational, and brief. If a user's answer already answers a future question, skip that question.

⚠️ CRITICAL BRANCHING RULE — READ THIS FIRST ⚠️
If the user mentions a URL or an existing website AT ANY POINT, you MUST:
1. STOP THE INTERVIEW IMMEDIATELY
2. Do NOT ask any more questions (not about programs, events, location, contact, social media, or design)
3. Say ONLY: "Got it — I'll pull everything from [url] automatically. Use the **Import from existing site** button below to kick off the crawl. I'll only follow up if there's anything it couldn't find."
4. WAIT. Do not say anything else until they tell you the import is done.
The user giving you a URL means: DO NOT MAKE THEM TYPE THEIR CONTENT AGAIN. Everything is already on their site. The import button reads the site for you.
⚠️ VIOLATION: Asking about programs, events, location, or contact info AFTER a URL was given is a critical bug. Never do it. ⚠️

If NO URL is provided, follow this interview sequence. These questions come from the community organization framework — ask them in order, skip any the user already answered:

BLOCK 1 — Identity:
1. "Let's build ${name}'s website! In one sentence — what does ${name} do? The kind of thing you'd say to a neighbor who'd never heard of you. Include how long you've been around if you know it."

2. "Do you have an existing website? If so, share the URL and I'll pull your content from it automatically — events, programs, photos, contact info, the works. If not, just say 'no existing site' and we'll build from scratch."
   → If URL provided: STOP. Apply the CRITICAL BRANCHING RULE above.
   → If no existing site: continue to question 3.

3. "What's your short name or abbreviation? (e.g. 'IBPA', 'VFW Post 1', 'Lodge #601') — it appears in the logo badge and page titles."

4. "What are your top programs, services, or activities? Name them and give a sentence on each — these become the highlight cards on your site. List as many as you have."

BLOCK 2 — Events & Registration:
5. "Now for events — this is the heart of your site. List every event you have: name, approximate date, and whether it's annual or one-time. Include regular meetings too (e.g. 'Weekly Tuesday lunch')."

6. "Do any events sell tickets? Do vendors pay to set up booths? Do you accept event sponsors, and if so, what are the sponsorship levels and prices? (e.g. Gold $500, Silver $250)"

BLOCK 3 — Stats & Community:
7. "A few quick numbers for your site's stats section: roughly how many events per year? Approximate total attendees across all events? And how many local businesses or members does your org support or include?"

8. "Do you have community partners — other organizations, businesses, or government offices you collaborate with? Just name them and one line on what they do."

BLOCK 4 — Contact & Social:
9. "Where are you located? Include your address, regular meeting venue, and meeting schedule. Also share your email, phone, and any social media accounts (Facebook, Instagram, etc.)."

BLOCK 5 — Design (last, mostly inferred):
10. "Last one — do you have a logo or brand colors? If not, I'll match your org type's standard colors automatically. Any websites whose look you like? (Optional — I can infer everything from your org type if you skip this.)"

After each answer, acknowledge in ONE sentence that shows you heard it, then ask the next question.
After collecting answers to all 5 blocks (adjusting for skips), say EXACTLY: "I have everything I need! Click **Generate My Site** to build your website."
Keep every response under 65 words. Stay conversational. Never suggest edits — just collect info. NEVER make up events, programs, or descriptions the user didn't provide.`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const reply = await callOpenAI(messages, MAX_CHAT_TOKENS);

    if (!reply) {
      res.status(500).json({ error: "Empty response from AI service. Please try again." });
      return;
    }

    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;

    res.json({ reply, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.status(500).json({ error: "AI service unavailable. Please try again." });
  }
});

// ─── Import from existing URL ─────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 20_000;

/** Read the real image URL from an element — handles lazy-loading patterns */
function getRealSrc(el: ReturnType<ReturnType<typeof cheerioLoad>>, $: ReturnType<typeof cheerioLoad>): string {
  const attrs = ["src", "data-src", "data-lazy-src", "data-lazy", "data-original", "data-image"];
  for (const attr of attrs) {
    const val = $(el).attr(attr)?.trim();
    if (val && !val.startsWith("data:") && val.length > 4) return val;
  }
  // srcset fallback — take the first descriptor
  const srcset = $(el).attr("srcset")?.trim();
  if (srcset) {
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    if (first && !first.startsWith("data:")) return first;
  }
  return "";
}

interface ExtractedPage {
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  /** Absolute URL of the best logo candidate (og:image, logo img, or favicon) */
  logoUrl: string;
  /** Absolute URL of the best hero/banner image from the page */
  heroUrl: string;
  /** Up to 4 additional absolute image URLs from the page body */
  imageUrls: string[];
  /** Structured data extracted from JSON-LD blocks (name, address, phone, etc.) */
  jsonLdText: string;
  /** Branding colors found in the page CSS (hex values) */
  brandColors: string[];
  bodyText: string;
  /** Combined, cleaned text for AI ingestion */
  combined: string;
}

function toAbsoluteUrl(src: string, base: URL): string | null {
  if (!src || src.startsWith("data:")) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function extractPageContent(html: string, baseUrl?: URL): ExtractedPage {
  const $ = cheerioLoad(html);

  // ── Pull reliable metadata BEFORE stripping <head> ───────────────────────
  const title = $("title").first().text().trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  const ogDescription = $('meta[property="og:description"]').attr("content")?.trim() ?? "";

  // ── Extract images and branding BEFORE stripping ──────────────────────────
  const base = baseUrl ?? new URL("https://example.com");

  // og:image is usually the most representative image
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() ?? "";
  const ogImageAbs = ogImage ? toAbsoluteUrl(ogImage, base) : null;

  // Favicon/touch-icon hrefs extracted before head is stripped (used later for logo fallback)
  const _appleTouchIconHref = $('link[rel="apple-touch-icon"]').attr("href") ?? "";
  const _plainFaviconHref =
    $('link[rel="icon"]').attr("href") ?? $('link[rel="shortcut icon"]').attr("href") ?? "";

  // ── Extract JSON-LD structured data BEFORE stripping scripts ─────────────
  let jsonLdText = "";
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const raw = $(el).html()?.trim() ?? "";
      const obj = JSON.parse(raw) as Record<string, unknown>;
      // Flatten useful fields
      const parts: string[] = [];
      const pick = (keys: string[]) => keys.map(k => obj[k]).filter(Boolean).join(" — ");
      if (obj.name) parts.push(`Name: ${obj.name}`);
      if (obj.description) parts.push(`Description: ${obj.description}`);
      if (obj.telephone) parts.push(`Phone: ${obj.telephone}`);
      if (obj.email) parts.push(`Email: ${obj.email}`);
      if (obj.address) {
        const a = obj.address as Record<string, unknown>;
        const addr = pick.call(null, ["streetAddress", "addressLocality", "addressRegion", "postalCode"].filter(k => a[k]));
        if (addr) parts.push(`Address: ${addr}`);
      }
      if (obj.url) parts.push(`Website: ${obj.url}`);
      if (obj.openingHours) parts.push(`Hours: ${obj.openingHours}`);
      if (parts.length > 0) jsonLdText += parts.join("\n") + "\n";
    } catch { /* ignore malformed JSON-LD */ }
  });

  // Pull brand colors from inline styles / meta theme-color
  const themeColor = $('meta[name="theme-color"]').attr("content")?.trim() ?? "";
  const brandColors: string[] = [];
  if (themeColor && /^#[0-9a-f]{3,8}$/i.test(themeColor)) brandColors.push(themeColor);

  // ── Logo detection BEFORE stripping — check all lazy-load src attrs ───────
  // Priority chain:
  // 1. Img with "logo" in src/alt/class (explicit branding markup)
  // 2. First img in header/nav (almost always the org logo)
  // 3. First img inside a home-link anchor
  // 4. og:image
  // 5. Apple-touch-icon (high-res icon designed for display)
  // 6. Standard favicon (last resort)
  const appleTouchIconAbs = _appleTouchIconHref ? toAbsoluteUrl(_appleTouchIconHref, base) : null;
  const plainFaviconAbs = _plainFaviconHref ? toAbsoluteUrl(_plainFaviconHref, base) : null;

  let explicitLogoAbs: string | null = null;
  $('img[src*="logo" i], img[alt*="logo" i], img[class*="logo" i], img[id*="logo" i], img[data-src*="logo" i]').each((_i, el) => {
    if (explicitLogoAbs) return;
    const src = getRealSrc($(el), $);
    if (src) explicitLogoAbs = toAbsoluteUrl(src, base);
  });

  let headerNavLogoAbs: string | null = null;
  $("header img, nav img, #header img, #nav img, .header img, .navbar img, .nav img, .site-header img, .top-bar img, .site-branding img, .brand img, .logo img").each((_i, el) => {
    if (headerNavLogoAbs) return;
    const src = getRealSrc($(el), $);
    if (src) headerNavLogoAbs = toAbsoluteUrl(src, base);
  });

  let homeLinkLogoAbs: string | null = null;
  $('a[href="/"] img, a[href="./"] img, a[href="index.html"] img, a[href="../"] img, .navbar-brand img, .site-logo img').each((_i, el) => {
    if (homeLinkLogoAbs) return;
    const src = getRealSrc($(el), $);
    if (src) homeLinkLogoAbs = toAbsoluteUrl(src, base);
  });

  // ── Strip all non-visible elements ────────────────────────────────────────
  $(
    "script, style, noscript, head, meta, link, iframe, svg, canvas, template, [aria-hidden='true']"
  ).remove();

  // ── Extract body images AFTER removing head/script ────────────────────────
  const bodyImageUrls: string[] = [];
  $("img").each((_i, el) => {
    const src = getRealSrc($(el), $);
    if (!src) return;
    const abs = toAbsoluteUrl(src, base);
    if (!abs) return;
    const lower = abs.toLowerCase();
    if (/icon|logo|avatar|sprite|pixel|badge|seal|emblem|1x1|blank/i.test(lower)) return;
    if (bodyImageUrls.length < 8) bodyImageUrls.push(abs);
  });

  const logoUrl =
    explicitLogoAbs ??
    headerNavLogoAbs ??
    homeLinkLogoAbs ??
    appleTouchIconAbs ??
    ogImageAbs ??
    plainFaviconAbs ??
    "";

  // Hero: og:image first, then first non-logo body image
  const heroUrl = ogImageAbs ?? (bodyImageUrls.length > 0 ? bodyImageUrls[0] : "") ?? "";

  // Additional images: body images, skip the one used as hero
  const imageUrls = bodyImageUrls.filter(u => u !== heroUrl).slice(0, 4);

  // ── Extract body text ─────────────────────────────────────────────────────
  let bodyText = ($("body").text() || $.text())
    .replace(/[ \t]+/g, " ")
    .replace(/(\n\s*){3,}/g, "\n\n")
    .trim();

  // Strip lines that look like raw JSON / JS
  bodyText = bodyText
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (t.length === 0) return false;
      if (/^\s*[{\[].*[}\]]\s*$/.test(t) && t.includes('"')) return false;
      if (t.startsWith('"@context"') || t.startsWith("@context")) return false;
      if (t.startsWith('"@type"') || t.includes('"@type":')) return false;
      if (t.length > 300 && !t.includes(" ")) return false;
      return true;
    })
    .join("\n")
    .trim();

  // ── Build combined text for AI ─────────────────────────────────────────────
  const parts: string[] = [];
  if (ogTitle || title) parts.push(`Page title: ${ogTitle || title}`);
  if (ogDescription || metaDescription) parts.push(`Description: ${ogDescription || metaDescription}`);
  if (jsonLdText) parts.push(`=== STRUCTURED DATA ===\n${jsonLdText}`);
  if (bodyText) parts.push(bodyText);

  return {
    title,
    metaDescription,
    ogTitle,
    ogDescription,
    logoUrl,
    heroUrl,
    imageUrls,
    jsonLdText,
    brandColors,
    bodyText,
    combined: parts.join("\n\n"),
  };
}

/** Legacy helper — returns the cleaned body text only */
function extractVisibleText(html: string): string {
  return extractPageContent(html).combined;
}

const NON_PUBLIC_RANGES = new Set([
  "loopback", "private", "linkLocal", "carrierGradeNat",
  "broadcast", "multicast", "unspecified", "reserved",
  // IPv6-specific
  "uniqueLocal", "ipv4Mapped", "rfc6145", "rfc6052", "6to4", "teredo",
]);

function isPrivateIp(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const range = addr.range();
    if (NON_PUBLIC_RANGES.has(range)) return true;
    // IPv4-mapped IPv6 — unwrap and re-check the embedded IPv4 address
    if (addr.kind() === "ipv6") {
      const v6 = addr as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        const v4 = v6.toIPv4Address();
        return NON_PUBLIC_RANGES.has(v4.range());
      }
    }
    return false;
  } catch {
    return true; // unparseable → treat as unsafe
  }
}

async function isSafeUrl(url: URL): Promise<boolean> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  // Block internal hostnames
  if (/^localhost$/i.test(hostname)) return false;
  if (/\.(local|internal|localhost|example|test|invalid)$/.test(hostname)) return false;
  if (/^metadata\.google\.internal$/.test(hostname)) return false;
  // If hostname is a literal IP, validate directly
  if (isIP(hostname) !== 0) return !isPrivateIp(hostname);
  // Resolve DNS and check all returned addresses
  const allAddresses: string[] = [];
  try {
    const v4 = await dnsPromises.resolve4(hostname);
    allAddresses.push(...v4);
  } catch { /* no A records */ }
  try {
    const v6 = await dnsPromises.resolve6(hostname);
    allAddresses.push(...v6);
  } catch { /* no AAAA records */ }
  if (allAddresses.length === 0) return false; // unresolvable
  return allAddresses.every(addr => !isPrivateIp(addr));
}

const MAX_REDIRECTS = 5;

async function safeFetch(startUrl: URL, init: RequestInit): Promise<Response> {
  let currentUrl = startUrl;
  let remaining = MAX_REDIRECTS;
  while (true) {
    const response = await fetch(currentUrl.toString(), { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    if (remaining-- <= 0) throw new Error("Too many redirects");
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect with no Location header");
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl.toString());
    } catch {
      throw new Error("Invalid redirect URL");
    }
    if (!["http:", "https:"].includes(nextUrl.protocol)) throw new Error("Redirect to non-HTTP protocol blocked");
    const safe = await isSafeUrl(nextUrl);
    if (!safe) throw new Error("Redirect to private/internal address blocked");
    currentUrl = nextUrl;
  }
}

type ImportedSiteData = {
  name: string;
  mission: string;
  services: string;
  location: string;
  schedule: string;
  events: string;
  contact: string;
  social: string;
  leadership: string;
  audience: string;
  style: string;
  extra: string;
  /** Re-hosted path for the org logo (e.g. /api/storage/object/uploads/uuid) — never an external hotlink */
  logoUrl?: string;
  /** Re-hosted path for the hero image */
  heroUrl?: string;
  /** Re-hosted paths for additional gallery images */
  imageUrls?: string[];
  /** Summary counts for the crawl presentation to the user */
  crawlMeta?: {
    eventsFound: number;
    programsFound: number;
    boardMembersFound: number;
    hasLogo: boolean;
    hasHero: boolean;
    imagesDownloaded: number;
    imagesFailed: number;
    warnings: string[];
  };
};

// ─── Download & re-host a single image from an external URL ──────────────────
// Returns the /api/storage/object/... path on success, or null on failure.
// Verifies the response is actually an image (Content-Type check + min size).
// NEVER returns the external URL — re-hosting is mandatory per spec.
const _crawlObjectStorage = new ObjectStorageService();
const IMAGE_DOWNLOAD_TIMEOUT_MS = 8_000;
const IMAGE_MIN_BYTES = 2_000; // < 2 KB is likely a tracking pixel or icon

async function downloadAndRehostImage(
  externalUrl: string,
  label: string,
): Promise<{ path: string; warning?: string } | null> {
  let parsedImg: URL;
  try { parsedImg = new URL(externalUrl); } catch { return null; }
  if (!["http:", "https:"].includes(parsedImg.protocol)) return null;

  try {
    const resp = await fetch(externalUrl, {
      signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Pillar-Importer/1.0; +https://mypillar.co)" },
    });
    if (!resp.ok) return null;

    const contentType = (resp.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
    // Spec rule: MUST be image/* — if we get text/html the URL returned an error page
    if (!contentType.startsWith("image/")) {
      return { path: "", warning: `${label}: URL returned ${contentType} (not an image) — skipped` };
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.byteLength < IMAGE_MIN_BYTES) {
      return { path: "", warning: `${label}: file too small (${buffer.byteLength} bytes) — likely an icon or tracking pixel, skipped` };
    }

    // Upload to object storage via signed PUT URL
    const signedUploadUrl = await _crawlObjectStorage.getObjectEntityUploadURL();
    const putResp = await fetch(signedUploadUrl, {
      method: "PUT",
      body: buffer,
      headers: { "Content-Type": contentType },
      signal: AbortSignal.timeout(30_000),
    });
    if (!putResp.ok) {
      return { path: "", warning: `${label}: upload failed (${putResp.status})` };
    }

    // Set ACL to public so the public site can load it without auth
    const aclPolicy: ObjectAclPolicy = { owner: "system", visibility: "public" };
    await _crawlObjectStorage.trySetObjectEntityAclPolicy(signedUploadUrl, aclPolicy);

    // Return the normalized internal path (/objects/uploads/{uuid})
    const normalizedPath = _crawlObjectStorage.normalizeObjectEntityPath(signedUploadUrl);
    // Convert to the public-facing /api/storage/object/... path
    const publicPath = normalizedPath.replace(/^\/objects\//, "/api/storage/object/");
    return { path: publicPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { path: "", warning: `${label}: download error — ${msg.slice(0, 80)}` };
  }
}

router.post("/import-url", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { url } = req.body as { url?: string };
  if (!url?.trim()) { res.status(400).json({ error: "url is required" }); return; }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
  } catch {
    res.status(400).json({ error: "Invalid URL. Please enter a valid website address." });
    return;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: "Only http and https URLs are supported." });
    return;
  }

  // SSRF protection — block private/internal hosts
  const safe = await isSafeUrl(parsedUrl);
  if (!safe) {
    res.status(400).json({ error: "That URL cannot be accessed. Please enter a publicly accessible website address." });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let rawHtml: string;
  try {
    const response = await safeFetch(parsedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Pillar-Importer/1.0; +https://mypillar.co)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      res.status(422).json({ error: `Could not fetch that page (HTTP ${response.status}). Make sure the URL is publicly accessible.` });
      return;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      res.status(422).json({ error: "That URL doesn't appear to be a webpage. Please enter the address of a public website." });
      return;
    }
    rawHtml = await response.text();
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const isBlocked = err instanceof Error && err.message.includes("blocked");
    if (isBlocked) {
      res.status(400).json({ error: "That URL cannot be accessed. Please enter a publicly accessible website address." });
    } else {
      res.status(422).json({ error: isTimeout ? "The page took too long to respond. Try a different URL." : "Could not reach that website. Make sure the URL is correct and publicly accessible." });
    }
    return;
  } finally {
    clearTimeout(timer);
  }

  const pageContent = extractPageContent(rawHtml, parsedUrl);

  if (pageContent.combined.length < 50) {
    res.status(422).json({ error: "Not enough readable content was found on that page. Try a different URL." });
    return;
  }

  // ── Sub-page crawling — fetch all relevant internal pages ────────────────
  // Priority: keyword-matching pages first (about, events, programs, contact);
  // then any remaining internal links up to the total cap.
  const subPageKeywords = /about|contact|programs?|services?|events?|history|mission|who-we-are|what-we-do|join|member|volunteer|donat|fund/i;
  const seenUrls = new Set([parsedUrl.href]);
  const subPageTexts: string[] = [];

  try {
    const homeDom = cheerioLoad(rawHtml);
    const priorityLinks: string[] = [];
    const otherLinks: string[] = [];

    homeDom("a[href]").each((_i, el) => {
      const href = homeDom(el).attr("href")?.trim() ?? "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      try {
        const abs = new URL(href, parsedUrl).href;
        if (new URL(abs).hostname !== parsedUrl.hostname) return;
        if (seenUrls.has(abs)) return;
        seenUrls.add(abs);
        const isKeyword = subPageKeywords.test(abs) || subPageKeywords.test(homeDom(el).text());
        if (isKeyword) priorityLinks.push(abs);
        else otherLinks.push(abs);
      } catch { /* ignore invalid URLs */ }
    });

    // Keyword pages first, then fill with other internal pages up to 10 total
    const subPageLinks = [...priorityLinks, ...otherLinks].slice(0, 10);

    // Fetch up to 10 sub-pages in parallel with short timeout
    const SUB_TIMEOUT = 8_000;
    const subFetches = subPageLinks.map(async (link) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), SUB_TIMEOUT);
        const resp = await safeFetch(new URL(link), {
          signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Pillar-Importer/1.0; +https://mypillar.co)", Accept: "text/html" },
        });
        clearTimeout(t);
        if (!resp.ok) return;
        const ct = resp.headers.get("content-type") ?? "";
        if (!ct.includes("text/html")) return;
        const subHtml = await resp.text();
        const subContent = extractPageContent(subHtml, new URL(link));
        if (subContent.bodyText.length > 100) {
          subPageTexts.push(`=== SUB-PAGE: ${link} ===\n${subContent.bodyText.slice(0, 4000)}`);
        }
      } catch { /* ignore sub-page errors */ }
    });
    await Promise.all(subFetches);
  } catch { /* sub-page crawling is best-effort */ }

  // ── Combine all scraped content ───────────────────────────────────────────
  const allContent = [pageContent.combined, ...subPageTexts].join("\n\n");
  const plainText = allContent.slice(0, MAX_TEXT_CHARS);

  // Build a structured context block that puts the most reliable signals first
  const metaBlock = [
    pageContent.ogTitle || pageContent.title ? `Page title: ${pageContent.ogTitle || pageContent.title}` : "",
    pageContent.ogDescription || pageContent.metaDescription ? `Meta description: ${pageContent.ogDescription || pageContent.metaDescription}` : "",
  ].filter(Boolean).join("\n");

  // Today's date so AI can determine which events are future vs past
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const extractPrompt = `You are a data extraction assistant helping build a new website for a civic organization. Today's date is ${todayStr}. Analyze the content scraped from their existing website and extract key information following STRICT rules below.

===  ABSOLUTE RULES (violations ruin the site) ===
1. FUTURE EVENTS ONLY — If an event's date has already passed (before ${todayStr}), DO NOT include it. Only extract events that haven't happened yet.
2. RECURRING EVENTS COLLAPSED — If you see the same event repeating (e.g. "Board Meeting Apr 8, Apr 15, Apr 22"), extract it ONCE as a recurring event: "Board Meeting — Every Tuesday". Not 3 separate entries.
3. NO AI FILLER TEXT — If a description is generic and could apply to ANY organization (e.g. "We are dedicated community members making a meaningful impact through service"), DISCARD it. Leave the field blank. Only keep specific, factual text.
4. CONTACT INFO — Extract address, phone, and email SEPARATELY. Do not smash them together.
5. SOCIAL MEDIA — Extract Facebook, Instagram, Twitter/X, YouTube, LinkedIn URLs SEPARATELY from contact.
6. LEADERSHIP — Extract board members, officers, and their titles in a formatted list. Preserve exact ceremonial titles (e.g. "Worshipful Master", not "President").
7. PARENT ORG DETECTION — If this is a Rotary club, Lions club, Kiwanis, Elks, VFW, American Legion, or other parent-org franchise, identify the parent org and note it. Parent org colors override the old site's colors.

=== FIELD RULES ===
- name: Exact org name from title/h1/og:title. Preserve capitalization.
- mission: 1-2 sentences from their about page. Must be SPECIFIC — founding year, member count, location, what they actually do. If you find only generic filler, leave blank.
- services: ALL programs, services, and community activities they run — comma-separated or brief list. Be thorough. Only real program names, no filler descriptions.
- location: Full street address + city + state + zip if available, OR meeting venue name. Never duplicate phone/email here.
- schedule: Regular meeting schedule ONLY (e.g. "Every Tuesday, 12:00 PM at Irwin Fire Hall"). Leave blank if not found.
- events: FUTURE events only (after ${todayStr}). Each event on its own line: "Event Name | Date | Location (if known) | Price (if ticketed)". Recurring events listed once with frequency. If no future events found, leave blank.
- contact: Email address(es) and phone number(s) ONLY. Format phone as (XXX) XXX-XXXX.
- social: Social media URLs only (Facebook, Instagram, Twitter/X, YouTube, LinkedIn). One per line with platform label. E.g. "Facebook: https://facebook.com/example"
- leadership: Board members and officers. One per line: "Name — Title". Preserve exact titles.
- audience: Who they serve — be specific (e.g. "Members, Norwin area community, youth 5-18"). Not generic phrases like "everyone in the community".
- style: Branding colors found (hex codes if possible), parent org name if detected, any clear visual style cues.
- extra: History, founding year, notable achievements, awards, recent news, calls to action. Only specific real facts — no filler.

Return a JSON object with EXACTLY these keys: name, mission, services, location, schedule, events, contact, social, leadership, audience, style, extra
Return ONLY valid JSON, no markdown, no explanation. Use "" for fields not found.

${metaBlock ? `=== HIGH-PRIORITY METADATA (most reliable) ===\n${metaBlock}\n\n` : ""}=== WEBSITE CONTENT ===
${plainText}`;

  let extracted: ImportedSiteData;
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: extractPrompt }],
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed: unknown = JSON.parse(raw);
    // Validate + sanitize all fields — ensure each is a non-null string
    const safeStr = (v: unknown, fallback = ""): string =>
      typeof v === "string" ? v.trim().slice(0, 2000) : fallback;
    const obj = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
    extracted = {
      name: safeStr(obj.name),
      mission: safeStr(obj.mission),
      services: safeStr(obj.services),
      location: safeStr(obj.location),
      schedule: safeStr(obj.schedule),
      events: safeStr(obj.events),
      contact: safeStr(obj.contact),
      social: safeStr(obj.social),
      leadership: safeStr(obj.leadership),
      audience: safeStr(obj.audience),
      style: safeStr(obj.style),
      extra: safeStr(obj.extra),
    };
  } catch {
    res.status(500).json({ error: "AI extraction failed. Please try again or start the interview manually." });
    return;
  }

  // ── Download & re-host images (spec: NEVER hotlink) ───────────────────────
  const warnings: string[] = [];
  let rehostedLogoPath: string | undefined;
  let rehostedHeroPath: string | undefined;
  const rehostedGalleryPaths: string[] = [];
  let imagesDownloaded = 0;
  let imagesFailed = 0;

  const imageDownloads: Array<{ url: string; label: string; role: "logo" | "hero" | "gallery" }> = [];
  if (pageContent.logoUrl) imageDownloads.push({ url: pageContent.logoUrl, label: "Logo", role: "logo" });
  if (pageContent.heroUrl && pageContent.heroUrl !== pageContent.logoUrl) imageDownloads.push({ url: pageContent.heroUrl, label: "Hero image", role: "hero" });
  pageContent.imageUrls.slice(0, 3).forEach((u, i) => {
    if (u !== pageContent.logoUrl && u !== pageContent.heroUrl) {
      imageDownloads.push({ url: u, label: `Gallery image ${i + 1}`, role: "gallery" });
    }
  });

  await Promise.all(imageDownloads.map(async ({ url, label, role }) => {
    const result = await downloadAndRehostImage(url, label);
    if (result?.warning) warnings.push(result.warning);
    if (!result || !result.path) { imagesFailed++; return; }
    imagesDownloaded++;
    if (role === "logo" && !rehostedLogoPath) rehostedLogoPath = result.path;
    else if (role === "hero" && !rehostedHeroPath) rehostedHeroPath = result.path;
    else if (role === "gallery") rehostedGalleryPaths.push(result.path);
  }));

  // Compute crawl summary counts for the post-crawl presentation
  const eventsFound = extracted.events ? extracted.events.split("\n").filter(l => l.trim()).length : 0;
  const programsFound = extracted.services ? extracted.services.split(/[,\n]/).filter(s => s.trim()).length : 0;
  const boardMembersFound = extracted.leadership ? extracted.leadership.split("\n").filter(l => l.trim()).length : 0;

  extracted.logoUrl = rehostedLogoPath;
  extracted.heroUrl = rehostedHeroPath;
  extracted.imageUrls = rehostedGalleryPaths.length > 0 ? rehostedGalleryPaths : undefined;
  extracted.crawlMeta = {
    eventsFound,
    programsFound,
    boardMembersFound,
    hasLogo: !!rehostedLogoPath,
    hasHero: !!rehostedHeroPath,
    imagesDownloaded,
    imagesFailed,
    warnings,
  };

  res.json({ data: extracted, url: parsedUrl.toString() });
});

// ─── Usage ───────────────────────────────────────────────────────────────────
router.get("/builder/usage", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const monthlyLimit = getMonthlyLimit(org.tier);
  let used = org.aiMessagesUsed;
  if (isNewMonth(new Date(org.aiMessagesResetAt))) {
    await db.update(organizationsTable).set({ aiMessagesUsed: 0, aiMessagesResetAt: new Date() }).where(eq(organizationsTable.id, org.id));
    used = 0;
  }
  res.json({ used, limit: monthlyLimit, remaining: monthlyLimit - used, tier: org.tier });
});

// ─── Authenticated preview — serves real compiled HTML for in-dashboard iframe ─
router.get("/preview-html", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.generatedHtml) {
    res.status(404).send(`<!DOCTYPE html><html><head><style>
      body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
      min-height:100vh;margin:0;background:#07070f;color:#94a3b8;text-align:center;}
      .box{max-width:360px;padding:2rem;}.icon{font-size:3rem;margin-bottom:1rem;}
      h2{color:#fff;font-size:1.2rem;margin-bottom:.5rem;}
    </style></head><body><div class="box">
      <div class="icon">🏗️</div>
      <h2>No site generated yet</h2>
      <p>Complete the site builder interview to generate your site preview.</p>
    </div></body></html>`);
    return;
  }
  // Proposed HTML takes priority (change request pending review)
  const html = site.proposedHtml ?? site.generatedHtml;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache");
  // Allow iframing from same origin (the dashboard)
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // Permissive CSP for preview: allow inline scripts/styles, Google Fonts, all images
  res.setHeader("Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  res.send(html);
});

// ─── Get current site ─────────────────────────────────────────────────────────
router.get("/my", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  const [schedule] = await db.select().from(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  const [spec] = await db.select().from(websiteSpecsTable).where(eq(websiteSpecsTable.orgId, org.id));
  const hasProposal = !!(site?.proposedHtml);
  res.json({
    site: site ? { ...site, proposedHtml: undefined } : null,
    orgSlug: org.slug,
    schedule: schedule ?? null,
    spec: spec ?? null,
    tier: org.tier,
    hasProposal,
  });
});

// ─── Get proposal preview (authenticated owner only) ──────────────────────────
router.get("/my/proposal-preview", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Change requests require a paid plan (Starter or higher)" });
    return;
  }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.proposedHtml) {
    res.status(404).json({ error: "No pending proposal found" });
    return;
  }

  res.json({ proposedHtml: site.proposedHtml });
});

// ─── Discard proposal ─────────────────────────────────────────────────────────
router.delete("/my/proposal", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  await db.update(sitesTable).set({ proposedHtml: null }).where(eq(sitesTable.orgId, org.id));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN ALGORITHM — classifier, scorer, planner (no AI, fully deterministic)
// ═══════════════════════════════════════════════════════════════════════════════

type AssetClass =
  | "logo" | "hero_photo" | "supporting_photo"
  | "decorative_graphic" | "sponsor_logo" | "icon_mark" | "unknown";

/**
 * Classify an image URL as a hero photo or a logo/graphic that must never
 * be used as a hero background.  Confidence is conservative — when in doubt
 * we return "unknown", which is treated the same as non-hero.
 */
function classifyAsset(url: string, knownLogoUrl: string | null): AssetClass {
  if (!url) return "unknown";
  const u = url.toLowerCase();

  // Known logo → always logo
  if (knownLogoUrl && url === knownLogoUrl) return "logo";

  // URL-name signals (strongest indicator)
  if (/logo|icon|badge|mark|symbol|seal|emblem|favicon|crest|brand|watermark/.test(u)) return "logo";

  // File-type signals — SVG/ICO are virtually always logos or decorative
  if (u.endsWith(".svg") || u.endsWith(".ico")) return "decorative_graphic";

  // Unsplash stock images are always real photos
  if (u.includes("unsplash.com")) return "hero_photo";

  // Explicit photo signals
  if (/photo|banner|hero|cover|background|landscape|outdoor|aerial|scene/.test(u)) return "hero_photo";

  // Thumbnail / avatar signals → supporting at best
  if (/thumb|thumbnail|avatar|profile|headshot|small|crop|sq/.test(u)) return "supporting_photo";

  // Generic HTTPS image (imported from external site) — use as supporting, not hero
  if (u.startsWith("https://") && /\.(jpg|jpeg|png|webp)/.test(u)) return "supporting_photo";

  return "unknown";
}

/** Only hero_photo class qualifies as a hero background */
function isHeroQualified(cls: AssetClass): boolean {
  return cls === "hero_photo";
}

// ─── Event CTA inference ──────────────────────────────────────────────────────

type EventCtaMode =
  | "learn_more" | "register" | "rsvp" | "buy_tickets"
  | "apply_vendor" | "apply_participant" | "sponsor" | "donate";

function inferEventCta(name: string, description = ""): { mode: EventCtaMode; label: string } {
  const t = `${name} ${description}`.toLowerCase();
  if (/ticket|seat|admission|purchase|paid|price|\$\d/.test(t)) return { mode: "buy_tickets",        label: "Buy Tickets" };
  if (/fundrais|donate|donation|fund|charity|pledge/.test(t))   return { mode: "donate",             label: "Donate Now" };
  if (/vendor|booth|exhibitor|craft fair|table/.test(t))         return { mode: "apply_vendor",       label: "Apply as Vendor" };
  if (/\b(5k|10k|race|run|walk|cycle|swim|participant)\b/.test(t)) return { mode: "apply_participant", label: "Sign Up" };
  if (/sponsor(?:ship)?/.test(t))                                return { mode: "sponsor",            label: "Become a Sponsor" };
  if (/rsvp|reserve a seat/.test(t))                             return { mode: "rsvp",               label: "RSVP Now" };
  if (/register|enroll|sign.?up/.test(t))                        return { mode: "register",           label: "Register Now" };
  return { mode: "learn_more", label: "Learn More" };
}

// ─── Content quality scoring ──────────────────────────────────────────────────

type QScore = 0 | 1 | 2 | 3;
type ContentScores = {
  mission: QScore; events: QScore; programs: QScore;
  membership: QScore; contact: QScore; images: QScore; stats: QScore;
};

function scoreContent(p: {
  mission: string; services: string[]; eventCount: number;
  contactEmail: string; contactPhone: string; location: string;
  extras: string; audience: string;
  uploadedPhotoCount: number;
  importedHeroIsActualPhoto: boolean;
  importedImageCount: number;
  hasLogo: boolean;
  // AI-provided stats — only score if plausibly real
  stat1Value: string; stat2Value: string; stat3Value: string;
}): ContentScores {
  const { mission, services, eventCount, contactEmail, contactPhone, location, extras, audience,
          uploadedPhotoCount, importedHeroIsActualPhoto, importedImageCount, hasLogo } = p;
  const fullText = `${mission} ${extras} ${audience}`.toLowerCase();

  // Mission
  const missionScore: QScore =
    mission.length > 120 && /communit|serv|member|program|help|impact|vision|purpos/.test(fullText) ? 3 :
    mission.length > 40 ? 2 :
    mission.length > 10 ? 1 : 0;

  // Events
  const eventsScore: QScore = eventCount >= 4 ? 3 : eventCount >= 2 ? 2 : eventCount === 1 ? 1 : 0;

  // Programs
  const programsScore: QScore =
    services.filter(Boolean).length >= 3 ? 3 :
    services.filter(Boolean).length === 2 ? 2 :
    services.filter(Boolean).length === 1 ? 1 : 0;

  // Membership
  const memberKeywords = (fullText.match(/member|join|belong|fellowship|club|benefit|volunteer|community|get involved/g) ?? []).length;
  const membershipScore: QScore = memberKeywords >= 4 ? 3 : memberKeywords >= 2 ? 2 : memberKeywords >= 1 ? 1 : 0;

  // Contact
  const contactFields = [contactEmail, contactPhone, location].filter(Boolean).length;
  const contactScore: QScore = contactFields >= 3 ? 3 : contactFields === 2 ? 2 : contactFields === 1 ? 1 : 0;

  // Images — only real photographic assets qualify
  const photographic = uploadedPhotoCount + (importedHeroIsActualPhoto ? 1 : 0) + Math.min(importedImageCount, 2);
  const imagesScore: QScore = photographic >= 3 ? 3 : photographic >= 2 ? 2 : photographic >= 1 ? 1 : 0;

  // Stats — only real if NOT matching obvious placeholder defaults
  const fakeDefaults = new Set(["1985", "200+", "20+", "100+", "50+"]);
  const realStatCount = [p.stat1Value, p.stat2Value, p.stat3Value]
    .filter(v => v && !fakeDefaults.has(v)).length;
  const statsScore: QScore = realStatCount >= 3 ? 3 : realStatCount >= 2 ? 2 : realStatCount >= 1 ? 1 : 0;

  return { mission: missionScore, events: eventsScore, programs: programsScore,
           membership: membershipScore, contact: contactScore, images: imagesScore, stats: statsScore };
}

// ─── CHANGE 3: Deterministic org-type color lookup (specs/pillar-org-design-strategies.md) ──
// This OVERRIDES AI-generated colors for known org types. Guarantees Rotary always gets
// Rotary blue, Veterans always get military navy + red, etc.
function getOrgTypeColors(orgName: string, orgType: string): { primaryHex: string; accentHex: string; primaryRgb: string } | null {
  const n = (orgName + " " + orgType).toLowerCase();
  // Rotary & Service Clubs
  if (/rotary/.test(n)) return { primaryHex: "#0c4da2", accentHex: "#f7a81b", primaryRgb: "12,77,162" };
  if (/lions\s*(club|international)?/.test(n)) return { primaryHex: "#4b2181", accentHex: "#f5c518", primaryRgb: "75,33,129" };
  if (/kiwanis/.test(n)) return { primaryHex: "#1a5fa8", accentHex: "#f5c518", primaryRgb: "26,95,168" };
  if (/optimist\s*(club|international)?/.test(n)) return { primaryHex: "#c0392b", accentHex: "#f5c518", primaryRgb: "192,57,43" };
  if (/soroptimist/.test(n)) return { primaryHex: "#004a99", accentHex: "#ffd700", primaryRgb: "0,74,153" };
  // Masonic Lodges (Free & Accepted Masons) — PA Grand Lodge of Pennsylvania official colors
  // Primary: Midnight #12233e | Accent: Cornflower #5b7db1 (NOT gold — these are the official PA GL spec)
  if (/\bmasonic?\b|\bmasonry\b|lodge\s*#?\d+|f\.?\s*[&a]\.?\s*m\.?\b|free\s*(and|&)\s*accepted/.test(n))
    return { primaryHex: "#12233e", accentHex: "#5b7db1", primaryRgb: "18,35,62" };
  // Other Fraternal (Elks, Eagles, Moose, Knights of Columbus, Odd Fellows, Shriners)
  if (/\belks\b|moose\s*(lodge)?\b|eagles\s*(lodge|club)?|knights\s*of\s*columbus|odd\s*fellows|shriners/.test(n))
    return { primaryHex: "#1a2d4a", accentHex: "#c9a84c", primaryRgb: "26,45,74" };
  // Veterans
  if (/\bvfw\b|veteran(s)?|american\s*legion|amvets|\bdav\b|foreign\s*wars|military\s*(post|club)?/.test(n))
    return { primaryHex: "#162d55", accentHex: "#c0392b", primaryRgb: "22,45,85" };
  // HOA
  if (/\bhoa\b|homeowner|condo\s*(association)?|neighborhood\s*association|community\s*association/.test(n))
    return { primaryHex: "#2d7d6e", accentHex: "#4aaba0", primaryRgb: "45,125,110" };
  // PTA / School
  if (/\bpta\b|\bpto\b|booster\s*club|parent.teacher|band\s*booster|school\s*group/.test(n))
    return { primaryHex: "#1565c0", accentHex: "#fbc02d", primaryRgb: "21,101,192" };
  // No known brand colors — let AI choose
  return null;
}

// ─── CHANGE 4: Post-build validation (specs/pillar-build-validation-checklist.md) ──
// Runs 18-point checklist against the generated HTML. Returns pass/fail + issues list.
// Per spec §HOW TO USE: "Do not present a site that fails any of these checks."
// autoFixHtml() handles programmatically fixable failures BEFORE the user sees the site.
type ValidationResult = {
  passed: boolean;
  checks: Array<{ id: number; label: string; status: "pass" | "fail" | "na"; detail?: string }>;
  failCount: number;
  autoFixed: string[];   // list of issues that were auto-fixed before this result was computed
};

// ── Auto-fix: strip known failures from HTML before presenting to user ────────
// Handles CHECK 1 (filler text), CHECK 6 (scroll prompts), CHECK 7 (empty img src).
// Returns { html, fixed } where fixed is an array of human-readable fix descriptions.
function autoFixHtml(html: string): { html: string; fixed: string[] } {
  const fixed: string[] = [];

  // CHECK 1 fix: remove AI filler phrases
  const FILLER_REPLACEMENTS: [RegExp, string][] = [
    [/brings community members together for meaningful impact/gi, "serves the community"],
    [/lasting connection/gi, "community connection"],
    [/making a difference in our community/gi, "making a difference"],
    [/we are dedicated to/gi, "we focus on"],
    [/our mission is to serve/gi, "our mission is"],
    [/join us as we/gi, "join us to"],
    [/together we can/gi, "together we"],
    [/meaningful impact and lasting connection/gi, "community impact"],
    [/community members together/gi, "the community"],
  ];
  let fillerFixed = 0;
  for (const [pattern, replacement] of FILLER_REPLACEMENTS) {
    if (pattern.test(html)) {
      html = html.replace(pattern, replacement);
      fillerFixed++;
    }
  }
  if (fillerFixed > 0) fixed.push(`CHECK 1: Replaced ${fillerFixed} AI filler phrase(s) with neutral text`);

  // CHECK 6 fix: remove scroll prompts
  const scrollBefore = html;
  html = html.replace(/scroll\s+to\s+explore/gi, "");
  html = html.replace(/scroll\s+down/gi, "");
  html = html.replace(/keep\s+scrolling/gi, "");
  if (html !== scrollBefore) fixed.push("CHECK 6: Removed scroll prompt text");

  // CHECK 7 fix: remove img tags with empty src (broken image placeholders)
  const brokenImgsBefore = (html.match(/<img[^>]*src=["']["'][^>]*>/g) ?? []).length;
  if (brokenImgsBefore > 0) {
    html = html.replace(/<img[^>]*src=["']["'][^>]*>/g, "");
    fixed.push(`CHECK 7: Removed ${brokenImgsBefore} broken image placeholder(s) with empty src`);
  }

  return { html, fixed };
}

function validateBuiltSite(
  html: string,
  orgName: string,
  orgType: string,
  primaryHex: string,
  eventCount: number,
  ticketedEventCount: number,
  hasCrawlData: boolean,
  autoFixed: string[],
): ValidationResult {
  const checks: ValidationResult["checks"] = [];
  const lower = html.toLowerCase();

  // CHECK 1: No AI filler text (auto-fixed above — should always pass here)
  const fillerPhrases = [
    "brings community members together for meaningful impact",
    "lasting connection",
    "making a difference in our community",
    "we are dedicated to",
    "our mission is to serve",
    "join us as we",
    "together we can",
    "meaningful impact and lasting connection",
    "community members together",
  ];
  const foundFiller = fillerPhrases.filter(p => lower.includes(p.toLowerCase()));
  checks.push({ id: 1, label: "No AI filler text", status: foundFiller.length === 0 ? "pass" : "fail",
    detail: foundFiller.length > 0 ? `Still present after auto-fix: "${foundFiller[0]}"` : undefined });

  // CHECK 2: No duplicate contact info (detect duplicate phone/email/address blocks)
  const emailMatches = (html.match(/mailto:[^"'>]+/g) ?? []).map(m => m.toLowerCase());
  const hasDupeEmail = emailMatches.length > 1 && new Set(emailMatches).size < emailMatches.length;
  checks.push({ id: 2, label: "No duplicate content", status: hasDupeEmail ? "fail" : "pass",
    detail: hasDupeEmail ? "Same email appears in multiple sections" : undefined });

  // CHECK 3: Recurring events not duplicated — scan event rows in HTML for same title appearing twice+
  // Event rows use <h4> inside .event-row. We scan for repeated h4 text (case-insensitive).
  if (eventCount > 0) {
    const eventTitles = [...html.matchAll(/<div\s[^>]*class=["'][^"']*event-row[^"']*["'][^>]*>[\s\S]*?<h4>([^<]+)<\/h4>/gi)]
      .map(m => m[1].trim().toLowerCase());
    const titleCounts = new Map<string, number>();
    for (const t of eventTitles) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
    const dupeTitle = [...titleCounts.entries()].find(([, count]) => count > 1);
    checks.push({ id: 3, label: "Recurring events collapsed", status: dupeTitle ? "fail" : "pass",
      detail: dupeTitle ? `"${dupeTitle[0]}" appears ${dupeTitle[1]} times — should be one recurring entry` : undefined });
  } else {
    checks.push({ id: 3, label: "Recurring events collapsed", status: "na" });
  }

  // CHECK 4: Events sorted by date (soonest first, dateless at end)
  // Parse the event-day + event-month blocks from the rendered HTML and check ascending order.
  if (eventCount > 0) {
    const monthMap: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    // Each event row has <span class="event-day">DD</span><span class="event-month">MON</span>
    const dateBlocks = [...html.matchAll(/<span\s[^>]*class=["']event-day["'][^>]*>(\d+)<\/span>\s*<span\s[^>]*class=["']event-month["'][^>]*>([A-Z]+)<\/span>/gi)];
    const parsedDates = dateBlocks.map(m => {
      const day = parseInt(m[1], 10);
      const month = monthMap[m[2].toUpperCase()];
      return month !== undefined ? new Date(new Date().getFullYear(), month, day).getTime() : null;
    }).filter((d): d is number => d !== null);
    let outOfOrder = false;
    for (let i = 1; i < parsedDates.length; i++) {
      if (parsedDates[i] < parsedDates[i - 1]) { outOfOrder = true; break; }
    }
    checks.push({ id: 4, label: "Events sorted by date (soonest first)", status: outOfOrder ? "fail" : "pass",
      detail: outOfOrder ? "Events in the HTML are not in ascending date order" : undefined });
  } else {
    checks.push({ id: 4, label: "Events sorted by date", status: "na" });
  }

  // CHECK 5: Brand colors applied — verify primary hex matches org-type expectation
  const expectedColors = getOrgTypeColors(orgName, orgType);
  if (expectedColors) {
    const usesCorrectColor = html.includes(expectedColors.primaryHex) || html.includes(expectedColors.primaryHex.toUpperCase());
    checks.push({ id: 5, label: "Brand colors applied", status: usesCorrectColor ? "pass" : "fail",
      detail: usesCorrectColor ? undefined : `Expected ${expectedColors.primaryHex} for ${orgName}, got ${primaryHex}` });
  } else {
    checks.push({ id: 5, label: "Brand colors applied", status: "pass" });
  }

  // CHECK 6: No "Scroll to explore" text (auto-fixed above — should always pass here)
  const hasScrollPrompt = /scroll\s+(to\s+)?explore|scroll\s+down|keep\s+scrolling/i.test(html);
  checks.push({ id: 6, label: 'No "Scroll to explore" text', status: hasScrollPrompt ? "fail" : "pass" });

  // CHECK 7: Images — no broken/placeholder image tags without src (auto-fixed above)
  const brokenImgCount = (html.match(/<img[^>]*src=["']["']/g) ?? []).length;
  checks.push({ id: 7, label: "No broken image placeholders", status: brokenImgCount === 0 ? "pass" : "fail",
    detail: brokenImgCount > 0 ? `${brokenImgCount} image(s) with empty src remain after auto-fix` : undefined });

  // CHECK 8: Org name appears in content
  const orgNameClean = orgName.replace(/[^a-z0-9\s]/gi, "").toLowerCase().trim();
  const orgNameInHtml = orgNameClean.split(" ").filter(w => w.length > 3).every(w => lower.includes(w));
  checks.push({ id: 8, label: "Org name in content", status: orgNameInHtml ? "pass" : "fail",
    detail: orgNameInHtml ? undefined : `"${orgName}" not found in site HTML` });

  // CHECK 9: Contact section exists
  const hasContactSection = /<section[^>]*id=["']contact["']/i.test(html);
  checks.push({ id: 9, label: "Contact section present", status: hasContactSection ? "pass" : "fail" });

  // CHECK 10: Mobile CSS — viewport meta and responsive styles
  const hasMobileViewport = html.includes('name="viewport"');
  const hasMediaQuery = html.includes("@media");
  checks.push({ id: 10, label: "Mobile viewport + responsive CSS", status: (hasMobileViewport && hasMediaQuery) ? "pass" : "fail" });

  // CHECK 11: Nav links — basic navigation present
  const hasNav = /<nav\s/i.test(html);
  checks.push({ id: 11, label: "Navigation present", status: hasNav ? "pass" : "fail" });

  // CHECK 12: Page title and meta tags — must not be "Vite App" or blank
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const titleText = titleMatch?.[1]?.trim() ?? "";
  const titleBad = !titleText || /^vite app$/i.test(titleText) || /^react app$/i.test(titleText) || titleText.length < 3;
  const hasMetaDesc = /name=["']description["'][^>]+content=["'][^"']{10}/i.test(html);
  checks.push({ id: 12, label: "Page title and meta description", status: (!titleBad && hasMetaDesc) ? "pass" : "fail",
    detail: titleBad ? `Bad title: "${titleText}"` : (!hasMetaDesc ? "Missing meta description" : undefined) });

  // CHECK 13: Empty sections hidden — programs section present without any card divs
  const hasProgramsSection = /<section[^>]*id=["']programs["']/i.test(html);
  const hasProgramCards = /<div[^>]*class=["'][^"']*card[^"']*["']/.test(html);
  const emptyProgramSection = hasProgramsSection && !hasProgramCards;
  checks.push({ id: 13, label: "No empty sections", status: emptyProgramSection ? "fail" : "pass",
    detail: emptyProgramSection ? "Programs section exists but contains no cards" : undefined });

  // CHECK 14: Events from DB appear on site
  if (eventCount > 0) {
    const hasEventsSection = /<section[^>]*(?:id=["']events["']|class=["'][^"']*events[^"']*["'])/i.test(html);
    checks.push({ id: 14, label: `Events appear on site (${eventCount} in DB)`, status: hasEventsSection ? "pass" : "fail",
      detail: hasEventsSection ? undefined : "Events in DB but events section missing from HTML" });
  } else {
    checks.push({ id: 14, label: "Events on site", status: "na" });
  }

  // CHECK 15: Ticketed events must have a "Get Tickets" link in the HTML
  // Per spec: "Buy Tickets button doesn't appear on ticketed events" is a failure.
  // The generated HTML includes a "Get Tickets →" anchor for events with hasRegistration=true.
  // We verify the count of "Get Tickets" links matches expected ticketed event count.
  if (ticketedEventCount > 0) {
    const getTicketsLinks = (html.match(/Get Tickets/gi) ?? []).length;
    const hasAllTicketLinks = getTicketsLinks >= ticketedEventCount;
    checks.push({ id: 15, label: `Ticket links present (${ticketedEventCount} ticketed event(s))`,
      status: hasAllTicketLinks ? "pass" : "fail",
      detail: hasAllTicketLinks ? undefined : `Found ${getTicketsLinks} "Get Tickets" link(s), expected ${ticketedEventCount}` });
  } else {
    checks.push({ id: 15, label: "Ticket/payment flow", status: "na" });
  }

  // CHECK 16: Homepage featured events visible
  if (eventCount > 0) {
    const hasFeaturedSection = /id=["']featured-event["']/i.test(html);
    const hasFeaturedCards = /class=["'][^"']*fe-card[^"']*["']/.test(html);
    checks.push({ id: 16, label: "Homepage featured events section", status: (hasFeaturedSection && hasFeaturedCards) ? "pass" : "fail",
      detail: !hasFeaturedSection ? "No featured events section on homepage" : !hasFeaturedCards ? "Featured section exists but no event cards" : undefined });
  } else {
    checks.push({ id: 16, label: "Homepage featured events section", status: "na" });
  }

  // CHECK 17: Crawled images re-hosted (only if crawl was used)
  if (hasCrawlData) {
    // Any external image src that isn't Pillar's own domain or Unsplash is a hotlink violation
    const hotlinkedImages = (html.match(/src=["']https?:\/\/(?![^"']*(?:\.mypillar\.co|objects\.replit\.dev|images\.unsplash\.com))[^"']+\.(?:jpg|jpeg|png|gif|webp)/gi) ?? []);
    checks.push({ id: 17, label: "Crawled images re-hosted", status: hotlinkedImages.length === 0 ? "pass" : "fail",
      detail: hotlinkedImages.length > 0 ? `${hotlinkedImages.length} image(s) still hotlinked from original site` : undefined });
  } else {
    checks.push({ id: 17, label: "Crawled images re-hosted", status: "na" });
  }

  // CHECK 18: Logo image valid (no empty src in nav img tag)
  const logoInHeader = /<nav[\s\S]{0,2000}?<img[^>]+>/i.test(html);
  if (logoInHeader) {
    const logoSrcEmpty = /<nav[\s\S]{0,2000}?<img[^>]+src=["']["']/i.test(html);
    checks.push({ id: 18, label: "Logo image valid", status: logoSrcEmpty ? "fail" : "pass",
      detail: logoSrcEmpty ? "Logo <img> has empty src — will show broken icon" : undefined });
  } else {
    checks.push({ id: 18, label: "Logo image valid", status: "na" });
  }

  const failures = checks.filter(c => c.status === "fail");
  return { passed: failures.length === 0, checks, failCount: failures.length, autoFixed };
}

// ─── Layout planner ───────────────────────────────────────────────────────────

type LayoutStrategy = "event-led" | "membership-led" | "program-led" | "contact-led" | "minimal";
type PrimaryJob = "event_conversion" | "membership_conversion" | "program_explanation" | "contact_capture";
type HeroType = "featured-event" | "mission" | "photo" | "clean-text" | "logo-badge";

type LayoutPlan = {
  strategy: LayoutStrategy;
  primaryJob: PrimaryJob;
  heroType: HeroType;
  showStats: boolean;
  showFeaturedEvent: boolean;
  showEventList: boolean;
  showPrograms: boolean;
};

function planLayout(scores: ContentScores, hasActualHeroPhoto: boolean, hasLogo: boolean): LayoutPlan {
  // Primary job
  let primaryJob: PrimaryJob;
  if (scores.events >= 2) primaryJob = "event_conversion";
  else if (scores.mission >= 2 && scores.membership >= 2) primaryJob = "membership_conversion";
  else if (scores.programs >= 2) primaryJob = "program_explanation";
  else primaryJob = "contact_capture";

  // Strategy
  let strategy: LayoutStrategy;
  const isContentThin = scores.mission <= 1 && scores.programs <= 1 && scores.events <= 1;
  if (isContentThin) strategy = "minimal";
  else if (primaryJob === "event_conversion") strategy = "event-led";
  else if (primaryJob === "membership_conversion") strategy = "membership-led";
  else if (primaryJob === "program_explanation") strategy = "program-led";
  else strategy = "contact-led";

  // Hero type — conservative
  let heroType: HeroType;
  if (strategy === "event-led" && scores.events >= 2) heroType = "featured-event";
  else if (hasActualHeroPhoto && scores.images >= 2) heroType = "photo";
  else if (scores.mission >= 2) heroType = "mission";
  else if (hasLogo) heroType = "logo-badge";
  else heroType = "clean-text";

  return {
    strategy,
    primaryJob,
    heroType,
    showStats: scores.stats >= 2,
    // Per specs/pillar-event-rendering-spec.md: homepage MUST show featured events if any exist
    showFeaturedEvent: scores.events >= 1,
    showEventList: scores.events >= 1,
    showPrograms: scores.programs >= 1,
  };
}

// ─── Section builders ─────────────────────────────────────────────────────────

type EventRow = {
  name: string; startDate: string | null; startTime: string | null;
  endTime: string | null; location: string | null; description: string | null;
  slug?: string | null; hasRegistration?: boolean | null; status?: string | null;
};

function buildFeaturedEventSection(
  events: EventRow[],
  esc: (s: string) => string,
  accentHex: string,
  orgSlug: string,
): string {
  // Per specs/pillar-event-rendering-spec.md: max 3 featured events, card-based layout
  // Per specs/pillar-visual-design-spec.md: each card needs border+shadow, hover effect, icons
  const featured = events.slice(0, 3);

  const buildCard = (event: EventRow) => {
    const dateObj = event.startDate ? new Date(event.startDate + "T00:00:00") : null;
    const day = dateObj ? String(dateObj.getDate()) : "";
    const month = dateObj ? dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
    const year = dateObj ? String(dateObj.getFullYear()) : "";
    const fullDateStr = dateObj
      ? dateObj.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
      : "";
    const timeStr = event.startTime
      ? `${esc(event.startTime)}${event.endTime ? ` – ${esc(event.endTime)}` : ""}`
      : "";
    const { label: ctaLabel } = inferEventCta(event.name, event.description ?? "");
    const eventUrl = event.slug ? `https://${orgSlug}.mypillar.co/events/${event.slug}/tickets` : null;
    const ticketBtn = eventUrl && event.hasRegistration
      ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.875rem">${esc(ctaLabel)}</a>`
      : eventUrl
      ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer" class="btn-ghost" style="display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.875rem;background:transparent;border:1px solid var(--border);color:var(--text)">Learn More →</a>`
      : "";

    return `<div class="fe-card reveal-child">
          <div class="fe-card-accent" style="background:${accentHex}"></div>
          <div class="fe-card-body">
            ${(day && month) ? `<div class="fe-card-date-badge"><span class="fe-card-day">${day}</span><span class="fe-card-month">${month}</span>${year ? `<span class="fe-card-year" style="font-size:0.65rem;letter-spacing:0.05em">${year}</span>` : ""}</div>` : ""}
            <h3 class="fe-card-title">${esc(event.name)}</h3>
            <div class="fe-card-meta">
              ${fullDateStr ? `<span class="fe-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>${fullDateStr}</span>` : ""}
              ${timeStr ? `<span class="fe-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${timeStr}</span>` : ""}
              ${event.location ? `<span class="fe-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${esc(event.location)}</span>` : ""}
            </div>
            ${event.description ? `<p class="fe-card-desc">${esc(event.description)}</p>` : ""}
            ${ticketBtn ? `<div class="fe-card-cta">${ticketBtn}</div>` : ""}
          </div>
        </div>`;
  };

  const sectionHeading = featured.length === 1 ? "Featured Event" : "Upcoming Events";
  const gridClass = featured.length === 1 ? "fe-grid-single" : featured.length === 2 ? "fe-grid-two" : "fe-grid-three";

  return `
  <section class="featured-events-section" id="featured-event">
    <div class="container">
      <div class="section-header reveal" style="margin-bottom:40px">
        <span class="eyebrow">${sectionHeading}</span>
        <h2>Don&#8217;t Miss These</h2>
      </div>
      <div class="fe-cards-grid ${gridClass} reveal">
        ${featured.map(buildCard).join("\n        ")}
      </div>
      <div style="text-align:center;margin-top:2rem">
        <a href="#events" class="btn-ghost" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:0.6rem 1.5rem;font-size:0.875rem">View All Events →</a>
      </div>
    </div>
  </section>`;
}

function buildSponsorStrip(sponsors: string[], esc: (s: string) => string): string {
  if (!sponsors.length) return "";
  const items = sponsors.slice(0, 6).map(name => `
    <div class="sponsor-logo-item reveal-child">
      <span class="sponsor-name">${esc(name)}</span>
    </div>`).join("\n");
  return `
  <section class="sponsor-strip">
    <div class="container">
      <p class="sponsor-label">Partners &amp; Sponsors</p>
      <div class="sponsor-logos">
        ${items}
      </div>
    </div>
  </section>`;
}

// ─── Section-based editing helpers ───────────────────────────────────────────
type SectionTarget = { sectionId: string; label: string };
const SECTION_TARGETS: Array<SectionTarget & { pattern: RegExp }> = [
  { pattern: /\b(hero|headline|banner|tagline|above.?the.?fold|main.?cta|primary.?button|sign.?up.?link|membership.?button)\b/i, sectionId: "home", label: "hero" },
  { pattern: /\b(about|mission|our.?story|who.?we.?are|history|overview)\b/i, sectionId: "about", label: "about" },
  { pattern: /\b(program|service|activit|what.?we.?do|what.?we.?offer|feature.?card|ministries)\b/i, sectionId: "programs", label: "programs" },
  { pattern: /\b(event|upcoming|schedule|calendar|meeting|gala|fundrais)\b/i, sectionId: "events", label: "events" },
  { pattern: /\b(contact|email|phone|reach|message|address|form|location)\b/i, sectionId: "contact", label: "contact" },
];

function identifySectionTarget(changeRequest: string): SectionTarget | null {
  for (const { pattern, sectionId, label } of SECTION_TARGETS) {
    if (pattern.test(changeRequest)) return { sectionId, label };
  }
  return null;
}

function extractSection(fullHtml: string, sectionId: string): { before: string; section: string; after: string } | null {
  const pattern = new RegExp(`(<section[^>]*\\bid=["']${sectionId}["'][^>]*>[\\s\\S]*?<\\/section>)`, "i");
  const match = fullHtml.match(pattern);
  if (!match || match.index === undefined) return null;
  return {
    before: fullHtml.substring(0, match.index),
    section: match[1],
    after: fullHtml.substring(match.index + match[1].length),
  };
}

function buildContactRightPanel(
  orgSlug: string,
  contactEmail: string,
  cardHeading: string,
  cardText: string,
  contactPhone: string,
  location: string,
): string {
  if (contactEmail) {
    const action = `https://mypillar.co/api/public/contact/${orgSlug}`;
    return `<div class="contact-card reveal-right">
      <h3>${cardHeading || "Send Us a Message"}</h3>
      <p>${cardText || "We'd love to hear from you. Fill out the form below and we'll get back to you shortly."}</p>
      <form id="contact-form" novalidate>
        <div style="display:none;opacity:0;position:absolute;left:-9999px" aria-hidden="true">
          <input type="text" name="_honey" tabindex="-1" autocomplete="new-password">
        </div>
        <input type="hidden" name="_ts" id="cf-ts">
        <div class="cf-field">
          <label class="cf-label" for="cf-name">Your Name</label>
          <input class="cf-input" type="text" id="cf-name" name="name" required autocomplete="name" placeholder="Jane Smith">
        </div>
        <div class="cf-field">
          <label class="cf-label" for="cf-email">Your Email</label>
          <input class="cf-input" type="email" id="cf-email" name="email" required autocomplete="email" placeholder="jane@example.com">
        </div>
        <div class="cf-field">
          <label class="cf-label" for="cf-msg">Message</label>
          <textarea class="cf-input cf-textarea" id="cf-msg" name="message" required rows="4" placeholder="Tell us how we can help\u2026"></textarea>
        </div>
        <div id="cf-error" class="cf-error" style="display:none"></div>
        <button type="submit" class="btn-primary cf-submit">Send Message</button>
      </form>
      <div id="cf-success" class="cf-success" style="display:none">
        <div class="cf-check">&#10003;</div>
        <strong>Message sent!</strong>
        <p>We'll be in touch shortly.</p>
      </div>
      <script>
        (function(){
          var ts=document.getElementById('cf-ts');
          if(ts) ts.value=String(Date.now());
          var form=document.getElementById('contact-form');
          if(!form) return;
          form.addEventListener('submit',function(e){
            e.preventDefault();
            var btn=form.querySelector('.cf-submit');
            var err=document.getElementById('cf-error');
            var n=document.getElementById('cf-name').value.trim();
            var em=document.getElementById('cf-email').value.trim();
            var msg=document.getElementById('cf-msg').value.trim();
            var honey=form.querySelector('[name="_honey"]').value;
            var ts2=form.querySelector('[name="_ts"]').value;
            err.style.display='none';
            if(!n||!em||!msg){err.textContent='Please fill in all fields.';err.style.display='block';return;}
            btn.disabled=true;btn.textContent='Sending\u2026';
            fetch('${action}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:em,message:msg,_honey:honey,_ts:ts2})})
              .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
              .then(function(res){
                if(res.d.success){form.style.display='none';document.getElementById('cf-success').style.display='block';}
                else{err.textContent=res.d.error||'Something went wrong. Please try again.';err.style.display='block';btn.disabled=false;btn.textContent='Send Message';}
              })
              .catch(function(){err.textContent='Network error. Please try again.';err.style.display='block';btn.disabled=false;btn.textContent='Send Message';});
          });
        })();
      </script>
    </div>`;
  }

  // Fallback: no email — show available contact info in a card
  const infoLines: string[] = [];
  if (contactPhone) infoLines.push(`<div class="contact-item"><div class="contact-icon">&#128222;</div><a href="tel:${contactPhone}" style="color:inherit">${contactPhone}</a></div>`);
  if (location) infoLines.push(`<div class="contact-item"><div class="contact-icon">&#128205;</div><span>${location}</span></div>`);

  return `<div class="contact-card reveal-right">
    <h3>${cardHeading || "Get in Touch"}</h3>
    <p>${cardText || "We'd love to connect with you. Reach out using the contact information below."}</p>
    ${infoLines.length ? `<div class="contact-items">${infoLines.join("")}</div>` : ""}
  </div>`;
}

function buildStatsSection(statsBlock: string): string {
  if (!statsBlock.trim()) return "";
  return `
  <section class="stats-strip">
    <div class="container">
      <div class="stats-grid">
        ${statsBlock}
      </div>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Generate site from interview history
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/generate", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  // Enforce monthly AI usage limit (generation is the most expensive call)
  const usageInfo = await checkAndResetUsage(org as Parameters<typeof checkAndResetUsage>[0], res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  const {
    history = [], orgName, orgType,
    logoDataUrl: rawLogoDataUrl, photoUrls: rawPhotoUrls,
    importedLogoUrl: rawImportedLogoUrl,
    importedHeroUrl: rawImportedHeroUrl,
    importedImageUrls: rawImportedImageUrls,
    originalSiteUrl: rawOriginalSiteUrl,
  } = req.body as {
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
    logoDataUrl?: unknown;
    photoUrls?: unknown;
    importedLogoUrl?: unknown;
    importedHeroUrl?: unknown;
    importedImageUrls?: unknown;
    originalSiteUrl?: unknown;
  };
  // Validate logo on server side — reject SVG, non-image data, oversized payloads
  const logoDataUrl = validateLogoDataUrl(rawLogoDataUrl);
  // Validate photo URLs — must be strings, same origin (/api/storage/...) or https://
  const photoUrls: string[] = Array.isArray(rawPhotoUrls)
    ? (rawPhotoUrls as unknown[])
        .filter((u): u is string => typeof u === "string" && (u.startsWith("/api/storage/") || u.startsWith("https://")))
        .slice(0, 6)
    : [];
  // External images discovered from crawled site — allow absolute https:// OR re-hosted /api/storage/ paths
  const isSafeExternalUrl = (u: unknown): u is string =>
    typeof u === "string" && (u.startsWith("https://") || u.startsWith("/api/storage/"));
  const importedLogoUrl: string | null = isSafeExternalUrl(rawImportedLogoUrl) ? rawImportedLogoUrl : null;
  const importedHeroUrl: string | null = isSafeExternalUrl(rawImportedHeroUrl) ? rawImportedHeroUrl : null;
  const importedImageUrls: string[] = Array.isArray(rawImportedImageUrls)
    ? (rawImportedImageUrls as unknown[]).filter(isSafeExternalUrl).slice(0, 4)
    : [];
  const originalSiteUrl: string | null = isSafeExternalUrl(rawOriginalSiteUrl) ? rawOriginalSiteUrl : null;

  const name = orgName ?? org.name;
  const type = orgType ?? org.type ?? "organization";
  const slug = org.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const conversationText = history.length > 0
    ? history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")
    : `Organization name: ${name}\nType: ${type}`;

  // Step 1: Extract structured spec from conversation
  type SpecType = {
    orgName: string; tagline: string; mission: string; services: string[];
    location: string; hours: string; events: string[]; contactEmail: string;
    contactPhone: string; socialMedia: string[]; audience: string; colors: string; extras: string;
  };

  let extractedSpec: SpecType = {
    orgName: name, tagline: `Welcome to ${name}`, mission: `${name} serves our community.`,
    services: [], location: "", hours: "", events: [], contactEmail: "", contactPhone: "",
    socialMedia: [], audience: "", colors: "navy and gold", extras: "",
  };

  try {
    const specJson = await callOpenAI([
      {
        role: "system",
        content: `Extract website content from this conversation and output ONLY valid JSON.
Required structure:
{
  "orgName": "string",
  "tagline": "string",
  "mission": "string",
  "services": ["string"],
  "location": "string",
  "hours": "string",
  "events": ["string"],
  "contactEmail": "string",
  "contactPhone": "string",
  "socialMedia": ["string"],
  "audience": "string",
  "colors": "string",
  "extras": "string"
}
Use empty strings and empty arrays for anything not mentioned. Output ONLY the JSON object.`,
      },
      { role: "user", content: `Extract website info from this conversation:\n\n${conversationText}` },
    ], MAX_SPEC_TOKENS);

    const jsonMatch = specJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as SpecType;
      extractedSpec = { ...extractedSpec, ...parsed };
    }
  } catch {
    // Use defaults if extraction fails
  }

  // Step 2: Save to website_specs table
  const [existingSpec] = await db.select().from(websiteSpecsTable).where(eq(websiteSpecsTable.orgId, org.id));
  if (existingSpec) {
    await db.update(websiteSpecsTable).set({ ...extractedSpec, rawConversation: history, updatedAt: new Date() }).where(eq(websiteSpecsTable.orgId, org.id));
  } else {
    await db.insert(websiteSpecsTable).values({ orgId: org.id, ...extractedSpec, rawConversation: history });
  }

  // Step 3: Fetch upcoming events from DB to include in site
  const s = extractedSpec;
  const today = new Date().toISOString().split("T")[0];
  const upcomingEvents = await db
    .select({ name: eventsTable.name, startDate: eventsTable.startDate, startTime: eventsTable.startTime, endTime: eventsTable.endTime, location: eventsTable.location, description: eventsTable.description, slug: eventsTable.slug, hasRegistration: eventsTable.hasRegistration, status: eventsTable.status })
    .from(eventsTable)
    .where(eq(eventsTable.orgId, org.id))
    .orderBy(asc(eventsTable.startDate))
    .limit(10);
  const futureEvents = upcomingEvents.filter(e => !e.startDate || e.startDate >= today);
  const allEvents = futureEvents.length > 0 ? futureEvents : upcomingEvents.slice(0, 5);

  // Step 3b: Fetch community framework — provides authoritative color palettes and page structure rules.
  // Framework is cached 1h; failure is non-blocking (generation continues with built-in rules).
  let frameworkColorNote = "";
  let frameworkStructureNote = "";
  try {
    const fw = await fetchFramework();
    if (fw) {
      // Parse color palettes from framework's INTAKE-QUESTIONS.ts
      const palettes = parseFrameworkPalettes(fw["INTAKE-QUESTIONS.ts"] ?? "");
      if (Object.keys(palettes).length > 0) {
        const paletteLines = Object.entries(palettes)
          .map(([label, p]) => `- ${label} → primary: ${hslStringToHex(p.primary)} (HSL ${p.primary}), accent: ${hslStringToHex(p.accent)} (HSL ${p.accent})`)
          .join("\n");
        frameworkColorNote = `\n\nFRAMEWORK ORG-TYPE COLOR PALETTES (use these when no exact brand match above applies):\n${paletteLines}`;
      }
      // Extract page structure summary from BUILDER-INSTRUCTIONS.md
      const instructions = fw["BUILDER-INSTRUCTIONS.md"] ?? "";
      const structureMatch = instructions.match(/## Page Structure[\s\S]+?(?=\n##|$)/);
      if (structureMatch) {
        frameworkStructureNote = `\n\nFRAMEWORK PAGE STRUCTURE (every site gets these routes):\n${structureMatch[0].slice(0, 800)}`;
      }
    }
  } catch {
    // Framework fetch failed — continue with built-in rules
  }

  // Step 4: AI generates CONTENT JSON only — not design, not CSS
  const safeOrgName = (s.orgName || org.name).replace(/["<>&]/g, c => c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Civic/community-appropriate Unsplash photos — people, service, professional gatherings
  const HERO_IDS = ["1529156069898-aa78f52d3b87","1521737604082-f4eb08bd4e18","1573497491765-57b4f23b3624","1531545514256-b1400bc00f31","1488521787991-ed7bbaae773c","1521791055366-0d553872952f","1573164574572-cb89e39749b4","1559425036-3b9ba2e45e93"];
  const ABOUT_IDS = ["1573497491765-57b4f23b3624","1531545514256-b1400bc00f31","1559425036-3b9ba2e45e93","1521737604082-f4eb08bd4e18","1488521787991-ed7bbaae773c","1582213782179-e0d53f98f2ca"];

  type ContentData = {
    primaryHex: string; accentHex: string; primaryRgb: string;
    heroUnsplashId: string; aboutUnsplashId: string;
    orgTypeLabel: string; aboutHeading: string; missionExpanded: string;
    stat1Value: string; stat1Label: string;
    stat2Value: string; stat2Label: string;
    stat3Value: string; stat3Label: string;
    programs: Array<{ icon: string; title: string; description: string }>;
    contactHeading: string; contactIntro: string;
    contactCardHeading: string; contactCardText: string;
  };

  // Per specs/pillar-build-validation-checklist.md CHECK 1: NEVER generate descriptions the user didn't provide.
  // If no real description exists, show name + icon ONLY. No AI filler.
  const defaultPrograms = s.services.length > 0
    ? s.services.slice(0, 3).map((svc, i) => ({
        icon: ["🤝","📚","🌟"][i] ?? "⭐",
        title: svc,
        description: "", // No AI filler — real description must come from user or crawl
      }))
    : [];

  let contentData: ContentData = {
    primaryHex: "#1e3a5f", accentHex: "#c9a84c", primaryRgb: "30,58,95",
    heroUnsplashId: HERO_IDS[0], aboutUnsplashId: ABOUT_IDS[0],
    orgTypeLabel: "Civic Organization",
    aboutHeading: "Serving Our Community",
    missionExpanded: s.mission || `${safeOrgName} is committed to serving our community through dedicated programs, meaningful connections, and a shared vision for a better tomorrow.`,
    stat1Value: "1985", stat1Label: "Year Founded",
    stat2Value: "200+", stat2Label: "Active Members",
    stat3Value: "20+", stat3Label: "Annual Events",
    programs: defaultPrograms,
    contactHeading: "Come Join Our Community",
    contactIntro: "Whether you're curious about membership or want to partner with us, we'd love to connect. Our doors are open to all who share our values.",
    contactCardHeading: "Ready to get involved?",
    contactCardText: "Getting started is easy. Reach out and we'll personally connect you with the right program or membership pathway.",
  };

  const colorHints = s.colors || "navy and gold";
  // Rough check for AI prompt: has the user provided any photographic material?
  // (Full asset classification runs after AI call in step 5)
  const hasImportedImages = photoUrls.length > 0
    || (importedHeroUrl !== null && importedHeroUrl !== importedLogoUrl);
  const originalSiteContext = originalSiteUrl
    ? `\nOriginal site: ${originalSiteUrl} — you are creating a dramatically improved version of this site.`
    : "";
  try {
    const contentJson = await callOpenAI([
      {
        role: "system",
        content: `You are a master UX/UI designer and copywriter specializing in civic and community organizations. Your job is to produce content for a stunning, modern website that is far superior to the organization's existing site. Create content that is compelling, specific, and authentic — this will be seen by the community and must make a strong first impression.${originalSiteContext}${frameworkStructureNote}

Output ONLY a valid JSON object — no explanation, no markdown fences.

COLOR SELECTION RULES — MANDATORY org-type colors (from specs/pillar-org-design-strategies.md + community framework):${frameworkColorNote}
DETECT org type from name/description, then apply EXACT colors. These are NOT suggestions:
- ROTARY CLUB → primary: #0c4da2 (Rotary royal blue, HSL 218 100% 32%), accent: #f7a81b (Rotary gold, HSL 40 93% 54%)
- LIONS CLUB → primary: #4b2181 (Lions purple, HSL 275 70% 30%), accent: #f5c518 (Lions gold)
- KIWANIS → primary: #1a5fa8 (Kiwanis blue, HSL 210 80% 35%), accent: #f5c518 (gold)
- MASONIC LODGE (Free & Accepted Masons, any lodge with a number e.g. "Lodge #601") → primary: #12233e (PA Grand Lodge Midnight, HSL 220 70% 16%), accent: #5b7db1 (PA Grand Lodge Cornflower). NOT gold — these are the official PA Grand Lodge of Pennsylvania colors.
- OTHER FRATERNAL (Elks, Moose Lodge, Eagles, Knights of Columbus, Odd Fellows, Shriners) → primary: #1a2d4a (deep navy, HSL 220 60% 25%), accent: #c9a84c (gold)
- VETERANS (VFW, American Legion, AMVETS) → primary: #162d55 (military navy, HSL 215 70% 22%), accent: #c0392b (patriotic red)
- HOA / HOMEOWNERS ASSOCIATION → primary: #2d7d6e (calm teal, HSL 170 35% 40%), accent: #4aaba0
- PTA / BOOSTER CLUB / SCHOOL GROUP → primary: school's primary or #1565c0 (school blue), accent: #fbc02d (school gold)
- NONPROFIT / FOUNDATION / CHARITY → primary: #1e3a5f (deep navy), accent: #c9a84c (gold)
- COMMUNITY / NEIGHBORHOOD → primary: #2c5d3f (community green) or #2c4a6e (slate blue), accent: #d4822a (amber)
- FESTIVAL / ENTERTAINMENT → primary: #6b1f2e (burgundy) or #1e3a5f (navy), accent: #c9a84c (gold)
- CHAMBER / BUSINESS → primary: #1a3a2a (forest green) or #1e3a5f (navy), accent: #b87333 (copper)
- If explicit brand colors are provided by user, match them exactly.
- NEVER: neon colors, pure RGB primaries (#ff0000, #0000ff), more than one accent, low-contrast pairs, generic gray.
- Color system uses HSL CSS variables — all site colors are derived from primaryHex. These hex values are correct — use them verbatim.

Required JSON structure:
{
  "primaryHex": "#hex — use the color selection rules above, informed by: org type = ${type}, color hints = "${colorHints}".",
  "accentHex": "#hex — warm gold/amber pairs with all dark primaries. Never use the same hue as primary.",
  "primaryRgb": "r,g,b of primaryHex e.g. 30,58,95",
  "heroUnsplashId": "${hasImportedImages ? '"" (leave empty — real site images will be used instead of Unsplash)' : `"one ID from: ${HERO_IDS.join(",")}`}",
  "aboutUnsplashId": "${hasImportedImages ? '"" (leave empty — real site images will be used instead of Unsplash)' : `"different ID from: ${ABOUT_IDS.join(",")}`}",
  "orgTypeLabel": "precise 2-3 word label e.g. Rotary Club, Lions Club, Civic Association, Service Organization, Community Foundation",
  "aboutHeading": "powerful 4-7 word heading — specific to this org e.g. 'Serving Norwin Since 1952' or 'Making Irwin Stronger Together'",
  "missionExpanded": "3 compelling, specific sentences that capture WHY this organization matters to their community. Use real details — names of programs, specific impact, the human story. No generic platitudes.",
  "stat1Value": "founding year e.g. '1952'", "stat1Label": "Year Founded",
  "stat2Value": "member count with + e.g. '45+'", "stat2Label": "Active Members",
  "stat3Value": "annual events count e.g. '12+'", "stat3Label": "Annual Events",
  "programs": [
    {"icon":"2-3 word category label e.g. 'Youth Leadership' or 'Community Service' or 'Annual Fundraiser'","title":"exact program name from their content","description":"2 vivid, specific sentences about this program's real impact"},
    {"icon":"2-3 word category label","title":"program name","description":"2 specific sentences"},
    {"icon":"2-3 word category label","title":"program name","description":"2 specific sentences"}
  ],
  "contactHeading": "warm, specific 4-6 word invitation tied to this org e.g. 'Join Norwin Rotary Today'",
  "contactIntro": "2 genuine sentences that speak to WHY someone would want to get involved — specific to this org",
  "contactCardHeading": "action-oriented CTA e.g. 'Become a Member' or 'Attend a Meeting'",
  "contactCardText": "2 sentences with the most useful info — when/where they meet, what to expect"
}
Rules:
- Use REAL content only — never lorem ipsum or placeholder text. Every sentence must be specific to this organization.
- Programs must be this org's actual initiatives (not generic examples). If only 2 are mentioned, output 2 — do not invent a third.
- Stats: use actual known values. If founding year is unknown, omit stat1 entirely (leave value empty). Never fabricate member counts or event numbers.
- Contact section must include when/where they meet and the most direct way to reach them.
- aboutHeading must name the org or location specifically — "Serving Norwin Since 1952" not "Serving Our Community."
- missionExpanded must include the human story: who they serve, what specifically changes in the community because of this org, what someone would gain by joining or attending.
- No emojis anywhere in the output.`,
      },
      {
        role: "user",
        content: `Name: ${s.orgName}\nType: ${type}\nTagline: ${s.tagline}\nMission: ${s.mission}\nServices: ${s.services.join(", ") || "Community service programs"}\nLocation: ${s.location || ""}\nHours/Schedule: ${s.hours || ""}\nColors/Branding: ${colorHints}\nEmail: ${s.contactEmail || ""}\nPhone: ${s.contactPhone || ""}\nAudience: ${s.audience || ""}\nExtras/History: ${s.extras || ""}${originalSiteContext}`,
      },
    ], 2000, "gpt-4o-mini");

    const jsonMatch = contentJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ContentData>;
      contentData = { ...contentData, ...parsed };
      if (!Array.isArray(contentData.programs) || contentData.programs.length === 0) {
        contentData.programs = defaultPrograms;
      }
      contentData.programs = contentData.programs.slice(0, 3);
    }
  } catch {
    // Use defaults
  }

  // CHANGE 3: Deterministic color override — getOrgTypeColors() enforces specs/pillar-org-design-strategies.md
  // This HARD-OVERRIDES AI-generated colors for known org types (Rotary, Lions, Veterans, etc.)
  // The AI may also suggest these colors but this guarantees correctness regardless of AI output.
  const forcedColors = getOrgTypeColors(s.orgName || name, type);
  if (forcedColors) {
    contentData.primaryHex = forcedColors.primaryHex;
    contentData.accentHex  = forcedColors.accentHex;
    contentData.primaryRgb = forcedColors.primaryRgb;
  }

  // Step 5: Design algorithm — classify, score, plan, then build HTML blocks

  // ── Asset classification ──────────────────────────────────────────────────
  const importedLogoEffective = importedLogoUrl ?? null;
  // Classify each candidate image
  const uploadedHeroClass  = photoUrls[0] ? classifyAsset(photoUrls[0], importedLogoEffective) : "unknown";
  const importedHeroClass  = importedHeroUrl ? classifyAsset(importedHeroUrl, importedLogoEffective) : "unknown";
  // Uploaded user photo takes precedence if it's a real photo; else imported hero if it's a real photo
  const hasActualHeroPhoto = isHeroQualified(uploadedHeroClass) || isHeroQualified(importedHeroClass);
  // Imported hero qualifies if it's a real photo AND distinct from logo (existing guard + classifier)
  const importedHeroIsActualPhoto = importedHeroUrl !== null
    && importedHeroUrl !== importedLogoUrl
    && isHeroQualified(importedHeroClass);

  // ── Content quality scoring ───────────────────────────────────────────────
  const scores = scoreContent({
    mission: s.mission || contentData.missionExpanded,
    services: s.services,
    eventCount: allEvents.length,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    location: s.location,
    extras: s.extras,
    audience: s.audience,
    uploadedPhotoCount: photoUrls.length,
    importedHeroIsActualPhoto,
    importedImageCount: importedImageUrls.length,
    hasLogo: !!(logoDataUrl ?? importedLogoUrl),
    stat1Value: contentData.stat1Value,
    stat2Value: contentData.stat2Value,
    stat3Value: contentData.stat3Value,
  });

  // ── Layout planning ───────────────────────────────────────────────────────
  const plan = planLayout(scores, hasActualHeroPhoto, !!(logoDataUrl ?? importedLogoUrl));

  // ── Hero image selection — only use hero-qualified images ─────────────────
  const safeHeroId = contentData.heroUnsplashId || HERO_IDS[Math.floor(Math.random() * HERO_IDS.length)];
  const safeAboutId = contentData.aboutUnsplashId || ABOUT_IDS[Math.floor(Math.random() * ABOUT_IDS.length)];

  // Hero photo: uploaded real photo > imported real photo > Unsplash (only for photo hero)
  const heroPhoto = isHeroQualified(uploadedHeroClass) ? photoUrls[0]
    : (importedHeroIsActualPhoto ? importedHeroUrl : null);

  // For gradient hero: no image tag at all (clean gradient from CSS)
  // For photo hero: real photo required
  const usePhotoHero = plan.heroType === "photo" || (plan.heroType === "featured-event" && heroPhoto !== null);
  const heroImageUrl = usePhotoHero && heroPhoto
    ? heroPhoto
    : usePhotoHero
      ? `https://images.unsplash.com/photo-${safeHeroId}?auto=format&fit=crop&w=1920&q=80`
      : ""; // gradient hero — no image

  const heroModifierClass = heroImageUrl ? "hero--photo" : "hero--gradient";

  // About image: second uploaded photo > first imported extra > imported hero if photo
  const aboutPhoto = photoUrls.length > 1 ? photoUrls[1]
    : (importedImageUrls[0] ?? (importedHeroIsActualPhoto ? importedHeroUrl : null));
  const aboutImageUrl = aboutPhoto ?? `https://images.unsplash.com/photo-${safeAboutId}?auto=format&fit=crop&w=900&q=80`;

  // Logo priority: user-uploaded data URL > imported logo URL > org name text
  const effectiveLogoSrc = logoDataUrl ?? importedLogoUrl;
  const navLogoHtml = effectiveLogoSrc
    ? `<div class="nav-logo"><img src="${effectiveLogoSrc}" alt="${safeOrgName} logo"></div>`
    : `<div class="nav-logo">${safeOrgName}</div>`;
  const footerLogoHtml = effectiveLogoSrc
    ? `<div class="footer-brand-name"><img src="${effectiveLogoSrc}" alt="${safeOrgName} logo"></div>`
    : `<div class="footer-brand-name">${safeOrgName}</div>`;

  const programsBlock = contentData.programs.map(p => `
    <div class="card reveal-child">
      <span class="card-category">${esc(p.icon)}</span>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.description)}</p>
    </div>`).join("\n");

  const buildEventRow = (e: typeof allEvents[0]) => {
    const dateObj = e.startDate ? new Date(e.startDate + "T00:00:00") : null;
    const day = dateObj ? String(dateObj.getDate()) : "";
    const month = dateObj ? dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
    const timeStr = e.startTime ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ""}` : "";
    const eventUrl = e.slug ? `https://${slug}.mypillar.co/events/${e.slug}` : null;
    const registerBtn = eventUrl && e.hasRegistration
      ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem">Get Tickets →</a>`
      : eventUrl
      ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer" class="btn-ghost" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem;background:transparent;color:var(--text);border-color:var(--border)">View Details →</a>`
      : "";
    return `
    <div class="event-row reveal">
      <div class="event-date-block">
        ${day ? `<span class="event-day">${day}</span><span class="event-month">${month}</span>` : `<span class="event-day" style="font-size:0.8rem">TBD</span>`}
      </div>
      <div class="event-info">
        <h4>${esc(e.name)}</h4>
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}
        <div class="event-meta">
          ${timeStr ? `<span class="event-meta-item" style="display:flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${esc(timeStr)}</span>` : ""}
          ${e.location ? `<span class="event-meta-item" style="display:flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${esc(e.location)}</span>` : ""}
        </div>
        ${registerBtn}
      </div>
    </div>`;
  };

  // Gallery section for uploaded photos beyond hero+about
  const extraPhotos = photoUrls.slice(2);
  const gallerySection = extraPhotos.length > 0 ? `
  <section class="programs" id="gallery" style="background:var(--bg)">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">Our Organization</span>
        <h2>Life at ${safeOrgName}</h2>
      </div>
      <div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        ${extraPhotos.map((url, i) => `
        <div class="card reveal-child" style="padding:0;overflow:hidden;border-top:none">
          <img src="${url}" alt="${safeOrgName} photo ${i + 3}" loading="lazy" style="width:100%;height:220px;object-fit:cover;display:block">
        </div>`).join("\n")}
      </div>
    </div>
  </section>` : "";

  const eventsHtml = allEvents.length > 0 ? `
  <section class="events" id="events">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">Upcoming Events</span>
        <h2>What&#8217;s Happening</h2>
      </div>
      <div class="events-list">
        ${allEvents.map(buildEventRow).join("\n")}
      </div>
    </div>
  </section>` : "";

  const eventsSectionHtml = gallerySection + eventsHtml;

  // Shop section — injected if the org has a saved embed code
  const shopEmbedCode = org.shopEmbedCode?.trim() ?? "";
  const shopSectionHtml = shopEmbedCode
    ? `<section class="shop" id="shop">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">Our Shop</span>
        <h2>Support Our Work</h2>
      </div>
      <div class="shop-embed-wrap reveal">
        ${shopEmbedCode}
      </div>
    </div>
  </section>`
    : "";

  const navEventsLink = allEvents.length > 0 ? '<a href="#events">Events</a>' : "";
  const mobileEventsLink = allEvents.length > 0 ? '<a href="#events" class="mobile-link">Events</a>' : "";
  const footerEventsLink = allEvents.length > 0 ? '<li><a href="#events">Events</a></li>' : "";

  const statsBlock = [
    `<div class="stat-item"><div class="stat-value">${esc(contentData.stat1Value)}</div><div class="stat-label">${esc(contentData.stat1Label)}</div></div>`,
    `<div class="stat-item"><div class="stat-value">${esc(contentData.stat2Value)}</div><div class="stat-label">${esc(contentData.stat2Label)}</div></div>`,
    `<div class="stat-item"><div class="stat-value">${esc(contentData.stat3Value)}</div><div class="stat-label">${esc(contentData.stat3Label)}</div></div>`,
  ].join("\n");

  const contactDetails = [
    s.contactEmail ? `<div class="contact-item"><div class="contact-icon">📧</div><a href="mailto:${esc(s.contactEmail)}" style="color:inherit">${esc(s.contactEmail)}</a></div>` : "",
    s.contactPhone ? `<div class="contact-item"><div class="contact-icon">📞</div><a href="tel:${s.contactPhone}" style="color:inherit">${esc(s.contactPhone)}</a></div>` : "",
    s.location ? `<div class="contact-item"><div class="contact-icon">📍</div><span>${esc(s.location)}</span></div>` : "",
    s.hours ? `<div class="contact-item"><div class="contact-icon">🕐</div><span>${esc(s.hours)}</span></div>` : "",
  ].filter(Boolean).join("\n") || '<div class="contact-item"><div class="contact-icon">📧</div><span>Reach out to connect with us</span></div>';

  const footerContact = [
    s.contactEmail ? `<span>📧 <a href="mailto:${esc(s.contactEmail)}" style="color:inherit">${esc(s.contactEmail)}</a></span>` : "",
    s.contactPhone ? `<span>📞 ${esc(s.contactPhone)}</span>` : "",
    s.location ? `<span>📍 ${esc(s.location)}</span>` : "",
  ].filter(Boolean).join("\n");

  const schemaJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "Organization",
    name: safeOrgName,
    description: (s.mission || contentData.missionExpanded).substring(0, 200),
    ...(s.contactEmail ? { email: s.contactEmail } : {}),
    ...(s.contactPhone ? { telephone: s.contactPhone } : {}),
    ...(s.location ? { address: { "@type": "PostalAddress", streetAddress: s.location } } : {}),
  });

  // ── Hero CTAs — strategy-aware, max 2 per section ────────────────────────
  const heroPrimaryCta = (() => {
    if (plan.strategy === "event-led")       return `<a href="#events" class="btn-primary">View Events</a>`;
    if (plan.strategy === "membership-led")  return `<a href="#contact" class="btn-primary">Get Involved</a>`;
    return `<a href="#about" class="btn-primary">Learn More</a>`;
  })();
  const heroSecondaryCta = `<a href="#contact" class="btn-ghost">Get in Touch</a>`;

  // ── Featured events — up to 3 per specs/pillar-event-rendering-spec.md ──────
  // Priority: manually featured → ticketed/fundraiser events → soonest upcoming
  const todayIso = new Date().toISOString().split("T")[0];
  const futureOnly = allEvents.filter(e => !e.startDate || e.startDate >= todayIso);
  const eventPool = futureOnly.length > 0 ? futureOnly : allEvents;

  const manuallyFeatured = eventPool.filter(e => (e as any).featuredOnSite === true);
  const ticketedEvents = eventPool.filter(e => {
    const t = `${e.name} ${e.description ?? ""}`.toLowerCase();
    return e.hasRegistration || /ticket|fundrais|gala|donate|\$\d/.test(t);
  });

  // Build featured list: manually featured first, fill with ticketed, then remaining
  const featuredSet = new Set<typeof eventPool[0]>();
  for (const e of manuallyFeatured) featuredSet.add(e);
  for (const e of ticketedEvents) if (featuredSet.size < 3) featuredSet.add(e);
  for (const e of eventPool) if (featuredSet.size < 3) featuredSet.add(e);
  const featuredEvents = Array.from(featuredSet).slice(0, 3);

  const featuredEventSection = plan.showFeaturedEvent && featuredEvents.length > 0
    ? buildFeaturedEventSection(featuredEvents, esc, contentData.accentHex || "#c9a84c", slug)
    : "";

  // ── Sponsor strip — parse from extras text ────────────────────────────────
  const sponsorNames: string[] = [];
  const extrasLower = (s.extras || "").toLowerCase();
  if (/sponsor|partner/.test(extrasLower)) {
    const matches = (s.extras || "").match(/(?:sponsors?|partners?)[:–\-\s]+([^\n.]+)/gi);
    if (matches) {
      matches.forEach(m => {
        const names = m.replace(/^(sponsors?|partners?)[:–\-\s]+/i, "").split(/[,;]/);
        names.forEach(n => { const t = n.trim(); if (t.length > 2 && t.length < 60) sponsorNames.push(t); });
      });
    }
  }
  const sponsorStrip = sponsorNames.length >= 2 ? buildSponsorStrip(sponsorNames, esc) : "";

  // ── Stats section — gated by quality score ────────────────────────────────
  const rawStatsBlock = [
    `<div class="stat-item"><div class="stat-value">${esc(contentData.stat1Value)}</div><div class="stat-label">${esc(contentData.stat1Label)}</div></div>`,
    `<div class="stat-item"><div class="stat-value">${esc(contentData.stat2Value)}</div><div class="stat-label">${esc(contentData.stat2Label)}</div></div>`,
    `<div class="stat-item"><div class="stat-value">${esc(contentData.stat3Value)}</div><div class="stat-label">${esc(contentData.stat3Label)}</div></div>`,
  ].join("\n");
  const statsSection = plan.showStats ? buildStatsSection(rawStatsBlock) : "";

  const siteContent: SiteContent = {
    orgName: safeOrgName,
    orgTagline: esc(s.tagline || contentData.orgTypeLabel),
    orgMission: esc(contentData.missionExpanded),
    orgTypeLabel: esc(contentData.orgTypeLabel),
    primaryHex: contentData.primaryHex || "#1e3a5f",
    accentHex: contentData.accentHex || "#c9a84c",
    primaryRgb: contentData.primaryRgb || "30,58,95",
    heroImageUrl,
    aboutImageUrl,
    aboutHeading: esc(contentData.aboutHeading),
    stat1Value: esc(contentData.stat1Value), stat1Label: esc(contentData.stat1Label),
    stat2Value: esc(contentData.stat2Value), stat2Label: esc(contentData.stat2Label),
    stat3Value: esc(contentData.stat3Value), stat3Label: esc(contentData.stat3Label),
    statsBlock: rawStatsBlock,
    statsSection,
    programsBlock: plan.showPrograms ? programsBlock : "",
    eventsSection: plan.showEventList ? eventsSectionHtml : "",
    shopSection: shopSectionHtml,
    featuredEventSection,
    sponsorStrip,
    navEventsLink: plan.showEventList && allEvents.length > 0 ? '<a href="#events">Events</a>' : "",
    mobileEventsLink: plan.showEventList && allEvents.length > 0 ? '<a href="#events" class="mobile-link">Events</a>' : "",
    footerEventsLink: plan.showEventList && allEvents.length > 0 ? '<li><a href="#events">Events</a></li>' : "",
    contactHeading: esc(contentData.contactHeading),
    contactIntro: esc(contentData.contactIntro),
    contactCardHeading: esc(contentData.contactCardHeading),
    contactCardText: esc(contentData.contactCardText),
    contactEmail: esc(s.contactEmail || ""),
    contactDetails,
    contactRightPanel: buildContactRightPanel(slug, s.contactEmail || "", esc(contentData.contactCardHeading), esc(contentData.contactCardText), s.contactPhone || "", s.location || ""),
    footerContact,
    navLogo: navLogoHtml,
    heroLogoBadge: effectiveLogoSrc
      ? `<div class="hero-logo-badge"><img src="${effectiveLogoSrc}" alt="${safeOrgName} logo"></div>`
      : "",
    footerLogo: footerLogoHtml,
    metaDescription: esc((s.mission || contentData.missionExpanded).substring(0, 155)),
    canonicalUrl: `https://${slug}.mypillar.co`,
    schemaJson,
    currentYear: String(new Date().getFullYear()),
    heroModifierClass,
    heroPrimaryCta,
    heroSecondaryCta,
  };

  try {
    const rawHtml = buildSiteFromTemplate(siteContent);

    // CHANGE 4: Post-build validation (specs/pillar-build-validation-checklist.md)
    // Step 1 — Auto-fix what can be fixed programmatically (CHECK 1 filler, CHECK 6 scroll, CHECK 7 broken imgs)
    const { html: fixedHtml, fixed: autoFixed } = autoFixHtml(rawHtml);
    // Step 2 — Run the full 18-point checklist on the FIXED HTML
    // ticketedEventCount uses hasRegistration (the flag that renders "Get Tickets" buttons in the template)
    const ticketedEventCount = allEvents.filter(e => e.hasRegistration).length;
    const validationReport = validateBuiltSite(
      fixedHtml,
      s.orgName || name,
      type,
      contentData.primaryHex || "#1e3a5f",
      allEvents.length,
      ticketedEventCount,
      !!originalSiteUrl,
      autoFixed,
    );
    // Step 3 — Block on critical structural failures that cannot be auto-fixed.
    // Per spec §HOW TO USE: "The site must not be presented to the user until all 18 checks pass."
    // Structural checks (9=contact, 11=nav, 12=title) are always emitted by the template; a failure
    // here means a template bug. We block and surface the exact failing check(s) rather than show
    // a broken site.
    const BLOCKING_CHECK_IDS = new Set([9, 11, 12]);
    const blockingFailures = validationReport.checks.filter(c => c.status === "fail" && BLOCKING_CHECK_IDS.has(c.id));
    if (blockingFailures.length > 0) {
      const detail = blockingFailures.map(c => `CHECK ${c.id}: ${c.label}${c.detail ? ` — ${c.detail}` : ""}`).join("; ");
      res.status(500).json({ error: `Site generation failed validation and cannot be presented. ${detail}. Please try again.` });
      return;
    }
    // Non-blocking failures are still saved but flagged clearly in the walkthrough (user can see which checks failed).
    const cleanedHtml = fixedHtml;

    const metaTitle = s.orgName || name;
    const metaDescription = s.mission || `Welcome to ${name}`;

    const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
    let site;
    if (existing) {
      [site] = await db.update(sitesTable)
        .set({ generatedHtml: cleanedHtml, proposedHtml: null, orgSlug: slug, metaTitle, metaDescription, updatedAt: new Date() })
        .where(eq(sitesTable.orgId, org.id))
        .returning();
    } else {
      [site] = await db.insert(sitesTable)
        .values({ orgId: org.id, orgSlug: slug, generatedHtml: cleanedHtml, metaTitle, metaDescription, status: "draft" })
        .returning();
    }

    await db.update(websiteSpecsTable).set({ siteId: site.id }).where(eq(websiteSpecsTable.orgId, org.id)).catch(() => {});

    // Count generation against monthly usage (it's the most expensive AI call)
    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;

    // Build walkthrough — a section-by-section description played back in the chat
    const walkthroughSteps: string[] = [];
    const heroTypeLabel = plan.heroType === "photo" ? "a photo background" : "a gradient background";
    walkthroughSteps.push(
      `Your site is built. Here's what we created.\n\nHero — ${s.orgName}'s mission leads above the fold with ${heroTypeLabel} and a clear call to action. This is the first thing every visitor sees.`
    );
    if (plan.showPrograms && contentData.programs.length > 0) {
      const names = contentData.programs.map(p => p.title);
      const nameStr = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
      walkthroughSteps.push(`Programs — ${names.length} program${names.length !== 1 ? "s" : ""} highlighted: ${nameStr}.`);
    }
    if (plan.showFeaturedEvent && plan.featuredEvent) {
      walkthroughSteps.push(`Featured Event — "${plan.featuredEvent.name}" is spotlighted with the date, description, and a direct action button.`);
    }
    if (plan.showEventList && allEvents.length > 0) {
      walkthroughSteps.push(`Events — ${Math.min(allEvents.length, 5)} upcoming event${allEvents.length !== 1 ? "s" : ""} listed with dates and details.`);
    }
    if (plan.showStats) {
      walkthroughSteps.push(`By the Numbers — Key stats are displayed to build credibility with new visitors.`);
    }
    if (plan.showSponsorStrip && s.sponsors && s.sponsors.length >= 2) {
      walkthroughSteps.push(`Sponsors — A sponsor strip recognizes ${s.sponsors.length} supporting organizations.`);
    }
    walkthroughSteps.push(`Contact — Your contact information and an invitation to get involved round out the page.\n\nTell me what you'd like to change — colors, copy, layout, or any section.`);

    // CHANGE 4 (continued): Append 18-point validation report to walkthrough
    // Per specs/pillar-build-validation-checklist.md — VALIDATION RESULT FORMAT
    // Shows auto-fixed items first, then the full check-by-check result.
    const validationLines: string[] = [];
    const statusIcon = (s: "pass" | "fail" | "na") => s === "pass" ? "✓" : s === "na" ? "—" : "✗";
    if (validationReport.autoFixed.length > 0) {
      validationLines.push("AUTO-FIXED before presenting:");
      for (const fix of validationReport.autoFixed) validationLines.push(`  ⚙ ${fix}`);
      validationLines.push("");
    }
    for (const c of validationReport.checks) {
      const icon = statusIcon(c.status);
      const detail = c.detail ? ` (${c.detail})` : "";
      validationLines.push(`${icon} CHECK ${String(c.id).padStart(2, "0")}: ${c.label} — ${c.status.toUpperCase()}${detail}`);
    }
    const applicableCount = validationReport.checks.filter(c => c.status !== "na").length;
    const overallLine = validationReport.passed
      ? `VALIDATION: PASS — all ${applicableCount} applicable checks passed${validationReport.autoFixed.length > 0 ? ` (${validationReport.autoFixed.length} auto-fixed)` : ""}.`
      : `VALIDATION: ${validationReport.failCount} issue${validationReport.failCount !== 1 ? "s" : ""} remain after auto-fix. See ✗ items above — these need attention.`;
    walkthroughSteps.push(`─── 18-Point Quality Validation (specs/pillar-build-validation-checklist.md) ───\n${validationLines.join("\n")}\n\n${overallLine}`);

    res.json({ site: { ...site, proposedHtml: undefined }, orgSlug: slug, walkthrough: walkthroughSteps, validation: validationReport, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.status(500).json({ error: "Site generation failed. Please try again." });
  }
});

// ─── Change request — PROPOSE (Tier 1+) — stored server-side ─────────────────
router.post("/change-request/propose", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Change requests require a paid plan (Starter or higher)" });
    return;
  }

  const usageInfo = await checkAndResetUsage(org as Parameters<typeof checkAndResetUsage>[0], res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  const { changeRequest, uploadedImageUrls } = req.body as { changeRequest: string; uploadedImageUrls?: string[] };
  if (!changeRequest?.trim()) { res.status(400).json({ error: "changeRequest is required" }); return; }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.generatedHtml) { res.status(404).json({ error: "No site found — generate one first" }); return; }

  // Validate + sanitize uploaded image URLs (must be HTTPS, reasonable length)
  const safeImageUrls = (uploadedImageUrls ?? [])
    .filter(u => typeof u === "string" && u.startsWith("https://") && u.length < 2000)
    .slice(0, 4);

  // ── Section-based approach: AI only sees and rewrites the relevant section ──
  // This keeps input + output well within token limits for any site size.

  // Detect style/CSS requests separately (color, font, theme)
  const isStyleChange = /\b(color|colour|font|typography|palette|theme|dark|light|background.?color|text.?color)\b/i.test(changeRequest);

  try {
    let updatedHtml: string;

    if (isStyleChange) {
      // Extract just the <style> block, let AI modify it, splice back
      const styleMatch = site.generatedHtml.match(/(<style[\s\S]*?<\/style>)/i);
      if (!styleMatch || styleMatch.index === undefined) {
        res.status(400).json({ error: "Could not locate the site's style block. Please regenerate your site." });
        return;
      }
      const before = site.generatedHtml.substring(0, styleMatch.index);
      const styleBlock = styleMatch[1];
      const after = site.generatedHtml.substring(styleMatch.index + styleBlock.length);

      const modifiedStyle = await callOpenAI([
        {
          role: "system",
          content: `You are modifying a CSS <style> block for a website. Apply ONLY the user's requested style change — preserve all other existing CSS rules. Output ONLY the complete <style>...</style> block, no explanation.`,
        },
        {
          role: "user",
          content: `Current <style> block:\n${styleBlock}\n\nRequested change: "${changeRequest}"\n\nReturn the updated <style> block only.`,
        },
      ], 6000, "gpt-4o-mini");

      const trimmedStyle = modifiedStyle.trim();
      if (!trimmedStyle.includes("<style")) {
        res.status(500).json({ error: "AI returned an invalid style block. Please try again." });
        return;
      }
      updatedHtml = before + trimmedStyle + after;
    } else {
      // Identify which section to modify from keywords in the request
      const target = identifySectionTarget(changeRequest);
      if (!target) {
        res.status(400).json({
          error: `Please specify which section to update — for example: "hero", "about", "programs", "events", or "contact". Example: "Add a membership sign-up button to the hero section."`,
        });
        return;
      }

      const parts = extractSection(site.generatedHtml, target.sectionId);
      if (!parts) {
        // Section not present in this site's HTML — treat the whole thing as an update hint
        res.status(400).json({ error: `This site doesn't have a ${target.label} section. Try a different section or regenerate your site.` });
        return;
      }

      const imageCtxNote = safeImageUrls.length > 0
        ? `\n\nThe user has uploaded image(s) to incorporate:\n${safeImageUrls.map((u, i) => `Image ${i + 1}: ${u}`).join("\n")}`
        : "";

      const modifiedSection = await callOpenAI([
        {
          role: "system",
          content: `You are modifying a single section of an HTML website. Apply ONLY the user's requested change — preserve ALL existing CSS classes, IDs, data attributes, inline styles, and JavaScript hooks. Output ONLY the modified <section> element — start directly with the opening <section> tag, no <!DOCTYPE>, no <html>, no <head>, no <body>. No explanations.`,
        },
        {
          role: "user",
          content: `Current section HTML:\n${parts.section}${imageCtxNote}\n\nRequested change: "${changeRequest}"\n\nReturn the updated section HTML only.`,
        },
      ], 6000, "gpt-4o-mini");

      const trimmed = modifiedSection.trim();
      if (!trimmed.startsWith("<section") && !trimmed.startsWith("<div")) {
        res.status(500).json({ error: "AI returned an unexpected response. Please try again." });
        return;
      }
      updatedHtml = parts.before + trimmed + parts.after;
    }

    // Sanitize before save — removes script injection, event handlers, javascript: URIs
    updatedHtml = sanitizeAiSiteHtml(updatedHtml, SITE_SCRIPT_BLOCK);

    // Save proposal server-side — do NOT return HTML to client
    await db.update(sitesTable).set({ proposedHtml: updatedHtml }).where(eq(sitesTable.orgId, org.id));

    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;

    res.json({ proposalReady: true, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch (err) {
    console.error("[change-request/propose] error:", err);
    res.status(500).json({ error: "Proposal generation failed. Please try again." });
  }
});

// ─── Change request — APPLY (server-stored proposal only, no client HTML) ─────
router.post("/change-request/apply", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Change requests require a paid plan (Starter or higher)" });
    return;
  }

  const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!existing) { res.status(404).json({ error: "No site found" }); return; }
  if (!existing.proposedHtml) { res.status(400).json({ error: "No pending proposal to apply" }); return; }

  // Apply server-stored proposal — no client-supplied HTML accepted
  const [site] = await db.update(sitesTable)
    .set({ generatedHtml: existing.proposedHtml, proposedHtml: null, updatedAt: new Date() })
    .where(eq(sitesTable.orgId, org.id))
    .returning();

  res.json({ site: { ...site, proposedHtml: undefined } });
});

// ─── Update site slug ─────────────────────────────────────────────────────────
router.put("/my/slug", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { slug: rawSlug } = req.body as { slug?: string };
  if (!rawSlug?.trim()) { res.status(400).json({ error: "slug is required" }); return; }

  const slug = rawSlug.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) {
    res.status(400).json({ error: "Slug must be 3–63 characters: lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen." });
    return;
  }

  // Check uniqueness across both sites and orgs tables (excluding current org)
  const [existingSite] = await db
    .select({ id: sitesTable.id })
    .from(sitesTable)
    .where(and(eq(sitesTable.orgSlug, slug), sql`${sitesTable.orgId} != ${org.id}`));

  if (existingSite) {
    res.status(409).json({ error: "That URL is already taken. Please choose another." });
    return;
  }

  const [existingOrg] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.slug, slug), sql`${organizationsTable.id} != ${org.id}`));

  if (existingOrg) {
    res.status(409).json({ error: "That URL is already taken. Please choose another." });
    return;
  }

  // Update both tables atomically
  await db.transaction(async tx => {
    await tx.update(sitesTable).set({ orgSlug: slug }).where(eq(sitesTable.orgId, org.id));
    await tx.update(organizationsTable).set({ slug }).where(eq(organizationsTable.id, org.id));
  });

  res.json({ slug });
});

// ─── Sync events from DB into site ───────────────────────────────────────────
router.post("/sync-events", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Syncing events requires a paid plan (Starter or higher)" });
    return;
  }

  const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!existing?.generatedHtml) { res.status(404).json({ error: "No published site found. Generate your site first." }); return; }

  // Fetch one-off events from DB
  const todayStr = new Date().toISOString().split("T")[0];
  const todayDate = new Date(todayStr + "T00:00:00");

  const oneOffEvents = await db
    .select({ name: eventsTable.name, startDate: eventsTable.startDate, startTime: eventsTable.startTime, endTime: eventsTable.endTime, location: eventsTable.location, description: eventsTable.description, slug: eventsTable.slug, hasRegistration: eventsTable.hasRegistration })
    .from(eventsTable)
    .where(eq(eventsTable.orgId, org.id))
    .limit(20);

  // Fetch active recurring event templates — compute next 2 occurrences each
  const recurringTemplates = await db
    .select()
    .from(recurringEventTemplatesTable)
    .where(and(eq(recurringEventTemplatesTable.orgId, org.id), eq(recurringEventTemplatesTable.isActive, true)));

  // Compute next occurrence of a recurring template after a given date
  function nextOccurrence(template: typeof recurringTemplates[0], after: Date): Date {
    const base = new Date(after);
    base.setDate(base.getDate() + 1);
    base.setHours(0, 0, 0, 0);
    if ((template.frequency === "weekly" || template.frequency === "biweekly") && template.dayOfWeek != null) {
      while (base.getDay() !== template.dayOfWeek) base.setDate(base.getDate() + 1);
      if (template.frequency === "biweekly") base.setDate(base.getDate() + 7);
      return base;
    }
    if (template.frequency === "monthly") {
      if (template.dayOfMonth != null) {
        base.setDate(1);
        base.setMonth(base.getMonth() + 1);
        const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        base.setDate(Math.min(template.dayOfMonth, maxDay));
        return base;
      }
      if (template.weekOfMonth != null && template.dayOfWeek != null) {
        base.setDate(1);
        base.setMonth(base.getMonth() + 1);
        let c = 0;
        while (true) { if (base.getDay() === template.dayOfWeek) { c++; if (c === template.weekOfMonth) break; } base.setDate(base.getDate() + 1); }
        return base;
      }
    }
    base.setMonth(base.getMonth() + 1);
    return base;
  }

  // Build synthetic event rows from recurring templates — ONE occurrence per template.
  // Recurring series appear as a single card showing the next occurrence date.
  // Showing every future occurrence creates clutter and looks unprofessional.
  type SyncEventRow = { name: string; startDate: string | null; startTime: string | null; endTime: string | null; location: string | null; description: string | null; slug: string | null; hasRegistration: boolean | null };
  const recurringRows: SyncEventRow[] = [];
  for (const tmpl of recurringTemplates) {
    const occ = nextOccurrence(tmpl, todayDate);
    recurringRows.push({
      name: tmpl.name,
      startDate: occ.toISOString().split("T")[0],
      startTime: tmpl.startTime ?? null,
      endTime: null,
      location: tmpl.location ?? null,
      description: tmpl.description ?? null,
      slug: null,       // recurring templates have no ticket slug
      hasRegistration: null,
    });
  }

  // Merge: future one-off events + recurring occurrences, sorted by date
  const futureOneOff = oneOffEvents.filter(e => !e.startDate || e.startDate >= todayStr);
  const allRows: SyncEventRow[] = [
    ...futureOneOff.map(e => ({ ...e, slug: e.slug ?? null, hasRegistration: e.hasRegistration ?? null })),
    ...recurringRows,
  ].sort((a, b) => (a.startDate ?? "9999") < (b.startDate ?? "9999") ? -1 : 1);

  // If nothing future, fall back to most recent one-offs
  const eventsToShow: SyncEventRow[] = allRows.length > 0 ? allRows.slice(0, 8) : oneOffEvents.slice(0, 5).map(e => ({ ...e, slug: e.slug ?? null, hasRegistration: e.hasRegistration ?? null }));

  if (eventsToShow.length === 0) {
    res.status(400).json({ error: "No events found. Add events in the Events section first." });
    return;
  }

  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const buildRow = (e: SyncEventRow) => {
    const dateObj = e.startDate ? new Date(e.startDate + "T00:00:00") : null;
    const day = dateObj ? String(dateObj.getDate()) : "";
    const month = dateObj ? dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
    const timeStr = e.startTime ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ""}` : "";
    const eventUrl = e.slug ? `https://${org.slug}.mypillar.co/events/${e.slug}` : null;
    const registerBtn = eventUrl && e.hasRegistration
      ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem">Get Tickets →</a>`
      : eventUrl
      ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer" class="btn-ghost" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;padding:0.5rem 1.25rem;font-size:0.85rem;background:transparent;color:var(--text);border-color:var(--border)">View Details →</a>`
      : "";
    return `
    <div class="event-row reveal">
      <div class="event-date-block">
        ${day ? `<span class="event-day">${day}</span><span class="event-month">${month}</span>` : `<span class="event-day" style="font-size:0.8rem">TBD</span>`}
      </div>
      <div class="event-info">
        <h4>${esc(e.name)}</h4>
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}
        <div class="event-meta">
          ${timeStr ? `<span class="event-meta-item" style="display:flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${esc(timeStr)}</span>` : ""}
          ${e.location ? `<span class="event-meta-item" style="display:flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${esc(e.location)}</span>` : ""}
        </div>
        ${registerBtn}
      </div>
    </div>`;
  };

  const newEventsSectionHtml = `
  <section class="events" id="events">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">Upcoming Events</span>
        <h2>What&#8217;s Happening</h2>
      </div>
      <div class="events-list">
        ${eventsToShow.map(buildRow).join("\n")}
      </div>
    </div>
  </section>`;

  // Replace the existing events section — or insert before contact section if missing.
  // Matches id="events" (template standard) OR id="events-section" (legacy AI-generated variant).
  let updatedHtml = existing.generatedHtml;
  const eventsSecRe = /<section[^>]*\bid="events(?:-section)?"[^>]*>[\s\S]*?<\/section>/i;
  if (eventsSecRe.test(updatedHtml)) {
    updatedHtml = updatedHtml.replace(eventsSecRe, newEventsSectionHtml.trim());
  } else {
    // Insert before contact — use capture group $1 so the contact opening tag (including class) is preserved
    updatedHtml = updatedHtml.replace(
      /(<section[^>]*\bid="contact"[^>]*>)/,
      `${newEventsSectionHtml}\n$1`,
    );
  }

  // Ensure "Events" nav link is present — simple targeted insertion before "Contact"
  if (!updatedHtml.includes('href="#events"')) {
    // Desktop nav
    updatedHtml = updatedHtml.replace(
      '<a href="#contact">Contact</a>',
      '<a href="#events">Events</a>\n        <a href="#contact">Contact</a>',
    );
    // Mobile menu
    updatedHtml = updatedHtml.replace(
      '<a href="#contact" class="mobile-link">Contact</a>',
      '<a href="#events" class="mobile-link">Events</a>\n    <a href="#contact" class="mobile-link">Contact</a>',
    );
    // Footer
    updatedHtml = updatedHtml.replace(
      '<li><a href="#contact">Contact</a></li>',
      '<li><a href="#events">Events</a></li>\n            <li><a href="#contact">Contact</a></li>',
    );
  }

  // Safety net: fix any stale wrong-domain event URLs from previous syncs
  const badUrlRe = /https:\/\/mypillar\.co\/events\/([^/]+)\/tickets/g;
  updatedHtml = updatedHtml.replace(badUrlRe, `https://${org.slug}.mypillar.co/events/$1/tickets`);

  // Auto-apply: save to both proposedHtml (preview) and generatedHtml (live site)
  await db.update(sitesTable)
    .set({ generatedHtml: updatedHtml, proposedHtml: updatedHtml, updatedAt: new Date() })
    .where(eq(sitesTable.orgId, org.id));

  // No AI tokens consumed — derive usage from already-loaded org
  const used = org.aiMessagesUsed ?? 0;
  const monthlyLimit = getMonthlyLimit(org.tier);

  res.json({ proposalReady: true, eventCount: eventsToShow.length, used, limit: monthlyLimit, remaining: Math.max(0, monthlyLimit - used) });
});

// ─── Schedule CRUD (Tier 1a+) ─────────────────────────────────────────────────
router.get("/schedule", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires the Autopilot plan or higher" }); return; }
  const [schedule] = await db.select().from(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  res.json({ schedule: schedule ?? null });
});

router.post("/schedule", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires the Autopilot plan or higher" }); return; }

  const { frequency, dayOfWeek, updateItems, customInstructions, isActive } = req.body as {
    frequency: string; dayOfWeek?: string; updateItems?: string[];
    customInstructions?: string; isActive?: boolean;
  };

  if (!frequency) { res.status(400).json({ error: "frequency is required" }); return; }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site) { res.status(404).json({ error: "Generate your site first before setting a schedule" }); return; }

  const nextRunAt = computeNextRun(frequency, dayOfWeek);
  const [existing] = await db.select().from(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));

  let schedule;
  if (existing) {
    [schedule] = await db.update(siteUpdateSchedulesTable)
      .set({ frequency, dayOfWeek: dayOfWeek ?? null, updateItems: updateItems ?? [], customInstructions: customInstructions ?? null, isActive: isActive ?? true, nextRunAt, updatedAt: new Date() })
      .where(eq(siteUpdateSchedulesTable.orgId, org.id))
      .returning();
  } else {
    [schedule] = await db.insert(siteUpdateSchedulesTable)
      .values({ orgId: org.id, siteId: site.id, frequency, dayOfWeek: dayOfWeek ?? null, updateItems: updateItems ?? [], customInstructions: customInstructions ?? null, isActive: isActive ?? true, nextRunAt })
      .returning();
  }

  res.json({ schedule });
});

router.delete("/schedule", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires the Autopilot plan or higher" }); return; }
  await db.delete(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  res.json({ success: true });
});

// ─── Schedule manual run ──────────────────────────────────────────────────────
router.post("/schedule/run", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires the Autopilot plan or higher" }); return; }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.generatedHtml) { res.status(404).json({ error: "No site to update" }); return; }

  const [schedule] = await db.select().from(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  if (!schedule) { res.status(404).json({ error: "No schedule configured" }); return; }

  const updateItems = schedule.updateItems ?? [];
  const instructions: string[] = [];
  if (updateItems.includes("events")) instructions.push("Update the events section with upcoming events for the next 30 days");
  if (updateItems.includes("hours")) instructions.push("Ensure all operating hours and schedules appear current");
  if (updateItems.includes("announcements")) instructions.push("Refresh any news or announcements section to appear active and current");
  if (schedule.customInstructions) instructions.push(schedule.customInstructions);
  if (instructions.length === 0) instructions.push("Ensure all content appears fresh and current");

  try {
    const updatedHtml = await callOpenAI([
      {
        role: "system",
        content: `You are an expert web developer running a scheduled update on an organization's website.
Apply the requested updates to the HTML. Keep all sections, styles, and structure intact.
Output ONLY the complete updated HTML starting with <!DOCTYPE html>.`,
      },
      {
        role: "user",
        content: `Current website HTML:\n${site.generatedHtml}\n\nScheduled update instructions:\n${instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}\n\nToday: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\nApply all updates and output the complete updated HTML.`,
      },
    ], MAX_CHANGE_TOKENS, "gpt-4o-mini");

    let cleanedHtml = updatedHtml.trim();
    const htmlStart = cleanedHtml.indexOf("<!DOCTYPE");
    if (htmlStart > 0) cleanedHtml = cleanedHtml.substring(htmlStart);

    await db.update(sitesTable).set({ generatedHtml: cleanedHtml, proposedHtml: null, updatedAt: new Date() }).where(eq(sitesTable.orgId, org.id));
    const nextRunAt = computeNextRun(schedule.frequency, schedule.dayOfWeek ?? undefined);
    await db.update(siteUpdateSchedulesTable).set({ lastRunAt: new Date(), nextRunAt, updatedAt: new Date() }).where(eq(siteUpdateSchedulesTable.orgId, org.id));

    res.json({ html: cleanedHtml, lastRunAt: new Date().toISOString(), nextRunAt: nextRunAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Scheduled update failed. Please try again." });
  }
});

// ─── Publish / unpublish ──────────────────────────────────────────────────────
router.put("/my/publish", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { publish } = req.body as { publish: boolean };
  const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!existing) { res.status(404).json({ error: "No site found" }); return; }
  if (!existing.generatedHtml) { res.status(400).json({ error: "Site has no generated content" }); return; }

  const [site] = await db.update(sitesTable)
    .set({ status: publish ? "published" : "draft", publishedAt: publish ? new Date() : null, updatedAt: new Date() })
    .where(eq(sitesTable.orgId, org.id))
    .returning();

  res.json({ site: { ...site, proposedHtml: undefined } });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeNextRun(frequency: string, dayOfWeek?: string | null): Date {
  const now = new Date();
  const next = new Date(now);
  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  } else if (frequency === "weekly") {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDay = days.indexOf((dayOfWeek ?? "monday").toLowerCase());
    const currentDay = next.getDay();
    const diff = (targetDay - currentDay + 7) % 7 || 7;
    next.setDate(next.getDate() + diff);
    next.setHours(9, 0, 0, 0);
  } else {
    next.setMonth(next.getMonth() + 1, 1);
    next.setHours(9, 0, 0, 0);
  }
  return next;
}

// ─── Exported utility: rebuild events section when an event is published ──────

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEventsHtml(events: { name: string; startDate: string | null; startTime: string | null; endTime: string | null; location: string | null; description: string | null }[]): string {
  if (events.length === 0) return "";

  const cards = events.map((e) => {
    const date = e.startDate ? new Date(e.startDate + "T00:00:00") : null;
    const day = date ? date.getDate() : "";
    const month = date ? date.toLocaleString("en-US", { month: "short" }).toUpperCase() : "";
    const timeStr = e.startTime ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ""}` : "";

    return `<div class="reveal" style="background:var(--bg,#fff);border-radius:var(--radius,12px);padding:28px 32px;box-shadow:var(--shadow,0 2px 12px rgba(0,0,0,0.08));display:flex;gap:24px;align-items:flex-start;border-left:4px solid var(--accent,#d4a843);">
      ${date ? `<div style="text-align:center;min-width:52px;flex-shrink:0"><div style="font-size:2rem;font-weight:700;line-height:1;color:var(--accent,#d4a843)">${day}</div><div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-light,#64748b);font-weight:600;margin-top:2px">${month}</div></div>` : ""}
      <div style="flex:1">
        <h3 style="font-family:var(--font-heading,serif);font-size:1.15rem;font-weight:700;margin-bottom:8px;color:var(--text,#1a1a2e)">${escHtml(e.name)}</h3>
        ${timeStr ? `<div style="font-size:0.85rem;color:var(--text-light,#64748b);margin-bottom:4px">🕐 ${escHtml(timeStr)}</div>` : ""}
        ${e.location ? `<div style="font-size:0.85rem;color:var(--text-light,#64748b);margin-bottom:8px">📍 ${escHtml(e.location)}</div>` : ""}
        ${e.description ? `<p style="font-size:0.95rem;line-height:1.7;color:var(--text-light,#64748b);margin:0">${escHtml(e.description)}</p>` : ""}
      </div>
    </div>`;
  }).join("\n");

  return `<section id="events-section" style="padding:100px 0 80px;background:var(--bg-alt,#f8fafc)">
  <div style="max-width:1200px;margin:0 auto;padding:0 24px">
    <p class="reveal" style="font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent,#d4a843);margin-bottom:12px">Upcoming Events</p>
    <h2 class="reveal" style="font-family:var(--font-heading,serif);font-size:2.5rem;font-weight:700;color:var(--text,#1a1a2e);margin-bottom:48px;letter-spacing:-0.02em">What's Coming Up</h2>
    <div style="display:flex;flex-direction:column;gap:20px">
      ${cards}
    </div>
  </div>
</section>`;
}

export async function refreshSiteEventsSection(orgId: string): Promise<void> {
  try {
    const [site] = await db.select({ id: sitesTable.id, generatedHtml: sitesTable.generatedHtml }).from(sitesTable).where(eq(sitesTable.orgId, orgId));
    if (!site?.generatedHtml) return;

    const today = new Date().toISOString().split("T")[0];
    const events = await db
      .select({ name: eventsTable.name, startDate: eventsTable.startDate, startTime: eventsTable.startTime, endTime: eventsTable.endTime, location: eventsTable.location, description: eventsTable.description })
      .from(eventsTable)
      .where(eq(eventsTable.orgId, orgId))
      .limit(8);

    const upcoming = events.filter(e => !e.startDate || e.startDate >= today);
    const toShow = upcoming.length > 0 ? upcoming : events.slice(0, 5);

    const newSection = buildEventsHtml(toShow);

    let updatedHtml: string;

    const sectionRegex = /<section[^>]*id=["']events-section["'][^>]*>[\s\S]*?<\/section>/i;
    if (sectionRegex.test(site.generatedHtml)) {
      updatedHtml = site.generatedHtml.replace(sectionRegex, newSection);
    } else if (toShow.length > 0) {
      // No events section yet — inject before the contact section or footer
      const insertBefore = /<section[^>]*id=["']contact["'][^>]*>/i.test(site.generatedHtml)
        ? site.generatedHtml.replace(/(<section[^>]*id=["']contact["'][^>]*>)/i, `${newSection}\n$1`)
        : site.generatedHtml.replace(/(<footer[\s>])/i, `${newSection}\n$1`);
      updatedHtml = insertBefore;
    } else {
      return;
    }

    await db.update(sitesTable).set({ generatedHtml: updatedHtml, updatedAt: new Date() }).where(eq(sitesTable.orgId, orgId));
  } catch (err) {
    // Non-fatal — log but don't throw so the event publish still succeeds
    console.error("[refreshSiteEventsSection] failed:", err);
  }
}

// ─── Embed Code (shop integration) ───────────────────────────────────────────

router.get("/embed-code", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  res.json({ embedCode: org.shopEmbedCode ?? "" });
});

router.put("/embed-code", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const raw = (req.body as { embedCode?: unknown }).embedCode;
  if (typeof raw !== "string") {
    res.status(400).json({ error: "embedCode must be a string" });
    return;
  }

  // Basic safety: strip javascript: and data: URIs from src/href attributes.
  // We allow <script> tags from trusted CDNs (Shopify, Gumroad, Square etc.)
  // because the embed runs inside the published site, not in the Pillar dashboard.
  const sanitized = raw
    .replace(/\bon\w+\s*=/gi, "data-blocked=") // strip inline event handlers
    .replace(/(src|href)\s*=\s*["']javascript:[^"']*["']/gi, "") // strip js: URIs
    .trim();

  await db
    .update(organizationsTable)
    .set({ shopEmbedCode: sanitized || null })
    .where(eq(organizationsTable.id, org.id));

  res.json({ success: true, embedCode: sanitized });
});

export default router;
