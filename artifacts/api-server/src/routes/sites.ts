import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sitesTable, siteUpdateSchedulesTable, websiteSpecsTable, eventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { buildSiteFromTemplate, type SiteContent } from "../siteTemplate";

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

  const { history = [], orgName, orgType, logoDataUrl: rawLogoDataUrl, photoUrls: rawPhotoUrls } = req.body as {
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
    logoDataUrl?: unknown;
    photoUrls?: unknown;
  };
  // Validate logo on server side — reject SVG, non-image data, oversized payloads
  const logoDataUrl = validateLogoDataUrl(rawLogoDataUrl);
  // Validate photo URLs — must be strings, same origin (/api/storage/...) or https://
  const photoUrls: string[] = Array.isArray(rawPhotoUrls)
    ? (rawPhotoUrls as unknown[])
        .filter((u): u is string => typeof u === "string" && (u.startsWith("/api/storage/") || u.startsWith("https://")))
        .slice(0, 6)
    : [];

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
  const futureEvents = upcomingEvents.filter(e => !e.startDate || e.startDate >= today);
  const allEvents = futureEvents.length > 0 ? futureEvents : upcomingEvents.slice(0, 5);

  // Step 4: AI generates CONTENT JSON only — not design, not CSS
  const safeOrgName = (s.orgName || org.name).replace(/["<>&]/g, c => c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const HERO_IDS = ["1529156069898-aa78f52d3b87","1559027615-cd4628902d4a","1582213782179-e0d53f98f2ca","1600880292203-757bb62b4baf","1540575467063-178a50c9c6d0","1511795409834-ef04bbd61622","1515187029135-18ee286d815b","1486406146926-c627a92ad1ab"];
  const ABOUT_IDS = ["1568992687947-868a62a9f521","1577495508326-19a1b3cf65b7","1441974231531-c6227db76b6e","1469474968028-56623f02e42e","1582213782179-e0d53f98f2ca","1559027615-cd4628902d4a"];

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

  const defaultPrograms = s.services.length > 0
    ? s.services.slice(0, 3).map((svc, i) => ({
        icon: ["🤝","📚","🌟"][i] ?? "⭐",
        title: svc,
        description: `Our ${svc} program brings community members together for meaningful impact and lasting connection.`,
      }))
    : [
        { icon: "🤝", title: "Community Service", description: "We unite volunteers around shared goals through regular service projects that address local needs and strengthen our community bonds." },
        { icon: "📚", title: "Education & Training", description: "From youth programs to professional development, we invest in learning opportunities that help our members and neighbors grow." },
        { icon: "🌟", title: "Leadership Development", description: "Our programs identify and develop the next generation of civic leaders through mentorship, training, and hands-on experience." },
      ];

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
  try {
    const contentJson = await callOpenAI([
      {
        role: "system",
        content: `You are a copywriter for civic and community organizations. Given org info, output ONLY a valid JSON object — no explanation, no markdown fences.

Required JSON structure:
{
  "primaryHex": "#hex derived from: "${colorHints}". Navy=#1e3a5f, Gold=#c9a84c, Green=#2d6a4f, Red=#9b2226, Blue=#0077b6, Purple=#5e2d91",
  "accentHex": "#hex complementary accent — use gold/amber (#c9a84c) if primary is dark, use navy if primary is warm",
  "primaryRgb": "r,g,b comma-separated of primaryHex e.g. 30,58,95",
  "heroUnsplashId": "one ID from: ${HERO_IDS.join(",")}",
  "aboutUnsplashId": "different ID from: ${ABOUT_IDS.join(",")}",
  "orgTypeLabel": "2-3 word label e.g. Civic Organization, Masonic Lodge, Community Association, Service Club, Homeowners Association, Rotary Club",
  "aboutHeading": "compelling 3-6 word heading for mission section e.g. 'Serving Our Community Since 1952' or 'Building Stronger Neighborhoods'",
  "missionExpanded": "2-3 compelling sentences about their mission. Make it specific and meaningful. Use real details from the spec.",
  "stat1Value": "founding year e.g. '1952'", "stat1Label": "Year Founded",
  "stat2Value": "member count e.g. '340+'", "stat2Label": "Active Members",
  "stat3Value": "annual events e.g. '28+'", "stat3Label": "Annual Events",
  "programs": [
    {"icon":"relevant emoji","title":"program name","description":"2 compelling sentences about this specific program"},
    {"icon":"emoji","title":"program name","description":"2 sentences"},
    {"icon":"emoji","title":"program name","description":"2 sentences"}
  ],
  "contactHeading": "3-5 word invitation e.g. 'Come Join Our Community'",
  "contactIntro": "1-2 sentences warmly inviting contact or membership",
  "contactCardHeading": "short CTA headline e.g. 'Ready to get involved?'",
  "contactCardText": "1-2 sentences for the contact card body"
}
Rules: use REAL content from the spec — no lorem ipsum. If stat values not given, infer plausible ones. Use relevant emojis (🤝🎓🌿🎭🏛️🌟📚🤲🎵🏅).`,
      },
      {
        role: "user",
        content: `Name: ${s.orgName}\nType: ${type}\nTagline: ${s.tagline}\nMission: ${s.mission}\nServices: ${s.services.join(", ") || ""}\nLocation: ${s.location || ""}\nColors: ${colorHints}\nEmail: ${s.contactEmail || ""}\nPhone: ${s.contactPhone || ""}\nAudience: ${s.audience || ""}\nExtras: ${s.extras || ""}`,
      },
    ], 2000, "gpt-5-mini");

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

  // Step 5: Build all HTML blocks server-side from real data
  const heroImageUrl = photoUrls.length > 0
    ? photoUrls[0]
    : `https://images.unsplash.com/photo-${contentData.heroUnsplashId}?auto=format&fit=crop&w=1920&q=80`;
  const aboutImageUrl = photoUrls.length > 1
    ? photoUrls[1]
    : `https://images.unsplash.com/photo-${contentData.aboutUnsplashId}?auto=format&fit=crop&w=900&q=80`;

  const navLogoHtml = logoDataUrl
    ? `<div class="nav-logo"><img src="${logoDataUrl}" alt="${safeOrgName} logo"></div>`
    : `<div class="nav-logo">${safeOrgName}</div>`;
  const footerLogoHtml = logoDataUrl
    ? `<div class="footer-brand-name"><img src="${logoDataUrl}" alt="${safeOrgName} logo"></div>`
    : `<div class="footer-brand-name">${safeOrgName}</div>`;

  const programsBlock = contentData.programs.map(p => `
    <div class="card reveal-child">
      <span class="card-icon">${p.icon}</span>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.description)}</p>
    </div>`).join("\n");

  const buildEventRow = (e: typeof allEvents[0]) => {
    const dateObj = e.startDate ? new Date(e.startDate + "T00:00:00") : null;
    const day = dateObj ? String(dateObj.getDate()) : "";
    const month = dateObj ? dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
    const timeStr = e.startTime ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ""}` : "";
    return `
    <div class="event-row reveal">
      <div class="event-date-block">
        ${day ? `<span class="event-day">${day}</span><span class="event-month">${month}</span>` : `<span class="event-day" style="font-size:0.8rem">TBD</span>`}
      </div>
      <div class="event-info">
        <h4>${esc(e.name)}</h4>
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}
        <div class="event-meta">
          ${timeStr ? `<span>🕐 ${esc(timeStr)}</span>` : ""}
          ${e.location ? `<span>📍 ${esc(e.location)}</span>` : ""}
        </div>
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
    statsBlock,
    programsBlock,
    eventsSection: eventsSectionHtml,
    navEventsLink,
    mobileEventsLink,
    footerEventsLink,
    contactHeading: esc(contentData.contactHeading),
    contactIntro: esc(contentData.contactIntro),
    contactCardHeading: esc(contentData.contactCardHeading),
    contactCardText: esc(contentData.contactCardText),
    contactEmail: esc(s.contactEmail || ""),
    contactDetails,
    footerContact,
    navLogo: navLogoHtml,
    footerLogo: footerLogoHtml,
    metaDescription: esc((s.mission || contentData.missionExpanded).substring(0, 155)),
    canonicalUrl: `https://${slug}.steward.app`,
    schemaJson,
    currentYear: String(new Date().getFullYear()),
  };

  try {
    const cleanedHtml = buildSiteFromTemplate(siteContent);

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
