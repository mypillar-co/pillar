import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sitesTable, siteUpdateSchedulesTable, websiteSpecsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const CONTEXT_TURNS = 10;
const MAX_CHAT_TOKENS = 700;
const MAX_GEN_TOKENS = 6000;
const MAX_SPEC_TOKENS = 1200;
const MAX_CHANGE_TOKENS = 6000;

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

async function callClaude(
  messages: { role: string; content: string }[],
  system: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
  const data = await response.json() as { content: { type: string; text: string }[] };
  return data.content?.[0]?.text ?? "";
}

async function callClaudeStreaming(
  messages: { role: string; content: string }[],
  system: string,
  maxTokens: number,
  res: Response,
): Promise<string> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: maxTokens,
      system,
      messages,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    res.write(`data: ${JSON.stringify({ error: `AI service error (${upstream.status})` })}\n\n`);
    res.end();
    throw new Error(`Anthropic streaming ${upstream.status}: ${errText}`);
  }

  let fullText = "";
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === "[DONE]") continue;
      try {
        const event = JSON.parse(dataStr) as {
          type: string;
          delta?: { type: string; text: string };
        };
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const text = event.delta.text;
          fullText += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullText;
}

// ─── Interview chat (SSE streaming) ───────────────────────────────────────────
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
  const trimmedHistory = history.slice(-(CONTEXT_TURNS * 2)).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  const systemPrompt = `You are a friendly website consultant helping ${name} (a ${type}) build their public website through Steward.

Your job is to conduct a structured interview to gather website content. Ask ONE question at a time.

Interview sequence — follow this order exactly:
1. "Let's build your website! First — what is ${name}'s mission or main purpose? Describe it in 1-2 sentences."
2. "What services, programs, or activities do you offer your members or community?"
3. "Where are you located? Include your address or meeting location, and when you typically meet or operate."
4. "Do you host events or programs throughout the year? If so, give a couple of examples."
5. "How can visitors contact you? (email address, phone number, and any social media handles)"
6. "Who is your primary audience — who do you serve or want to attract to your site?"
7. "Any color preferences for the site? (e.g., 'navy and gold', 'forest green and white', 'clean and modern black')"
8. "Last one — is there anything else to feature? (announcements, sponsor logos, history, membership info, etc.)"

After each answer, acknowledge in ONE brief sentence, then ask the next question.
After collecting all 8 answers, say EXACTLY: "I have everything I need! Click **Generate My Site** to build your website."
Keep every response under 60 words. Stay focused — no extra suggestions.`;

  try {
    const fullReply = await callClaudeStreaming(
      [...trimmedHistory, { role: "user", content: message }],
      systemPrompt,
      MAX_CHAT_TOKENS,
      res,
    );

    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;

    res.write(`data: ${JSON.stringify({ done: true, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed })}\n\n`);
    res.end();
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ error: "AI service unavailable. Please try again." });
    }
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
  res.json({ site: site ?? null, orgSlug: org.slug, schedule: schedule ?? null, spec: spec ?? null, tier: org.tier });
});

