import { Router, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const CONTEXT_TURNS = 8;
const MAX_OUTPUT_TOKENS = 600;

const MONTHLY_LIMITS: Record<string, number> = {
  tier1: 30,
  tier1a: 75,
  tier2: 75,
  tier3: 200,
  default: 15,
};

function getMonthlyLimit(tier: string | null | undefined): number {
  if (!tier) return MONTHLY_LIMITS.default;
  return MONTHLY_LIMITS[tier] ?? MONTHLY_LIMITS.default;
}

async function resolveOrg(req: Request, res: Response) {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db.select()
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
}

function isNewMonth(resetAt: Date): boolean {
  const now = new Date();
  return now.getFullYear() !== resetAt.getFullYear() || now.getMonth() !== resetAt.getMonth();
}

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
    await db.update(organizationsTable)
      .set({ aiMessagesUsed: 0, aiMessagesResetAt: new Date() })
      .where(eq(organizationsTable.id, org.id));
    used = 0;
  }

  if (used >= monthlyLimit) {
    res.status(429).json({
      error: "monthly_limit_reached",
      used,
      limit: monthlyLimit,
      tier: org.tier,
    });
    return;
  }

  const trimmedHistory = history
    .slice(-(CONTEXT_TURNS * 2))
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const name = orgName ?? org.name;
  const type = orgType ?? org.type ?? "organization";

  const systemPrompt = `You are an expert web designer for Steward, a platform for civic organizations.
You help ${name}, a ${type}, build their public website.
When users describe what they want, you:
1. Acknowledge their request with specific design suggestions
2. Describe the layout and content structure briefly
3. List the key sections (hero, text, events_list, sponsors_grid, contact_form)
4. Suggest a color scheme and tone that fits their organization type
5. Ask one focused clarifying question if needed

Be concise and actionable — keep replies under 200 words. Focus on what matters to the organization.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [
          ...trimmedHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      req.log?.error({ status: response.status, errorText }, "Anthropic API error");
      res.json({
        reply: `I'm having trouble connecting right now. For a ${type}, I'd suggest starting with a hero section, an events list, and a contact form. Want me to walk through any of those?`,
        used,
        limit: monthlyLimit,
        remaining: monthlyLimit - used,
      });
      return;
    }

    const data = await response.json() as { content: { type: string; text: string }[] };
    const reply = data.content?.[0]?.text ?? "I couldn't generate a response. Please try again.";

    await db.update(organizationsTable)
      .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
      .where(eq(organizationsTable.id, org.id));

    const newUsed = used + 1;
    res.json({
      reply,
      used: newUsed,
      limit: monthlyLimit,
      remaining: monthlyLimit - newUsed,
    });
  } catch (err) {
    req.log?.error({ err }, "Site builder AI error");
    res.json({
      reply: `I'm having trouble connecting right now. For a ${type}, I'd suggest a hero section, an events list, and a contact form. Want to walk through any of those?`,
      used,
      limit: monthlyLimit,
      remaining: monthlyLimit - used,
    });
  }
});

router.get("/builder/usage", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const monthlyLimit = getMonthlyLimit(org.tier);
  let used = org.aiMessagesUsed;
  const resetAt = new Date(org.aiMessagesResetAt);

  if (isNewMonth(resetAt)) {
    await db.update(organizationsTable)
      .set({ aiMessagesUsed: 0, aiMessagesResetAt: new Date() })
      .where(eq(organizationsTable.id, org.id));
    used = 0;
  }

  res.json({ used, limit: monthlyLimit, remaining: monthlyLimit - used, tier: org.tier });
});

export default router;
