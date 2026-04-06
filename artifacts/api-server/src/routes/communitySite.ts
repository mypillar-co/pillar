import { Router, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { resolveFullOrg } from "../lib/resolveOrg";
import OpenAI from "openai";

const router = Router();

const CONTEXT_TURNS = 12;
const MAX_INTERVIEW_TOKENS = 600;
const MAX_PAYLOAD_TOKENS = 2000;

function getOpenAIClient() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI integration not configured.");
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

async function callAI(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<string> {
  const client = getOpenAIClient();
  const response = await (client.chat.completions.create as (p: Record<string, unknown>) => Promise<OpenAI.ChatCompletion>)({
    model: "gpt-5-mini",
    max_completion_tokens: maxTokens,
    messages,
  });
  return response.choices[0]?.message?.content ?? "";
}

// ── Color palette (hex) for each org type ───────────────────────────────────
const ORG_COLORS: Record<string, { primary: string; accent: string }> = {
  "Main Street / Downtown Association": { primary: "#c25038", accent: "#2b7ab5" },
  "Chamber of Commerce":               { primary: "#1a4a8a", accent: "#d4a017" },
  "Rotary Club":                        { primary: "#003DA5", accent: "#d4a017" },
  "Lions Club":                         { primary: "#d4a017", accent: "#1a4a8a" },
  "VFW / American Legion":             { primary: "#8b1a1a", accent: "#2b5797" },
  "PTA / PTO":                          { primary: "#339966", accent: "#7a3d9e" },
  "Community Foundation":               { primary: "#2d8a57", accent: "#2b7ab5" },
  "Neighborhood Association":           { primary: "#c26a17", accent: "#338899" },
  "Arts Council":                       { primary: "#7a3d9e", accent: "#cc3366" },
  "Other":                              { primary: "#2b7ab5", accent: "#2d8a57" },
};

const INTERVIEW_SYSTEM_PROMPT = `You are a friendly site setup specialist for Pillar — an AI platform that configures community organization websites.

You are running the intake interview for a NEW organization. Your job is to ask the 24 questions below ONE AT A TIME, conversationally. Keep responses under 60 words. Acknowledge each answer briefly before asking the next question. Skip any question the user already answered.

If the user mentions they have an existing website URL at ANY point, stop interviewing and say: "Great — use the **Import from website** button to pull your content automatically. I'll only ask for anything it missed."

INTERVIEW QUESTIONS (ask in order, skip if already answered):

BLOCK 1 — IDENTITY
1. What is the full name of your organization?
2. What is the short name or abbreviation? (e.g. "NRC", "IBPA", "VFW Post 1")
3. What is your tagline or one-sentence mission statement?
4. What type of organization are you? Options: Main Street / Downtown Association | Chamber of Commerce | Rotary Club | Lions Club | VFW / American Legion | PTA / PTO | Community Foundation | Neighborhood Association | Arts Council | Other

BLOCK 2 — LOCATION & CONTACT
5. What city and state are you in?
6. What is your physical address?
7. Do you have a separate mailing address? (skip if same)
8. What is your main phone number?
9. What is your main contact email?
10. Do you have a separate email for events/inquiries? (optional)
11. What is your Facebook page URL? (optional)
12. What is your Instagram URL? (optional)

BLOCK 3 — BRANDING
13. What 2–3 letter abbreviation should appear on your logo badge? (e.g. "DI" for Discover Irwin)

BLOCK 4 — STATS
14. Approximately how many events does your organization host per year?
15. Approximately how many total attendees across all events?
16. How many local businesses, members, or programs does your org have? (used for a stats card)

BLOCK 5 — FEATURES
17. Do you accept event sponsors? (yes/no)
18. Do your events have vendor registration? (yes/no)
19. Do any events sell tickets? (yes/no — if yes, we use Stripe)
20. Do you want a News & Updates / Blog section? (yes/no)
21. Do you want email newsletter signup? (yes/no)

BLOCK 6 — CONTENT
22. List your community partners (name + one-line description each)
23. What categories do your events fall into? (e.g. Festival, Fundraiser, Meeting)
24. Describe your regular meeting schedule, if any (day, time, location)

────────────────────────────────────────────────────────────────────
WHEN ALL QUESTIONS ARE ANSWERED:

Say: "I have everything I need! I'll build the setup payload now."

Then output EXACTLY this on its own line:
[PAYLOAD_READY]

Then output the complete JSON payload on the next line. The payload must follow this exact structure:
{
  "orgName": "<full name>",
  "shortName": "<abbreviation>",
  "orgType": "<type — use: civic | chamber | rotary | lions | vfw | pta | foundation | neighborhood | arts | community>",
  "tagline": "<tagline>",
  "mission": "<expand tagline to 1-2 sentences>",
  "location": "<City, ST>",
  "primaryColor": "<hex from palette below>",
  "accentColor": "<hex from palette below>",
  "contactEmail": "<email>",
  "contactPhone": "<phone>",
  "contactAddress": "<address>",
  "mailingAddress": "<mailing if different, else null>",
  "website": "<website if provided, else null>",
  "socialFacebook": "<url or null>",
  "socialInstagram": "<url or null>",
  "meetingDay": "<e.g. Every Tuesday or null>",
  "meetingTime": "<e.g. 12:00 PM - 1:30 PM or null>",
  "meetingLocation": "<venue name or null>",
  "footerText": "<short org description for footer>",
  "metaDescription": "<SEO description>",
  "stats": [
    { "value": "<annual_events>", "label": "Annual Events" },
    { "value": "<annual_attendees>", "label": "Annual Attendees" },
    { "value": "<members_or_businesses>", "label": "<Active Members OR Local Businesses>" },
    { "value": "100%", "label": "Volunteer Run" }
  ],
  "programs": [],
  "partners": [<{ "name": "...", "description": "...", "website": null }>],
  "sponsorshipLevels": [],
  "events": [],
  "sponsors": [],
  "siteContent": {
    "home_tagline": "<tagline>",
    "home_intro": "<mission>",
    "home_subtitle": "<org type label>",
    "contact_address": "<address>",
    "contact_phone": "<phone>",
    "contact_email": "<email>",
    "social_facebook": "<facebook or empty>",
    "social_instagram": "<instagram or empty>",
    "about_mission": "<2-3 paragraph mission>",
    "community_partners": "<JSON string of partners array>"
  }
}

COLOR PALETTE (use exact hex values):
Main Street / Downtown Association → primary #c25038 / accent #2b7ab5
Chamber of Commerce → primary #1a4a8a / accent #d4a017
Rotary Club → primary #003DA5 / accent #d4a017
Lions Club → primary #d4a017 / accent #1a4a8a
VFW / American Legion → primary #8b1a1a / accent #2b5797
PTA / PTO → primary #339966 / accent #7a3d9e
Community Foundation → primary #2d8a57 / accent #2b7ab5
Neighborhood Association → primary #c26a17 / accent #338899
Arts Council → primary #7a3d9e / accent #cc3366
Other → primary #2b7ab5 / accent #2d8a57

IMPORTANT: Always use Stripe for payment_provider, never Square.`;

// ── GET /api/community-site/target ──────────────────────────────────────────
router.get("/target", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  try {
    const row = await db.execute(sql`
      SELECT community_site_url, community_site_key FROM organizations WHERE id = ${org.id} LIMIT 1
    `);
    const r = row.rows[0] as Record<string, string | null> | undefined;
    res.json({
      url: r?.community_site_url ?? null,
      hasKey: !!r?.community_site_key,
    });
  } catch {
    res.json({ url: null, hasKey: false });
  }
});

// ── PUT /api/community-site/target ──────────────────────────────────────────
router.put("/target", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { url, key } = req.body as { url?: string; key?: string };
  if (!url?.trim()) { res.status(400).json({ error: "url is required" }); return; }

  try {
    if (key?.trim()) {
      await db.execute(sql`
        UPDATE organizations
        SET community_site_url = ${url.trim()}, community_site_key = ${key.trim()}
        WHERE id = ${org.id}
      `);
    } else {
      await db.execute(sql`
        UPDATE organizations
        SET community_site_url = ${url.trim()}
        WHERE id = ${org.id}
      `);
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save target config" });
  }
});

// ── POST /api/community-site/interview ──────────────────────────────────────
router.post("/interview", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { message, history = [], prefilled } = req.body as {
    message: string;
    history: { role: string; content: string }[];
    prefilled?: Record<string, string>;
  };

  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const trimmedHistory = history.slice(-(CONTEXT_TURNS * 2));

  let systemPrompt = INTERVIEW_SYSTEM_PROMPT;

  if (prefilled && Object.keys(prefilled).length > 0) {
    const lines = Object.entries(prefilled)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    systemPrompt += `\n\nPRE-FILLED FROM WEBSITE CRAWL (skip these questions — already answered):\n${lines}`;
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const isPayloadReady = trimmedHistory.some(m => m.role === "assistant" && m.content.includes("[PAYLOAD_READY]"));
    const maxTokens = isPayloadReady ? MAX_PAYLOAD_TOKENS : MAX_INTERVIEW_TOKENS;

    const reply = await callAI(messages, maxTokens);
    if (!reply) { res.status(500).json({ error: "Empty AI response" }); return; }

    await db.update(organizationsTable)
      .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
      .where(eq(organizationsTable.id, org.id));

    res.json({ reply });
  } catch {
    res.status(500).json({ error: "AI service unavailable" });
  }
});

// ── POST /api/community-site/provision ──────────────────────────────────────
router.post("/provision", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { payload } = req.body as { payload: Record<string, unknown> };
  if (!payload || typeof payload !== "object") {
    res.status(400).json({ error: "payload is required" });
    return;
  }

  try {
    const row = await db.execute(sql`
      SELECT community_site_url, community_site_key FROM organizations WHERE id = ${org.id} LIMIT 1
    `);
    const r = row.rows[0] as Record<string, string | null> | undefined;
    const siteUrl = r?.community_site_url;
    const siteKey = r?.community_site_key;

    if (!siteUrl) { res.status(400).json({ error: "No community site URL configured. Set it in Site Connection settings." }); return; }
    if (!siteKey) { res.status(400).json({ error: "No community site service key configured." }); return; }

    const endpoint = `${siteUrl.replace(/\/$/, "")}/api/pillar/setup`;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pillar-Key": siteKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await upstream.json() as Record<string, unknown>;

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data.error as string) ?? "Provision failed" });
      return;
    }

    res.json({ ok: true, result: data, siteUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Provision failed: ${msg}` });
  }
});

export { ORG_COLORS };
export default router;
