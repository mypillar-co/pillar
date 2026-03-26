import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sitesTable, siteUpdateSchedulesTable } from "@workspace/db";
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

// ─── Interview chat ───────────────────────────────────────────────────────────
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

Your job is to conduct a structured interview to gather website content. Ask ONE question at a time and wait for the answer.

Interview sequence — follow this order exactly:
1. "Let's build your website! First — what is ${name}'s mission or main purpose? Describe it in 1-2 sentences."
2. "What services, programs, or activities do you offer your members or community?"
3. "Where are you located? Include your address or meeting location, and when you typically meet or operate."
4. "Do you host events or programs throughout the year? If so, give a couple of examples."
5. "How can visitors contact you? (email address, phone number, and any social media handles)"
6. "Who is your primary audience — who do you serve or want to attract to your site?"
7. "Any color preferences for the site? (e.g., 'navy and gold', 'forest green and white', 'clean and modern black')"
8. "Last one — is there anything else you want featured? (announcements, sponsor logos, history, membership info, etc.)"

After each answer, acknowledge in ONE brief sentence, then ask the next question.
After collecting all 8 answers, say EXACTLY this (nothing more): "I have everything I need! Click **Generate My Site** to build your website."
Keep every response under 60 words. Stay focused. Do not add suggestions or commentary beyond the acknowledgment and next question.`;

  try {
    const reply = await callClaude([...trimmedHistory, { role: "user", content: message }], systemPrompt, MAX_CHAT_TOKENS);
    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;
    res.json({ reply, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.json({
      reply: `I'm having trouble connecting right now. Could you tell me a bit about ${name}'s mission?`,
      used,
      limit: monthlyLimit,
      remaining: monthlyLimit - used,
    });
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
  res.json({ site: site ?? null, orgSlug: org.slug, schedule: schedule ?? null, tier: org.tier });
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

  // Step 1: Generate structured spec JSON
  const specSystem = `You are extracting website content from a conversation. Output ONLY valid JSON with this exact structure:
{
  "orgName": "...",
  "tagline": "...",
  "mission": "...",
  "services": ["...", "..."],
  "location": "...",
  "hours": "...",
  "events": ["...", "..."],
  "contact": { "email": "...", "phone": "...", "social": [] },
  "audience": "...",
  "colors": "...",
  "extras": "..."
}
Fill in all fields based on the conversation. Use empty string "" for anything not mentioned. Output ONLY the JSON object, nothing else.`;

  let websiteSpec: Record<string, unknown> = {
    orgName: name,
    tagline: `Welcome to ${name}`,
    mission: `${name} serves our community.`,
    services: [],
    location: "",
    hours: "",
    events: [],
    contact: { email: "", phone: "", social: [] },
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
    const parsed = JSON.parse(specJson.trim()) as Record<string, unknown>;
    websiteSpec = { ...websiteSpec, ...parsed };
  } catch {
    // Use defaults if spec extraction fails
  }

  // Step 2: Generate HTML from spec
  const spec = websiteSpec;
  const services = Array.isArray(spec.services) ? (spec.services as string[]) : [];
  const events = Array.isArray(spec.events) ? (spec.events as string[]) : [];
  const contact = (spec.contact as { email?: string; phone?: string; social?: string[] }) ?? {};
  const colorHint = (spec.colors as string) || "professional";

  const genSystem = `You are an expert web developer. Generate a complete, beautiful, self-contained HTML page.

STRICT RULES:
- Output ONLY valid HTML — start with <!DOCTYPE html>, end with </html>
- No markdown, no code fences, no text before or after the HTML
- All CSS must be in a <style> tag inside <head> — no external stylesheets
- No external dependencies — no CDN, no Google Fonts — use system font stacks only
- No JavaScript whatsoever
- Fully responsive with CSS flexbox/grid and media queries
- Use semantic HTML5 (header, main, section, footer, nav)

REQUIRED SECTIONS (in order):
1. Nav bar — org name + simple navigation links
2. Hero — large, bold org name, tagline, brief mission blurb
3. About — mission in more detail, who you serve
${services.length > 0 ? `4. Services/Programs — grid of: ${services.join(", ")}` : "4. Services — placeholder grid (3 items with icons)"}
${events.length > 0 ? `5. Events — list/cards for: ${events.join(", ")}` : ""}
6. Contact — email, phone, address displayed cleanly
7. Footer — org name, © year, tagline

COLOR SCHEME: ${colorHint}. Make it visually polished with consistent colors, good contrast, and a professional look.
Use real content from the spec — never use lorem ipsum.`;

  const genPrompt = `Build a website for this organization:

Name: ${spec.orgName || name}
Tagline: ${spec.tagline || `Welcome to ${name}`}
Mission: ${spec.mission || "Serving our community."}
Services: ${services.join(", ") || "Community programs"}
Location: ${spec.location || ""}
Hours: ${spec.hours || ""}
Events: ${events.join(", ") || ""}
Contact Email: ${contact.email || ""}
Contact Phone: ${contact.phone || ""}
Audience: ${spec.audience || "Community members"}
Extra content: ${spec.extras || ""}

