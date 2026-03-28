import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sitesTable, siteUpdateSchedulesTable, websiteSpecsTable, eventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

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

async function resolveOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
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
  const org = await resolveOrg(req, res);
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

  const systemPrompt = `You are a friendly, professional website consultant for Steward — an AI platform that builds websites for civic organizations, nonprofits, clubs, and community groups.

You're helping ${name} (a ${type}) build their public website. Your job is to conduct a focused interview, asking ONE question at a time. Be warm but efficient.

Interview sequence — follow this order exactly:
1. "Let's build ${name}'s website! First — in one or two sentences, what is your mission or main purpose? What does ${name} do for the community?"
2. "What programs, services, or activities do you offer? These will become feature cards on your site."
3. "Where are you located? Include the address or meeting place, plus your regular schedule (meeting days, office hours, etc.)."
4. "Tell me about your events — any recurring gatherings, annual fundraisers, community events, or programs people can attend?"
5. "How should visitors reach you? Share an email, phone number, and any social media profiles (Facebook page, Instagram, etc.)."
6. "Who are you trying to reach? New members, volunteers, donors, community residents, families?"
7. "Any color or style preferences? For example: 'navy and gold', 'earth tones', 'clean and modern'. If not sure, I'll pick something that fits your organization's character."
8. "Last question — anything else to highlight? For example: founding history, membership benefits, sponsor recognition, upcoming announcements, or a call for volunteers."

After each answer, acknowledge warmly in ONE sentence that shows you understood, then ask the next question.
After collecting all 8 answers, say EXACTLY: "I have everything I need! Click **Generate My Site** to build your website."
Keep every response under 60 words. Stay conversational and encouraging. Never suggest changes or improvements — just collect info.`;

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

// ─── Usage ───────────────────────────────────────────────────────────────────
router.get("/builder/usage", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  const monthlyLimit = getMonthlyLimit(org.tier);
  let used = org.aiMessagesUsed;
  if (isNewMonth(new Date(org.aiMessagesResetAt))) {
    await db.update(organizationsTable).set({ aiMessagesUsed: 0, aiMessagesResetAt: new Date() }).where(eq(organizationsTable.id, org.id));
    used = 0;
  }
  res.json({ used, limit: monthlyLimit, remaining: monthlyLimit - used, tier: org.tier });
});

// ─── Get current site ─────────────────────────────────────────────────────────
router.get("/my", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
  if (!org) return;

  await db.update(sitesTable).set({ proposedHtml: null }).where(eq(sitesTable.orgId, org.id));
  res.json({ success: true });
});

