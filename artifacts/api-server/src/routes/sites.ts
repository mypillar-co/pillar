import { Router, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function resolveOrg(req: Request, res: Response): Promise<{ id: string; name: string; orgType: string | null } | null> {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [org] = await db.select({ id: organizationsTable.id, name: organizationsTable.name, orgType: organizationsTable.type })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, req.user.id));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
}

// POST /api/sites/builder — AI chat for site building
router.post("/builder", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  const { message, history = [], orgName, orgType } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    orgName?: string;
    orgType?: string;
  };

  if (!message) { res.status(400).json({ error: "message is required" }); return; }

  const name = orgName ?? org.name;
  const type = orgType ?? org.orgType ?? "organization";

  const systemPrompt = `You are an expert web designer and site builder for Steward, a platform for civic organizations. 
You help ${name}, a ${type}, build their public website.
When users describe what they want, you:
1. Acknowledge their request with specific design suggestions
2. Describe the layout and content structure you'll create
3. List the blocks/sections that will make up their site (hero, text, events_list, sponsors_grid, contact_form)
4. Suggest color schemes and typography that match their organization type
5. Ask clarifying questions if needed to refine the design

Keep responses concise and actionable. Focus on the organization's brand and mission.`;

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      req.log?.error({ status: response.status, errorText }, "Anthropic API error");
      res.json({ reply: `I'm having trouble connecting right now. Here's what I'd suggest for your ${type}: Start with a hero section featuring your name and mission, followed by an upcoming events list, and a contact form. Would you like me to help you structure any specific section?` });
      return;
    }

    const data = await response.json() as { content: { type: string; text: string }[] };
    const reply = data.content?.[0]?.text ?? "I couldn't generate a response. Please try again.";
    res.json({ reply });
  } catch (err) {
    req.log?.error({ err }, "Site builder AI error");
    res.json({ reply: `I'm having trouble connecting right now. Here's what I'd suggest for your ${type}: Start with a hero section featuring your name and mission, followed by an upcoming events list, and a contact form. Would you like me to help you structure any specific section?` });
  }
});

export default router;