Generate the complete HTML now.`;

  try {
    const html = await callClaude([{ role: "user", content: genPrompt }], genSystem, MAX_GEN_TOKENS);

    let cleanedHtml = html.trim();
    if (!cleanedHtml.startsWith("<!DOCTYPE") && !cleanedHtml.startsWith("<html")) {
      const idx = cleanedHtml.indexOf("<!DOCTYPE");
      cleanedHtml = idx >= 0 ? cleanedHtml.substring(idx) : cleanedHtml;
    }

    const metaTitle = (spec.orgName as string) || name;
    const metaDescription = (spec.mission as string) || `Welcome to ${name}`;

    const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));

    let site;
    if (existing) {
      [site] = await db.update(sitesTable)
        .set({ generatedHtml: cleanedHtml, websiteSpec, orgSlug: slug, metaTitle, metaDescription, updatedAt: new Date() })
        .where(eq(sitesTable.orgId, org.id))
        .returning();
    } else {
      [site] = await db.insert(sitesTable)
        .values({ orgId: org.id, orgSlug: slug, generatedHtml: cleanedHtml, websiteSpec, metaTitle, metaDescription, status: "draft" })
        .returning();
    }

    res.json({ site, orgSlug: slug });
  } catch (err) {
    res.status(500).json({ error: "Site generation failed. Please try again." });
  }
});

// ─── Change request (Tier 1+) ─────────────────────────────────────────────────
router.post("/change-request", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const usageInfo = await checkAndResetUsage(org as Parameters<typeof checkAndResetUsage>[0], res);
  if (!usageInfo) return;
  const { used, limit: monthlyLimit } = usageInfo;

  const { changeRequest } = req.body as { changeRequest: string };
  if (!changeRequest?.trim()) { res.status(400).json({ error: "changeRequest is required" }); return; }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.generatedHtml) { res.status(404).json({ error: "No site found — generate one first" }); return; }

  const changeSystem = `You are an expert web developer making targeted edits to an existing HTML website.
The user will describe one specific change. Apply ONLY that change.
Output ONLY the complete, updated HTML document — no explanations, no markdown, no code fences.
Keep all existing styles, sections, and structure intact unless the change requires modifying them.
Your entire response must be a valid HTML document starting with <!DOCTYPE html>.`;

  const changePrompt = `Current website HTML:
${site.generatedHtml}

User's requested change: "${changeRequest}"

Apply this change and output the complete updated HTML.`;

  try {
    const updatedHtml = await callClaude([{ role: "user", content: changePrompt }], changeSystem, MAX_CHANGE_TOKENS);

    let cleanedHtml = updatedHtml.trim();
    if (!cleanedHtml.startsWith("<!DOCTYPE") && !cleanedHtml.startsWith("<html")) {
      const idx = cleanedHtml.indexOf("<!DOCTYPE");
      cleanedHtml = idx >= 0 ? cleanedHtml.substring(idx) : cleanedHtml;
    }

    await db.update(sitesTable).set({ generatedHtml: cleanedHtml, updatedAt: new Date() }).where(eq(sitesTable.orgId, org.id));
    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));

    const newUsed = used + 1;
    res.json({ html: cleanedHtml, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch {
    res.status(500).json({ error: "Change request failed. Please try again." });
  }
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

// ─── Schedule manual run (Tier 1a+) ───────────────────────────────────────────
router.post("/schedule/run", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;
  if (!tierAllowsSchedule(org.tier)) { res.status(403).json({ error: "Schedule requires Tier 1a or higher" }); return; }

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));
  if (!site?.generatedHtml) { res.status(404).json({ error: "No site to update — generate one first" }); return; }

  const [schedule] = await db.select().from(siteUpdateSchedulesTable).where(eq(siteUpdateSchedulesTable.orgId, org.id));
  if (!schedule) { res.status(404).json({ error: "No schedule configured" }); return; }

  const updateItems = schedule.updateItems ?? [];
  const custom = schedule.customInstructions ?? "";

  const updateInstructions: string[] = [];
  if (updateItems.includes("events")) updateInstructions.push("Update the events section with fresh placeholder events for the upcoming month");
  if (updateItems.includes("hours")) updateInstructions.push("Review and update any hours or schedule information to appear current");
  if (updateItems.includes("announcements")) updateInstructions.push("Refresh announcements or news section with a generic 'Stay tuned for updates' message if content is stale");
  if (custom) updateInstructions.push(custom);
  if (updateInstructions.length === 0) updateInstructions.push("Ensure all content appears current and up-to-date");

  const runSystem = `You are an expert web developer autonomously updating an organization's website as part of a scheduled job.
Apply the requested updates to the HTML. Keep all sections, styles, and structure intact.
Output ONLY the complete, updated HTML document starting with <!DOCTYPE html>. No explanations.`;

  const runPrompt = `Current website HTML:
${site.generatedHtml}

Scheduled update instructions:
${updateInstructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

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

    res.json({ html: cleanedHtml, lastRunAt: new Date().toISOString(), nextRunAt: nextRunAt?.toISOString() ?? null });
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
  if (!existing) { res.status(404).json({ error: "No site found — generate one first" }); return; }
  if (!existing.generatedHtml) { res.status(400).json({ error: "Site has no generated content" }); return; }

  const [site] = await db.update(sitesTable)
    .set({ status: publish ? "published" : "draft", publishedAt: publish ? new Date() : null, updatedAt: new Date() })
    .where(eq(sitesTable.orgId, org.id))
    .returning();

  res.json({ site });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeNextRun(frequency: string, dayOfWeek?: string): Date {
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
