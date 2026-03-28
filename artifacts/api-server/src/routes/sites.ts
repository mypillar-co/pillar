import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sitesTable, siteUpdateSchedulesTable, websiteSpecsTable, eventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

const CONTEXT_TURNS = 10;
const MAX_CHAT_TOKENS = 700;
const MAX_GEN_TOKENS = 8000;
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

  const genSystemMsg = `You are an award-winning web designer creating a stunning, modern website for a civic organization. Generate a complete, self-contained HTML page that looks like it cost $10,000 to build.

STRICT RULES:
- Output ONLY valid HTML — start with <!DOCTYPE html>, end with </html>
- No markdown, no code fences, no text before or after the HTML
- All CSS must be in a <style> tag inside <head> — no external stylesheets or CDN links
- No external dependencies — use system font stacks: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif for body; Georgia, 'Times New Roman', serif for accent headings
- Fully responsive with CSS flexbox/grid and @media queries for mobile (max-width: 768px) and tablet (max-width: 1024px)
- Use semantic HTML5 (header, main, section, footer, nav)

JAVASCRIPT — add these dynamic features using inline <script> at the end of <body>:
- Scroll-triggered fade-in animations: elements with class "reveal" should fade in and slide up when they enter the viewport using IntersectionObserver
- Smooth scroll for anchor links
- Mobile hamburger menu toggle (hide nav links on mobile, show hamburger button that toggles a dropdown)
- Sticky nav that adds a background/shadow on scroll (starts transparent, gains background when scrolled past 50px)
- Counter animation for any statistics/numbers: animate from 0 to the target number when visible

ANIMATION CSS — include these in <style>:
- @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
- @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
- @keyframes slideInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
- @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
- .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease, transform 0.8s ease; }
- .reveal.visible { opacity: 1; transform: translateY(0); }
- Add staggered animation delays: .reveal:nth-child(2) { transition-delay: 0.15s; } .reveal:nth-child(3) { transition-delay: 0.3s; } etc.
- Hover effects: cards should lift (transform: translateY(-8px)) with enhanced shadow on hover
- Buttons should have hover glow effect: box-shadow: 0 8px 25px rgba(primary-color, 0.4) on hover

DESIGN STANDARDS — these are non-negotiable:
- Generous whitespace: sections should have 100-120px vertical padding, cards need 32px inner padding
- Typography hierarchy: hero heading 3.5-5rem (bold, letter-spacing: -0.02em), section headings 2.5rem, sub-headings 1.25rem, body 1.05rem with line-height: 1.7
- Use font-weight contrast: 800 for hero, 700 for section titles, 400 for body, 300 for captions
- Subtle depth: use layered shadows (0 4px 6px rgba(0,0,0,0.04), 0 10px 30px rgba(0,0,0,0.08)) on cards
- Rounded corners: 16px for cards, 12px for inner elements, 50px for pill buttons
- Full-width sections with max-width containers (1200px) centered inside
- Alternating section backgrounds: alternate between white/light and a very subtle tinted background (e.g., primary color at 3-5% opacity)
- Buttons: padding 16px 36px, font-weight 600, subtle shadow, hover lift + glow, rounded-full style
- Navigation: clean, well-spaced links, starts transparent with white text, gains solid background on scroll
- Use CSS gradients artfully — hero should have a multi-stop gradient (e.g., 135deg, primary-dark, primary, accent)
- The hero should be dramatic — 85vh minimum height, oversized heading, decorative gradient orbs or shapes using CSS pseudo-elements (::before, ::after with blurred colored circles)
- Add decorative elements: use ::before and ::after pseudo-elements for accent dots, lines, or gradient blobs behind sections
- Cards should have subtle top-border accent (3px solid primary color) or a colored left bar
- Use CSS grid with gap: 32px for card layouts
- Section headings should have a decorative underline or accent element beneath them (a small colored bar, 60px wide, 3px tall, centered)

VISUAL DEPTH TECHNIQUES:
- Add a subtle dot-grid or radial gradient pattern to at least one section background
- Use backdrop-filter: blur() for glassmorphism effects on the nav bar
- Add a gradient border on the hero CTA button (using border-image or a wrapper technique)
- Event cards should have a date badge — a small box with the month abbreviation and day number, styled prominently
- Statistics section (if applicable): large numbers with counter animation, brief label underneath, arranged in a 3-4 column grid

REQUIRED SECTIONS (in order):
1. Navigation bar — starts transparent with backdrop-blur, gains solid background on scroll. Org name/logo on left, section links on right, mobile hamburger${logoInstruction}
2. Hero — 85vh, dramatic multi-color gradient background with decorative CSS shapes (blurred circles via ::before/::after). Oversized heading (4-5rem), tagline, prominent CTA button with glow effect. Add floating decorative elements.
3. About / Mission — clean two-column layout (text on one side, a colored accent card or stat highlight on the other). Add a "reveal" animation class.
${s.services.length > 0 ? `4. Programs & Services — responsive grid (2-3 columns) of cards with colored top-border accents, each with a small emoji or Unicode icon, title, and description. Cards: ${s.services.join(", ")}` : "4. What We Do — responsive grid of 3 elegant cards with colored accents describing key activities"}
${allEvents.length > 0 ? `5. Upcoming Events — card layout with date badges (styled month+day boxes in primary color). Each card: date badge on left, event name (bold), time, location, and description on right. Add hover lift effect.` : ""}
6. Contact — elegant split layout. Left side: heading + description + contact details (email, phone, address with small icons or Unicode symbols). Right side: a styled card with a "Get in Touch" message and social media links as icon buttons. Add subtle background pattern.
7. Footer — full-width dark background. Multi-column layout: org info + tagline, quick links, contact info. Copyright © ${new Date().getFullYear()}. Add a subtle top-border gradient line.

COLOR SCHEME: ${s.colors || "professional navy and gold"}.
Use ONLY real content from the spec below — never use lorem ipsum, placeholder text, or made-up information.
Every section should use the "reveal" class for scroll-triggered animations.`;

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

export default router;