// ─── Generate site from interview history ─────────────────────────────────────
router.post("/generate", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { history = [], orgName, orgType } = req.body as {
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
  };

  const name = orgName ?? org.name;
  const type = orgType ?? org.type ?? "organization";
  const slug = org.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const conversationText = history.length > 0
    ? history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")
    : `Organization name: ${name}\nType: ${type}`;

  // Step 1: Extract structured spec from conversation
  const specSystem = `Extract website content from this conversation and output ONLY valid JSON.
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
Use empty strings and empty arrays for anything not mentioned. Output ONLY the JSON object.`;

  let extractedSpec = {
    orgName: name,
    tagline: `Welcome to ${name}`,
    mission: `${name} serves our community.`,
    services: [] as string[],
    location: "",
    hours: "",
    events: [] as string[],
    contactEmail: "",
    contactPhone: "",
    socialMedia: [] as string[],
    audience: "",
    colors: "navy and gold",
    extras: "",
  };

  try {
    const specJson = await callClaude(
      [{ role: "user", content: `Extract website info from this conversation:\n\n${conversationText}` }],
      specSystem,
      MAX_SPEC_TOKENS,
    );
    const parsed = JSON.parse(specJson.trim()) as typeof extractedSpec;
    extractedSpec = { ...extractedSpec, ...parsed };
  } catch {
    // Use defaults if extraction fails
  }

  // Step 2: Save to website_specs table (dedicated, normalized table)
  const [existingSpec] = await db.select().from(websiteSpecsTable).where(eq(websiteSpecsTable.orgId, org.id));
  if (existingSpec) {
    await db.update(websiteSpecsTable).set({
      ...extractedSpec,
      rawConversation: history,
      updatedAt: new Date(),
    }).where(eq(websiteSpecsTable.orgId, org.id));
  } else {
    await db.insert(websiteSpecsTable).values({
      orgId: org.id,
      ...extractedSpec,
      rawConversation: history,
    });
  }

  // Step 3: Generate HTML from the spec
  const s = extractedSpec;
  const genSystem = `You are an expert web developer. Generate a complete, beautiful, self-contained HTML page.

STRICT RULES:
- Output ONLY valid HTML — start with <!DOCTYPE html>, end with </html>
- No markdown, no code fences, no text before or after the HTML
- All CSS must be in a <style> tag inside <head> — no external stylesheets or CDN links
- No external dependencies — use system font stacks only (e.g. -apple-system, Georgia, sans-serif)
- No JavaScript whatsoever
- Fully responsive with CSS flexbox/grid and media queries
- Use semantic HTML5 (header, main, section, footer, nav)
- Smooth transitions/hover effects via CSS only
- Professionally designed: consistent spacing, clear visual hierarchy, good color contrast

REQUIRED SECTIONS (in order):
1. Sticky navigation bar — org name logo on left, links on right
2. Hero — large heading, tagline, brief mission blurb, a call-to-action button
3. About — mission/purpose in more detail
${s.services.length > 0 ? `4. Services — responsive grid of cards for: ${s.services.join(", ")}` : "4. Programs — responsive grid of 3 placeholder cards with icons"}
${s.events.length > 0 ? `5. Events — clean card list for: ${s.events.join(", ")}` : ""}
6. Contact — email, phone, address, social media in a clean layout
7. Footer — org name, © ${new Date().getFullYear()}, tagline

COLOR SCHEME: ${s.colors || "professional navy and gold"}.
Use real content from the spec — never use lorem ipsum or placeholder text.`;

  const genPrompt = `Build a website for:
Name: ${s.orgName}
Tagline: ${s.tagline}
Mission: ${s.mission}
Services/Programs: ${s.services.join(", ") || "Community programs"}
Location: ${s.location || "Our community"}
Hours: ${s.hours || ""}
Events: ${s.events.join(", ") || ""}
Contact Email: ${s.contactEmail || ""}
Contact Phone: ${s.contactPhone || ""}
Social Media: ${s.socialMedia.join(", ") || ""}
Audience: ${s.audience || "Community members"}
Additional: ${s.extras || ""}

Generate the complete HTML now. Start directly with <!DOCTYPE html>.`;

  try {
    const html = await callClaude([{ role: "user", content: genPrompt }], genSystem, MAX_GEN_TOKENS);

    let cleanedHtml = html.trim();
    if (!cleanedHtml.startsWith("<!DOCTYPE") && !cleanedHtml.startsWith("<html")) {
      const idx = cleanedHtml.indexOf("<!DOCTYPE");
      cleanedHtml = idx >= 0 ? cleanedHtml.substring(idx) : cleanedHtml;
    }

    const metaTitle = s.orgName || name;
    const metaDescription = s.mission || `Welcome to ${name}`;

    const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
    let site;
    if (existing) {
      [site] = await db.update(sitesTable)
        .set({ generatedHtml: cleanedHtml, orgSlug: slug, metaTitle, metaDescription, updatedAt: new Date() })
        .where(eq(sitesTable.orgId, org.id))
        .returning();
    } else {
      [site] = await db.insert(sitesTable)
        .values({ orgId: org.id, orgSlug: slug, generatedHtml: cleanedHtml, metaTitle, metaDescription, status: "draft" })
        .returning();
    }

    // Link spec to site
    await db.update(websiteSpecsTable).set({ siteId: site.id }).where(eq(websiteSpecsTable.orgId, org.id)).catch(() => {});

    res.json({ site, orgSlug: slug, spec: extractedSpec });
  } catch {
    res.status(500).json({ error: "Site generation failed. Please try again." });
  }
});

