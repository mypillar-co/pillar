import { Router, type Request, type Response } from "express";
import { db, organizationsTable, sitesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const CONTEXT_TURNS = 8;
const MAX_CHAT_TOKENS = 600;
const MAX_GEN_TOKENS = 4000;

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

async function callClaude(messages: { role: string; content: string }[], system: string, maxTokens: number) {
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

// ─── Chat assistant ───────────────────────────────────────────────────────────
router.post("/builder", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { message, history = [], orgName, orgType } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const monthlyLimit = getMonthlyLimit(org.tier);
  let used = org.aiMessagesUsed;
  const resetAt = new Date(org.aiMessagesResetAt);

  if (isNewMonth(resetAt)) {
    await db.update(organizationsTable).set({ aiMessagesUsed: 0, aiMessagesResetAt: new Date() }).where(eq(organizationsTable.id, org.id));
    used = 0;
  }

  if (used >= monthlyLimit) {
    res.status(429).json({ error: "monthly_limit_reached", used, limit: monthlyLimit, tier: org.tier });
    return;
  }

  const name = orgName ?? org.name;
  const type = orgType ?? org.type ?? "organization";
  const trimmedHistory = history.slice(-(CONTEXT_TURNS * 2)).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  const systemPrompt = `You are an expert web designer for Steward, a platform for civic organizations, nonprofits, and small businesses.
You help ${name}, a ${type}, plan and describe their public website.
When users describe what they want:
1. Acknowledge their request with specific design suggestions
2. Describe the layout and content structure briefly
3. List the key sections that make sense (hero, about, services, events, sponsors, contact)
4. Suggest a color scheme and tone that fits their organization type
5. Ask one focused clarifying question if needed to gather more info

Be concise and actionable — keep replies under 200 words. When you have enough info (after 2-3 exchanges), suggest the user click "Generate My Site" to build the real site.`;

  try {
    const reply = await callClaude([...trimmedHistory, { role: "user", content: message }], systemPrompt, MAX_CHAT_TOKENS);

    await db.update(organizationsTable).set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` }).where(eq(organizationsTable.id, org.id));
    const newUsed = used + 1;
    res.json({ reply, used: newUsed, limit: monthlyLimit, remaining: monthlyLimit - newUsed });
  } catch (err) {
    const name2 = name;
    const type2 = type;
    res.json({
      reply: `I'm having trouble connecting right now. For ${name2} (a ${type2}), I'd suggest starting with a hero section, an about section, and a contact form. Want me to walk through any of those?`,
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
  res.json({ site: site ?? null, orgSlug: org.slug });
});

// ─── Generate site from chat history ─────────────────────────────────────────
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

  const genSystem = `You are an expert web developer. Generate a complete, beautiful, self-contained HTML page for ${name}, a ${type}.

RULES:
- Output ONLY valid HTML — no markdown, no code fences, no explanation before or after
- All CSS must be inline in a <style> tag in <head>
- No external dependencies — no CDN links, no Google Fonts (use system fonts only)
- Must include these sections in order: hero, about, services/programs, contact, footer
- Make it visually polished with a color scheme appropriate for the org type
- Hero must have the org name prominently and a tagline
- Contact section must have a simple mailto: link
- Footer has the org name and current year
- Use a dark or light theme consistently throughout
- The page must be fully responsive (use CSS flexbox/grid, max-width containers)
- Use semantic HTML (header, main, section, footer, nav)
- Add subtle hover effects on buttons and links
- Do NOT include any JavaScript
- Do NOT include placeholder lorem ipsum text — use realistic content based on the conversation

IMPORTANT: Your entire response must be a single HTML document starting with <!DOCTYPE html>`;

  const conversationSummary = history.length > 0
    ? `Based on this conversation about the website:\n${history.map(m => `${m.role}: ${m.content}`).join("\n")}`
    : `Generate a professional website for ${name}, a ${type}.`;

  try {
    const html = await callClaude(
      [{ role: "user", content: conversationSummary }],
      genSystem,
      MAX_GEN_TOKENS,
    );

    const cleanedHtml = html.trim().startsWith("<!DOCTYPE") ? html.trim() :
      html.trim().startsWith("<html") ? html.trim() :
      html.substring(html.indexOf("<!DOCTYPE")).trim();

    const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.orgId, org.id));

    let site;
    if (existing) {
      [site] = await db.update(sitesTable)
        .set({ generatedHtml: cleanedHtml, orgSlug: slug, metaTitle: name, metaDescription: `Welcome to ${name}`, updatedAt: new Date() })
        .where(eq(sitesTable.orgId, org.id))
        .returning();
    } else {
      [site] = await db.insert(sitesTable)
        .values({ orgId: org.id, orgSlug: slug, generatedHtml: cleanedHtml, metaTitle: name, metaDescription: `Welcome to ${name}`, status: "draft" })
        .returning();
    }

    res.json({ site, orgSlug: slug });
  } catch (err) {
    res.status(500).json({ error: "Site generation failed. Please try again." });
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

export default router;