// ─── Generate site from interview history ─────────────────────────────────────
router.post("/generate", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  // Enforce monthly AI usage limit (generation is the most expensive call)
  const usageInfo = await checkAndResetUsage(org as Parameters<typeof checkAndResetUsage>[0], res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  const { history = [], orgName, orgType, logoDataUrl: rawLogoDataUrl } = req.body as {
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
    logoDataUrl?: unknown;
  };
  // Validate logo on server side — reject SVG, non-image data, oversized payloads
  const logoDataUrl = validateLogoDataUrl(rawLogoDataUrl);

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
    .select({ name: eventsTable.name, startDate: eventsTable.startDate, startTime: eventsTable.startTime, endTime: eventsTable.endTime, location: eventsTable.location, description: eventsTable.description })
    .from(eventsTable)
    .where(eq(eventsTable.orgId, org.id))
    .limit(10);
  // Filter to upcoming (or include all if dates not set)
  const futureEvents = upcomingEvents.filter(e => !e.startDate || e.startDate >= today);
  const allEvents = futureEvents.length > 0 ? futureEvents : upcomingEvents.slice(0, 5);

  const eventsSection = allEvents.length > 0
    ? allEvents.map(e => {
        const parts = [e.name];
        if (e.startDate) parts.push(new Date(e.startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
        if (e.startTime) parts.push(`${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`);
        if (e.location) parts.push(e.location);
        if (e.description) parts.push(e.description);
        return parts.join(" | ");
      }).join("\n")
    : (s.events.join(", ") || "");

  // Step 4: Generate HTML
  // Logo instruction is only set when the data URL passed server-side validation (allowlist MIME, base64-only chars, size limit)
  const safeOrgName = (s.orgName || org.name).replace(/["<>]/g, "");
  const logoInstruction = logoDataUrl
    ? `\nLOGO: The organization has uploaded a logo image. In the nav bar, replace the text logo with: <img src="${logoDataUrl}" alt="${safeOrgName} logo" style="height:48px;width:auto;object-fit:contain;display:block;"> — keep it left-aligned. Also include a smaller version in the footer.`
    : "";

  const colorHints = (s.colors || "navy and gold").toLowerCase();
  const isLight = /white|light|pastel|cream|beige|soft/i.test(colorHints);
  const heroStyle = isLight ? "light hero with dark text" : "dark hero with light text";

  const genSystemMsg = `You are an award-winning web designer. Your output must be indistinguishable from a $25,000 custom design studio build — visually stunning, animated, and polished to pixel perfection.

OUTPUT RULES:
- Output ONLY valid HTML. Start with <!DOCTYPE html>, end with </html>
- No markdown, no code fences, no commentary
- Use semantic HTML5: header, main, section, footer, nav

SEO — include ALL of these in <head> (fill in real values from the spec):
- <meta name="description" content="..."> (the org's mission, max 155 chars)
- <meta property="og:title" content="...">
- <meta property="og:description" content="...">
- <meta property="og:type" content="website">
- <meta name="twitter:card" content="summary_large_image">
- <link rel="canonical" href="https://${slug}.steward.app">
- A <script type="application/ld+json"> block with Organization schema:
  { "@context":"https://schema.org","@type":"Organization","name":"...","description":"...","email":"...","telephone":"...","address":{"@type":"PostalAddress","streetAddress":"..."} }
${allEvents.length > 0 ? `- A second <script type="application/ld+json"> for the first upcoming event using schema.org/Event type` : ""}

FONTS — Use Google Fonts via <link> tags in <head>. Pick the pairing that fits the org's personality:
- Modern/clean: "Inter" body + "Plus Jakarta Sans" headings
- Warm/classic: "Source Sans 3" body + "Lora" headings
- Bold/contemporary: "DM Sans" body + "Syne" headings
- Elegant/civic: "Nunito" body + "Fraunces" headings
Always load weights 300, 400, 500, 600, 700 for body and 400, 600, 700 for headings.

IMAGES — Use Unsplash source URLs:
- Hero: <img src="https://images.unsplash.com/photo-[ID]?auto=format&fit=crop&w=1920&q=80"> — relevant to org type
- About: supporting photo (community, collaboration, people)
- Safe Unsplash IDs:
  - Community/people: 1529156069898-aa78f52d3b87, 1559027615-cd4628902d4a, 1582213782179-e0d53f98f2ca, 1600880292203-757bb62b4baf
  - Buildings/civic: 1486406146926-c627a92ad1ab, 1577495508326-19a1b3cf65b7, 1568992687947-868a62a9f521
  - Events/gathering: 1540575467063-178a50c9c6d0, 1511795409834-ef04bbd61622, 1515187029135-18ee286d815b
  - Nature/outdoors: 1441974231531-c6227db76b6e, 1469474968028-56623f02e42e
- Hero image: position absolute, width 100%, height 100%, object-fit cover, with a multi-stop gradient overlay

CSS ARCHITECTURE:
:root {
  --primary: [main brand color from spec];
  --primary-light: [lighter variant];
  --accent: [secondary accent color];
  --text: #0f172a;
  --text-light: #64748b;
  --text-muted: #94a3b8;
  --bg: #ffffff;
  --bg-alt: #f8fafc;
  --bg-dark: #0f172a;
  --font-body: 'ChosenBody', sans-serif;
  --font-heading: 'ChosenHeading', serif;
  --radius: 14px;
  --radius-lg: 24px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow: 0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
  --shadow-lg: 0 20px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06);
  --shadow-glow: 0 0 40px rgba([primary-rgb], 0.25);
  --transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
Fully responsive: mobile-first, breakpoints at 768px and 1024px.

TYPOGRAPHY — the foundation of a premium design:
- Hero heading: var(--font-heading), clamp(2.8rem, 6vw, 5.5rem), font-weight 700, letter-spacing -0.04em, line-height 1.05
- Gradient hero text: use background-clip: text + linear-gradient for a stunning heading accent color effect
- Section headings: var(--font-heading), clamp(1.8rem, 3.5vw, 2.8rem), font-weight 700, letter-spacing -0.02em
- Eyebrow labels: 0.78rem, font-weight 600, letter-spacing 0.12em, uppercase, var(--accent)
- Body: var(--font-body), 1.05rem, line-height 1.85, color var(--text-light)
- Lead paragraph: 1.2rem, line-height 1.7, color var(--text-light), max-width 560px

VISUAL DEPTH — what separates elite from average:
1. GRADIENT OVERLAYS: multi-stop gradients on hero (e.g. linear-gradient(160deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.6) 100%))
2. GLASSMORPHISM cards: background: rgba(255,255,255,0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.6); (use on overlaid elements)
3. FLOATING BLOBS: 2-3 absolutely-positioned radial gradient blobs behind hero/featured sections. Example: position:absolute; width:600px; height:600px; background:radial-gradient(circle, rgba([primary-rgb],0.15) 0%, transparent 70%); border-radius:50%; pointer-events:none;
4. CARD DESIGN: white bg, var(--radius), var(--shadow), a colored top border (4px solid var(--accent)), hover: translateY(-8px) + var(--shadow-lg) with transition. No flat cards.
5. SECTION DIVIDERS: use clip-path on section tops for diagonal/wave separators: clip-path: polygon(0 0, 100% 4%, 100% 100%, 0 100%); (adjust %)
6. ACCENT LINES: .accent-line { width:64px; height:4px; background:var(--accent); border-radius:2px; margin: 16px 0 32px; }

LAYOUT PATTERNS:
- Hero: 100vh, full-bleed background image + multi-stop gradient overlay + floating blobs. Center-aligned content with oversized heading, lead paragraph, two CTA buttons (primary + ghost/outline). Animated scroll-down chevron bouncing at bottom.
- About: true asymmetric grid (55/45): image side has a decorative frame (box-shadow + border + slight rotation -2deg), text side has eyebrow + heading + accent line + paragraph + stat strip (3 numbers with labels).
- Services/Programs: 3-column card grid on desktop. Each card: colored top border, large Unicode emoji/icon, title, description, bottom link/arrow. Hover: lift + glow shadow.
- Events: horizontal card layout (date block on left = large day + month abbreviated, bold, accent color; content on right = title, time, location, excerpt). Left border accent strip.
- Contact: two-column on desktop. Left: heading + details (each line: icon symbol + text). Right: floating glass card with call-to-action and social links as pill buttons.
- Footer: dark bg (--bg-dark), 3-col grid. Bottom bar with copyright + subtle rule.

WHITESPACE:
- Sections: padding clamp(80px, 10vw, 140px) 0
- Container: max-width 1200px; margin 0 auto; padding 0 clamp(20px, 5vw, 40px)
- Heading to content gap: 52px
- Card padding: 36px 32px
- Grid gaps: 28px–36px

ANIMATIONS — this is what makes it feel alive:

CSS animations (define in <style>):
@keyframes fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
@keyframes scaleIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
@keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
@keyframes pulse-glow { 0%,100% { box-shadow: 0 0 20px rgba([primary-rgb],0.3); } 50% { box-shadow: 0 0 40px rgba([primary-rgb],0.6); } }
@keyframes bounce-arrow { 0%,100% { transform:translateY(0); } 50% { transform:translateY(8px); } }
@keyframes gradientShift { 0%,100% { background-position:0% 50%; } 50% { background-position:100% 50%; } }

Inline hero content: animation: fadeUp 0.9s ease both; with staggered delays for h1 (0.1s), p (0.3s), buttons (0.5s).
Floating blobs: animation: float 8s ease-in-out infinite; (different durations for each blob: 8s, 11s, 14s)
Hero background: background-size:120%; animation: none (parallax via JS).
Scroll-down arrow: animation: bounce-arrow 1.8s ease-in-out infinite;
CTA button primary: animation: pulse-glow 3s ease-in-out infinite; on :hover

.reveal { opacity:0; transform:translateY(36px); transition:opacity 0.75s ease, transform 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
.reveal.visible { opacity:1; transform:translateY(0); }
.reveal-child:nth-child(1){transition-delay:0s} :nth-child(2){transition-delay:0.1s} :nth-child(3){transition-delay:0.2s} :nth-child(4){transition-delay:0.3s}

INTERACTIVE JAVASCRIPT (inline <script> at end of <body>):
1. IntersectionObserver: adds .visible to .reveal elements when they enter viewport (threshold:0.12)
2. Navbar: starts transparent with white text; on scroll >60px adds solid bg + shadow; on scroll back <20px removes it. Smooth CSS transition.
3. Smooth anchor scroll for all nav links
4. Mobile hamburger: full-width slide-down menu panel with links, close on link click, animated hamburger→X icon
5. Parallax: hero background moves at 0.4x scroll speed (background-position-y update on scroll)
6. Animated counters: on .stat-number elements that have data-target attr, count up from 0 when they enter viewport (requestAnimationFrame, 1.5s duration, easeOutExpo easing)

REQUIRED SECTIONS:
1. NAV — Fixed. Transparent start, solid on scroll. Logo left (text or img), links right. Mobile hamburger. Active link underline accent.${logoInstruction}
2. HERO — 100vh. Full-bleed photo + multi-stop gradient overlay + 2–3 floating gradient blobs. Eyebrow badge ("Est. YYYY" or org type). Oversized gradient-text heading. Lead paragraph. Two buttons: primary (filled, pulse glow on hover) + secondary (ghost/outline). Bouncing scroll-down chevron. Staggered fadeUp animation on load.
3. ABOUT / MISSION — Asymmetric (55/45). Image with decorative frame (slight rotation, box-shadow, border). Text: eyebrow + accent line + heading + paragraph. Stat strip: 3 numbers (years active, members, events/year etc — use plausible values if not in spec). .reveal
${s.services.length > 0 ? `4. PROGRAMS & SERVICES — Eyebrow + heading + 3-col card grid. Each card: 4px top border in --accent, large emoji icon, bold title, description. Hover: lift + glow. Cards: ${s.services.join(", ")}. All .reveal-child for stagger.` : `4. WHAT WE DO — 3-col card grid with accent top-borders describing key activities. All .reveal-child.`}
${allEvents.length > 0 ? `5. EVENTS — id="events-section" on the <section>. Horizontal cards: date block (large day + abbreviated month, accent color) + content (title, time, location, description). Left accent border strip. .reveal` : ""}
6. CONTACT — Diagonal clip-path on section top. Two-column: left = contact details with Unicode icons (📧 📞 📍). Right = floating glass card with headline + social link pill buttons. .reveal
7. FOOTER — Dark (--bg-dark). 3-col: col1 = wordmark + tagline, col2 = quick links, col3 = contact summary. Bottom bar: copyright ${new Date().getFullYear()}.

COLOR: "${s.colors || "navy and gold"}". Map to CSS custom properties. Ensure WCAG AA contrast (4.5:1). Derive --primary-rgb as comma-separated r,g,b for use in rgba() calls.
CONTENT: Real content only — never lorem ipsum. Make up plausible stat numbers if not in spec (e.g. "Founded 1987", "200+ Members", "30+ Annual Events").
Add .reveal to every section's inner wrapper.`;


  const genUserMsg = `Build a website for:
Name: ${s.orgName}
Tagline: ${s.tagline}
Mission: ${s.mission}
Services/Programs: ${s.services.join(", ") || "Community programs"}
Location: ${s.location || "Our community"}
Hours: ${s.hours || ""}
Upcoming Events:
${eventsSection || "None listed"}
Contact Email: ${s.contactEmail || ""}
Contact Phone: ${s.contactPhone || ""}
Social Media: ${s.socialMedia.join(", ") || ""}
Audience: ${s.audience || "Community members"}
Additional: ${s.extras || ""}

Generate the complete HTML now. Start directly with <!DOCTYPE html>.`;

  try {
    const html = await callOpenAI([
      { role: "system", content: genSystemMsg },
      { role: "user", content: genUserMsg },
    ], MAX_GEN_TOKENS, "gpt-4o-mini");

    let cleanedHtml = html.trim();
    if (!cleanedHtml) {
      res.status(500).json({ error: "Site generation returned empty content. Please try again." });
      return;
    }
    const htmlStart = cleanedHtml.indexOf("<!DOCTYPE");
    const altStart = cleanedHtml.indexOf("<html");
    const startIdx = htmlStart >= 0 ? htmlStart : (altStart >= 0 ? altStart : -1);
    if (startIdx > 0) cleanedHtml = cleanedHtml.substring(startIdx);
    if (!cleanedHtml.includes("<html") && !cleanedHtml.includes("<!DOCTYPE")) {
      res.status(500).json({ error: "Site generation returned invalid HTML. Please try again." });
      return;
    }

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

    res.json({ site: { ...site, proposedHtml: undefined }, orgSlug: slug, spec: extractedSpec, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.status(500).json({ error: "Site generation failed. Please try again." });
  }
});

// ─── Change request — PROPOSE (Tier 1+) — stored server-side ─────────────────
router.post("/change-request/propose", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Change requests require a paid plan (Starter or higher)" });
    return;
  }

  const usageInfo = await checkAndResetUsage(org as Parameters<typeof checkAndResetUsage>[0], res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  const { changeRequest } = req.body as { changeRequest: string };
  if (!changeRequest?.trim()) { res.status(400).json({ error: "changeRequest is required" }); return; }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.generatedHtml) { res.status(404).json({ error: "No site found — generate one first" }); return; }

  try {
    const proposedHtml = await callOpenAI([
      {
        role: "system",
        content: `You are an expert web developer proposing a specific edit to an existing HTML website.
Apply ONLY the user's requested change — nothing more.
IMPORTANT: Preserve ALL existing JavaScript, CSS animations, hover effects, and interactive features. Do not remove or break any dynamic functionality.
Output ONLY the complete, updated HTML document starting with <!DOCTYPE html>. No explanations or commentary.`,
      },
      {
        role: "user",
        content: `Current website HTML:\n${site.generatedHtml}\n\nRequested change: "${changeRequest}"\n\nApply this change and output the complete updated HTML.`,
      },
    ], MAX_CHANGE_TOKENS, "gpt-4o-mini");

    let cleanedHtml = proposedHtml.trim();
    const htmlStart = cleanedHtml.indexOf("<!DOCTYPE");
    const altStart = cleanedHtml.indexOf("<html");
    const startIdx = htmlStart >= 0 ? htmlStart : (altStart >= 0 ? altStart : -1);
    if (startIdx > 0) cleanedHtml = cleanedHtml.substring(startIdx);

    // Validate output looks like HTML
    if (!cleanedHtml.includes("<html") && !cleanedHtml.includes("<!DOCTYPE")) {
      res.status(500).json({ error: "AI returned invalid HTML. Please try again." });
      return;
    }

    // Save proposal server-side — do NOT return HTML to client
    await db.update(sitesTable).set({ proposedHtml: cleanedHtml }).where(eq(sitesTable.orgId, org.id));

    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;

    res.json({ proposalReady: true, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.status(500).json({ error: "Proposal generation failed. Please try again." });
  }
});

// ─── Change request — APPLY (server-stored proposal only, no client HTML) ─────
router.post("/change-request/apply", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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

// ─── Sync events from DB into site ───────────────────────────────────────────
router.post("/sync-events", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Syncing events requires a paid plan (Starter or higher)" });
    return;
  }

  const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!existing?.generatedHtml) { res.status(404).json({ error: "No published site found. Generate your site first." }); return; }

  const usageInfo = await checkAndResetUsage(org, res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  // Fetch events from DB
  const today = new Date().toISOString().split("T")[0];
  const allEventsFromDb = await db
    .select({ name: eventsTable.name, startDate: eventsTable.startDate, startTime: eventsTable.startTime, endTime: eventsTable.endTime, location: eventsTable.location, description: eventsTable.description })
    .from(eventsTable)
    .where(eq(eventsTable.orgId, org.id))
    .limit(15);
  const futureEvents = allEventsFromDb.filter(e => !e.startDate || e.startDate >= today);
  const eventsToShow = futureEvents.length > 0 ? futureEvents : allEventsFromDb.slice(0, 5);

  if (eventsToShow.length === 0) {
    res.status(400).json({ error: "No events found. Add events in the Events section first." });
    return;
  }

  const eventsText = eventsToShow.map(e => {
    const parts = [e.name];
    if (e.startDate) parts.push(new Date(e.startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
    if (e.startTime) parts.push(`${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`);
    if (e.location) parts.push(e.location);
    if (e.description) parts.push(e.description);
    return parts.join(" | ");
  }).join("\n");

  // Fetch website spec for additional context (improves accuracy of updates)
  const [websiteSpec] = await db.select().from(websiteSpecsTable).where(eq(websiteSpecsTable.orgId, org.id));
  const specContext = websiteSpec
    ? `Site: ${websiteSpec.orgName ?? org.name} | Colors: ${websiteSpec.colors ?? "navy and gold"} | Mission: ${websiteSpec.mission ?? ""}`
    : `Site: ${org.name}`;

  try {
    const client = getOpenAIClient();
    const systemMsg = `You are an expert web developer. You will receive an existing HTML website and a list of upcoming events.
Your task: Update the events section of the HTML to show exactly the provided events. If no events section exists, add one before the contact or footer section.
Each event should display: name (bold/prominent), date, time (if available), and location (if available) in a visually appealing card or list-item style that matches the existing site's CSS design language.
CRITICAL: Output the COMPLETE updated HTML document. Do not truncate or abbreviate any part. Start with <!DOCTYPE html>. No markdown, no code fences, no explanation.`;

    const userMsg = `${specContext}

Here is the current website HTML:

${existing.generatedHtml}

Please update the events section to show these upcoming events:
${eventsText}

Return the complete updated HTML document.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: userMsg }],
      max_tokens: MAX_CHANGE_TOKENS,
    });

    let raw = completion.choices[0]?.message?.content ?? "";
    const start = raw.indexOf("<!DOCTYPE");
    const altStart = raw.indexOf("<html");
    const htmlStart = start !== -1 ? start : altStart;
    if (htmlStart !== -1) raw = raw.substring(htmlStart);
    const endTag = raw.lastIndexOf("</html>");
    const cleanedHtml = endTag !== -1 ? raw.substring(0, endTag + 7) : raw;

    if (!cleanedHtml.includes("<html") && !cleanedHtml.includes("<!DOCTYPE")) {
      res.status(500).json({ error: "AI returned invalid HTML. Please try again." });
      return;
    }

    await db.update(sitesTable).set({ proposedHtml: cleanedHtml }).where(eq(sitesTable.orgId, org.id));
    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;

    res.json({ proposalReady: true, eventCount: eventsToShow.length, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.status(500).json({ error: "Failed to sync events. Please try again." });
  }
});

// ─── Schedule CRUD (Tier 1a+) ─────────────────────────────────────────────────
router.get("/schedule", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires the Autopilot plan or higher" }); return; }
  const [schedule] = await db.select().from(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  res.json({ schedule: schedule ?? null });
});

router.post("/schedule", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires the Autopilot plan or higher" }); return; }
  await db.delete(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  res.json({ success: true });
});

// ─── Schedule manual run ──────────────────────────────────────────────────────
router.post("/schedule/run", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
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
  const org = await resolveOrg(req, res);
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

export default router;
