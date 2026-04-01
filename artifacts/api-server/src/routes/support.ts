import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, supportTicketsTable, organizationsTable, usersTable } from "@workspace/db";
import { eq, desc, and, isNotNull, asc } from "drizzle-orm";
import { getFullOrgForUser } from "../lib/resolveOrg";

const router = Router();

const ADMIN_USER_IDS = new Set((process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean));
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));

const PILLAR_SYSTEM_PROMPT = `You are the Pillar support assistant — a friendly, knowledgeable helper for Pillar, an AI-powered management platform for civic organizations (nonprofits, community groups, HOAs, unions, clubs, etc.).

Pillar's key features:
- **Events**: Create and manage events, sell tickets, track attendance, handle board approvals
- **Social Media**: Connect Facebook, Instagram, and X. Schedule posts, create drafts, automate posting, AI-generated content
- **Payments**: Connect Stripe, collect dues, accept donations, generate financial reports
- **Site Builder**: Build and publish a public website for your organization with AI-generated content
- **Contacts**: Manage member and contact lists
- **Vendors & Sponsors**: Track vendors and sponsors for events
- **Content Studio**: AI-powered newsletter and content generation
- **Board Approval**: Digital board approval workflows with voting links
- **Domain**: Connect a custom domain to your site

Subscription tiers:
- **Starter** ($29/mo): Events, Payments, Site Builder, Contacts, Vendors, Sponsors
- **Autopilot** ($59/mo): Everything in Starter + Social Media
- **Events** ($99/mo): Everything in Autopilot + Events plan features
- **Total Operations** ($149/mo): Everything including full AI features

All plans include a 14-day free trial. Users can cancel anytime.

Common issues and solutions:
- Social media page shows upgrade gate → They need at least the Autopilot tier ($59/mo)
- Cannot connect social accounts → They need to go to Social > Accounts tab and click Connect for each platform
- Site not publishing → Check if they've clicked "Publish" in Site Builder
- Stripe not connected → Go to Payments page and click "Connect with Stripe"
- Event tickets not selling → Ensure ticket types are created and the event is published
- Can't see board approval → Available under the Board Approval section in the sidebar
- Custom domain not working → DNS propagation can take 24-48 hours after setup

You are helpful, concise, and solution-oriented. If you cannot resolve the issue, suggest the user submit a bug report using the form below the chat. Keep responses under 200 words unless the question is complex.`;

router.post("/chat", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { message, history } = req.body as {
    message: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI support is not configured" });
    return;
  }

  const anthropic = new Anthropic({ apiKey });

  const chatMessages: { role: "user" | "assistant"; content: string }[] = [
    ...(history ?? []).slice(-6),
    { role: "user", content: message.trim() },
  ];

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: PILLAR_SYSTEM_PROMPT,
      messages: chatMessages,
    });

    const block = response.content[0];
    const reply = block.type === "text" ? block.text : "Sorry, I couldn't process that.";
    res.json({ reply });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `AI error: ${msg}` });
  }
});

router.post("/tickets", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { subject, description, severity } = req.body as {
    subject?: string;
    description?: string;
    severity?: string;
  };

  if (!subject?.trim() || !description?.trim()) {
    res.status(400).json({ error: "subject and description are required" });
    return;
  }

  const validSeverities = ["low", "normal", "high", "critical"];
  const sev = validSeverities.includes(severity ?? "") ? severity! : "normal";

  const userId = req.user.id;
  const org = await getFullOrgForUser(userId);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const [ticket] = await db.insert(supportTicketsTable).values({
    orgId: org?.id ?? null,
    userId,
    orgName: org?.name ?? null,
    userEmail: user?.email ?? null,
    subject: subject.trim(),
    description: description.trim(),
    severity: sev,
    status: "open",
  }).returning();

  res.status(201).json(ticket);
});

router.get("/tickets", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userEmailGet = req.user.email?.toLowerCase() ?? "";
  if (!ADMIN_USER_IDS.has(req.user.id) && !ADMIN_EMAILS.has(userEmailGet)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .orderBy(desc(supportTicketsTable.createdAt));

  res.json(tickets);
});

router.put("/tickets/:id", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userEmailPut = req.user.email?.toLowerCase() ?? "";
  if (!ADMIN_USER_IDS.has(req.user.id) && !ADMIN_EMAILS.has(userEmailPut)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { status, adminNotes } = req.body as { status?: string; adminNotes?: string };

  const validStatuses = ["open", "in_progress", "resolved", "closed"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status && validStatuses.includes(status)) updates.status = status;
  if (typeof adminNotes === "string") updates.adminNotes = adminNotes;

  const [ticket] = await db
    .update(supportTicketsTable)
    .set(updates)
    .where(eq(supportTicketsTable.id, req.params.id))
    .returning();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(ticket);
});

export default router;