// ─── Change request — PROPOSE (Tier 1+) ────────────────────────────────────
router.post("/change-request/propose", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Change requests require a paid plan (Tier 1 or higher)" });
    return;
  }

  const usageInfo = await checkAndResetUsage(org as Parameters<typeof checkAndResetUsage>[0], res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  const { changeRequest } = req.body as { changeRequest: string };
  if (!changeRequest?.trim()) { res.status(400).json({ error: "changeRequest is required" }); return; }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.generatedHtml) { res.status(404).json({ error: "No site found — generate one first" }); return; }

  const proposeSystem = `You are an expert web developer proposing a specific edit to an existing HTML website.
Apply ONLY the user's requested change — nothing more.
Output ONLY the complete, updated HTML document starting with <!DOCTYPE html>. No explanations or commentary.`;

  const proposePrompt = `Current website HTML:
${site.generatedHtml}

Requested change: "${changeRequest}"

Apply this change and output the complete updated HTML.`;

  try {
    const proposedHtml = await callClaude([{ role: "user", content: proposePrompt }], proposeSystem, MAX_CHANGE_TOKENS);

    let cleanedHtml = proposedHtml.trim();
    if (!cleanedHtml.startsWith("<!DOCTYPE") && !cleanedHtml.startsWith("<html")) {
      const idx = cleanedHtml.indexOf("<!DOCTYPE");
      cleanedHtml = idx >= 0 ? cleanedHtml.substring(idx) : cleanedHtml;
    }

    // Increment usage for the proposal (1 AI call)
    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;

    // Return proposed HTML WITHOUT saving — client holds it for user confirmation
    res.json({ proposedHtml: cleanedHtml, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.status(500).json({ error: "Proposal generation failed. Please try again." });
  }
});

// ─── Change request — APPLY (confirm) ─────────────────────────────────────────
router.post("/change-request/apply", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  if (!TIERS_ALLOWING_CHANGES.has(org.tier ?? "")) {
    res.status(403).json({ error: "Change requests require a paid plan (Tier 1 or higher)" });
    return;
  }

  const { confirmedHtml } = req.body as { confirmedHtml: string };
  if (!confirmedHtml?.trim()) { res.status(400).json({ error: "confirmedHtml is required" }); return; }
  if (!confirmedHtml.includes("<!DOCTYPE") && !confirmedHtml.includes("<html")) {
    res.status(400).json({ error: "confirmedHtml must be a valid HTML document" }); return;
  }

  const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!existing) { res.status(404).json({ error: "No site found" }); return; }

  const [site] = await db.update(sitesTable)
    .set({ generatedHtml: confirmedHtml, updatedAt: new Date() })
    .where(eq(sitesTable.orgId, org.id))
    .returning();

  res.json({ site });
});

// ─── Schedule CRUD (Tier 1a+) ─────────────────────────────────────────────────
router.get("/schedule", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires Tier 1a or higher" }); return; }
  const [schedule] = await db.select().from(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  res.json({ schedule: schedule ?? null });
});

router.post("/schedule", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires Tier 1a or higher" }); return; }

  const { frequency, dayOfWeek, updateItems, customInstructions, isActive } = req.body as {
    frequency: string;
    dayOfWeek?: string;
    updateItems?: string[];
    customInstructions?: string;
    isActive?: boolean;
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
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires Tier 1a or higher" }); return; }
  await db.delete(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  res.json({ success: true });
});

// ─── Schedule manual run ──────────────────────────────────────────────────────
router.post("/schedule/run", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires Tier 1a or higher" }); return; }

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

  const runSystem = `You are an expert web developer running a scheduled update on an organization's website.
Apply the requested updates to the HTML. Keep all sections, styles, and structure intact.
Output ONLY the complete updated HTML starting with <!DOCTYPE html>.`;

  const runPrompt = `Current website HTML:
${site.generatedHtml}

Scheduled update instructions:
${instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}

Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Apply all updates and output the complete updated HTML.`;

  try {
    const updatedHtml = await callClaude([{ role: "user", content: runPrompt }], runSystem, MAX_CHANGE_TOKENS);
    let cleanedHtml = updatedHtml.trim();
    if (!cleanedHtml.startsWith("<!DOCTYPE") && !cleanedHtml.startsWith("<html")) {
      const idx = cleanedHtml.indexOf("<!DOCTYPE");
      cleanedHtml = idx >= 0 ? cleanedHtml.substring(idx) : cleanedHtml;
    }

    await db.update(sitesTable).set({ generatedHtml: cleanedHtml, updatedAt: new Date() }).where(eq(sitesTable.orgId, org.id));
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

  res.json({ site });
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
